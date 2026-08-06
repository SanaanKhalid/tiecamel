import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { requireRepositoryAccess } from "./lib/platformAuth";

export const queueForCommit = internalMutation({
	args: {
		repositoryCommitId: v.id("repositoryCommits"),
		publicSnapshotId: v.optional(v.id("publicRepositorySnapshots")),
	},
	handler: async (ctx, args) => {
		const commit = await ctx.db.get(args.repositoryCommitId);
		if (!commit) return null;
		const version = await ctx.db.get(commit.recordVersionId);
		if (!version) return null;
		const idempotencyKey = `anchor:commit:v2:${commit.commitSha256}`;
		const existing = await ctx.db
			.query("integrityAnchors")
			.withIndex("by_idempotency_key", (q) =>
				q.eq("idempotencyKey", idempotencyKey),
			)
			.unique();
		if (existing) return existing._id;
		const network =
			process.env.SOLANA_NETWORK === "mainnet-beta"
				? ("mainnet-beta" as const)
				: ("devnet" as const);
		const now = Date.now();
		const anchorId = await ctx.db.insert("integrityAnchors", {
			organizationId: commit.organizationId,
			repositoryId: commit.repositoryId,
			recordId: version.recordId,
			recordVersionId: version._id,
			repositoryCommitId: commit._id,
			publicSnapshotId: args.publicSnapshotId,
			idempotencyKey,
			algorithm: "sha256",
			commitment: commit.commitSha256,
			manifestSha256: commit.commitSha256,
			proofFormat: "tiecamel-repository-commit/v2",
			memo: `tiecamel:commit:v2:${commit.commitSha256}`,
			network,
			status: "queued",
			attempts: 0,
			createdAt: now,
			updatedAt: now,
		});
		if (args.publicSnapshotId) {
			await ctx.db.patch(args.publicSnapshotId, {
				integrityAnchorId: anchorId,
			});
		}
		await ctx.scheduler.runAfter(0, internal.integrity.dispatch, {
			integrityAnchorId: anchorId,
		});
		return anchorId;
	},
});

export const queueForPublishedVersion = internalMutation({
	args: {
		recordVersionId: v.id("recordVersions"),
		publicSnapshotId: v.id("publicRepositorySnapshots"),
	},
	handler: async (ctx, args) => {
		const [version, snapshot] = await Promise.all([
			ctx.db.get(args.recordVersionId),
			ctx.db.get(args.publicSnapshotId),
		]);
		if (
			!version?.manifestSha256 ||
			!snapshot ||
			snapshot.recordVersionId !== version._id
		) {
			return null;
		}
		const [repository, rules] = await Promise.all([
			ctx.db.get(version.repositoryId),
			ctx.db
				.query("repositoryRules")
				.withIndex("by_repository", (q) =>
					q.eq("repositoryId", version.repositoryId),
				)
				.unique(),
		]);
		if (
			repository?.visibility !== "public" ||
			repository.kind !== "transparency" ||
			!rules?.publicIntegrityAnchoring
		) {
			return null;
		}
		const idempotencyKey = `anchor:${version._id}:${version.manifestSha256}`;
		const existing = await ctx.db
			.query("integrityAnchors")
			.withIndex("by_idempotency_key", (q) =>
				q.eq("idempotencyKey", idempotencyKey),
			)
			.unique();
		if (existing) return existing._id;
		const network =
			process.env.SOLANA_NETWORK === "mainnet-beta"
				? ("mainnet-beta" as const)
				: ("devnet" as const);
		const now = Date.now();
		const anchorId = await ctx.db.insert("integrityAnchors", {
			organizationId: version.organizationId,
			repositoryId: version.repositoryId,
			recordId: version.recordId,
			recordVersionId: version._id,
			publicSnapshotId: snapshot._id,
			idempotencyKey,
			algorithm: "sha256",
			commitment: version.manifestSha256,
			manifestSha256: version.manifestSha256,
			memo: `tiecamel:v1:${version.manifestSha256}`,
			network,
			status: "queued",
			attempts: 0,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.patch(snapshot._id, { integrityAnchorId: anchorId });
		await ctx.scheduler.runAfter(0, internal.integrity.dispatch, {
			integrityAnchorId: anchorId,
		});
		return anchorId;
	},
});

export const getCommand = internalQuery({
	args: { integrityAnchorId: v.id("integrityAnchors") },
	handler: async (ctx, args) => {
		const anchor = await ctx.db.get(args.integrityAnchorId);
		if (!anchor) return null;
		return {
			commandId: String(anchor._id),
			integrityAnchorId: String(anchor._id),
			idempotencyKey: anchor.idempotencyKey,
			network: anchor.network,
			commitment: anchor.commitment,
			manifestSha256: anchor.manifestSha256,
			memo: anchor.memo,
			proofFormat: anchor.proofFormat,
			repositoryCommitId: anchor.repositoryCommitId
				? String(anchor.repositoryCommitId)
				: undefined,
			commitManifest: anchor.repositoryCommitId
				? (await ctx.db.get(anchor.repositoryCommitId))?.commitManifest
				: undefined,
			treeManifest: anchor.repositoryCommitId
				? (await ctx.db.get(anchor.repositoryCommitId))?.treeManifest
				: undefined,
		};
	},
});

export const dispatch = internalAction({
	args: { integrityAnchorId: v.id("integrityAnchors") },
	handler: async (ctx, args) => {
		const command = await ctx.runQuery(internal.integrity.getCommand, args);
		if (!command) return;
		const baseUrl = process.env.AZURE_INTEGRATION_URL;
		const token = process.env.AZURE_INTEGRATION_TOKEN;
		if (!baseUrl || !token) {
			await ctx.runMutation(internal.integrity.recordFailure, {
				integrityAnchorId: args.integrityAnchorId,
				code: "INTEGRITY_SERVICE_NOT_CONFIGURED",
				message: "The integrity service is not configured.",
			});
			return;
		}
		await ctx.runMutation(internal.integrity.markRunning, args);
		try {
			const response = await fetch(`${baseUrl.replace(/\/$/, "")}/anchors`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(command),
			});
			if (!response.ok) {
				throw new Error(
					`Integrity verification could not be started (${response.status}).`,
				);
			}
			const accepted = (await response.json()) as { commandId?: string };
			await ctx.runMutation(internal.integrity.recordAccepted, {
				integrityAnchorId: args.integrityAnchorId,
				commandId: accepted.commandId ?? command.commandId,
			});
		} catch (error) {
			await ctx.runMutation(internal.integrity.recordFailure, {
				integrityAnchorId: args.integrityAnchorId,
				code: "ANCHOR_INTAKE_FAILED",
				message:
					error instanceof Error
						? error.message
						: "Integrity verification could not be started.",
			});
		}
	},
});

export const markRunning = internalMutation({
	args: { integrityAnchorId: v.id("integrityAnchors") },
	handler: async (ctx, args) => {
		const anchor = await ctx.db.get(args.integrityAnchorId);
		if (!anchor || anchor.status === "anchored") return;
		await ctx.db.patch(anchor._id, {
			status: "running",
			attempts: anchor.attempts + 1,
			errorCode: undefined,
			errorMessage: undefined,
			updatedAt: Date.now(),
		});
	},
});

export const recordAccepted = internalMutation({
	args: {
		integrityAnchorId: v.id("integrityAnchors"),
		commandId: v.string(),
	},
	handler: async (ctx, args) => {
		const anchor = await ctx.db.get(args.integrityAnchorId);
		if (!anchor || anchor.status === "anchored") return;
		await ctx.db.patch(anchor._id, {
			commandId: args.commandId,
			updatedAt: Date.now(),
		});
	},
});

export const recordFailure = internalMutation({
	args: {
		integrityAnchorId: v.id("integrityAnchors"),
		code: v.string(),
		message: v.string(),
	},
	handler: async (ctx, args) => {
		const anchor = await ctx.db.get(args.integrityAnchorId);
		if (!anchor || anchor.status === "anchored") return;
		await ctx.db.patch(anchor._id, {
			status: "failed",
			errorCode: args.code,
			errorMessage: args.message,
			updatedAt: Date.now(),
		});
	},
});

export const finalize = internalMutation({
	args: {
		integrityAnchorId: v.id("integrityAnchors"),
		idempotencyKey: v.string(),
		signature: v.string(),
		slot: v.number(),
		explorerUrl: v.string(),
		observedMemo: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const anchor = await ctx.db.get(args.integrityAnchorId);
		if (!anchor || anchor.idempotencyKey !== args.idempotencyKey) {
			throw new Error("Integrity anchor not found");
		}
		if (anchor.status === "anchored") return anchor._id;
		const now = Date.now();
		await ctx.db.patch(anchor._id, {
			status: "anchored",
			signature: args.signature,
			slot: args.slot,
			explorerUrl: args.explorerUrl,
			observedMemo: args.observedMemo ?? anchor.memo,
			errorCode: undefined,
			errorMessage: undefined,
			anchoredAt: now,
			updatedAt: now,
		});
		const snapshot = anchor.publicSnapshotId
			? await ctx.db.get(anchor.publicSnapshotId)
			: null;
		if (snapshot) {
			await ctx.db.insert("platformNotifications", {
				organizationId: anchor.organizationId,
				membershipId: snapshot.publishedBy,
				repositoryId: anchor.repositoryId,
				type: "integrity",
				title: "Public record independently verified",
				body: "The accepted repository commit was anchored on Solana.",
				targetType: "record",
				targetId: String(anchor.recordId),
				createdAt: now,
			});
		}
		await ctx.db.insert("auditEvents", {
			organizationId: anchor.organizationId,
			action: "Repository commit anchored",
			targetType: anchor.repositoryCommitId
				? "repository-commit"
				: "record-version",
			targetId: String(anchor.repositoryCommitId ?? anchor.recordVersionId),
			reason: `${anchor.network} transaction ${args.signature} committed ${anchor.memo}.`,
			source: "Solana integrity worker",
			createdAt: now,
		});
		return anchor._id;
	},
});

export const getPublicVerification = query({
	args: { recordVersionId: v.id("recordVersions") },
	handler: async (ctx, args) => {
		const anchor = await ctx.db
			.query("integrityAnchors")
			.withIndex("by_record_version", (q) =>
				q.eq("recordVersionId", args.recordVersionId),
			)
			.unique();
		if (!anchor?.publicSnapshotId) return null;
		return publicAnchor(anchor);
	},
});

export const retry = mutation({
	args: {
		integrityAnchorId: v.id("integrityAnchors"),
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const anchor = await ctx.db.get(args.integrityAnchorId);
		if (!anchor) throw new Error("Integrity anchor not found");
		await requireRepositoryAccess(
			ctx,
			anchor.repositoryId,
			"admin",
			args.demoSessionToken,
		);
		if (anchor.status !== "failed") {
			throw new Error("Only failed integrity anchors can be retried");
		}
		const now = Date.now();
		await ctx.db.patch(anchor._id, {
			status: "queued",
			errorCode: undefined,
			errorMessage: undefined,
			updatedAt: now,
		});
		await ctx.scheduler.runAfter(0, internal.integrity.dispatch, {
			integrityAnchorId: anchor._id,
		});
		return { ok: true as const };
	},
});

export function publicAnchor(anchor: {
	status: "queued" | "running" | "anchored" | "failed";
	algorithm: "sha256";
	commitment: string;
	manifestSha256: string;
	network: "devnet" | "mainnet-beta";
	signature?: string;
	slot?: number;
	explorerUrl?: string;
	anchoredAt?: number;
}) {
	return {
		status: anchor.status,
		algorithm: anchor.algorithm,
		commitment: anchor.commitment,
		manifestSha256: anchor.manifestSha256,
		network: anchor.network,
		signature: anchor.signature,
		slot: anchor.slot,
		explorerUrl: anchor.explorerUrl,
		anchoredAt: anchor.anchoredAt,
	};
}

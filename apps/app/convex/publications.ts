import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
	type MutationCtx,
	mutation,
	query,
} from "./_generated/server";
import { requireRepositoryAccess } from "./lib/platformAuth";

const publicationResult = v.object({
	provider: v.union(
		v.literal("azure"),
		v.literal("google-drive"),
		v.literal("one-drive"),
	),
	azureEvidenceRef: v.string(),
	publicationManifestRef: v.string(),
	sha256: v.string(),
	externalFileId: v.optional(v.string()),
	externalVersionId: v.optional(v.string()),
	externalUrl: v.optional(v.string()),
	etag: v.optional(v.string()),
});

export const getForChange = query({
	args: { changeRequestId: v.id("changeRequests") },
	handler: async (ctx, args) => {
		const change = await ctx.db.get(args.changeRequestId);
		if (!change) return null;
		await requireRepositoryAccess(ctx, change.repositoryId);
		return ctx.db
			.query("publicationJobs")
			.withIndex("by_change_request", (q) =>
				q.eq("changeRequestId", change._id),
			)
			.order("desc")
			.first();
	},
});

export const request = mutation({
	args: { changeRequestId: v.id("changeRequests") },
	handler: async (ctx, args) => {
		const change = await ctx.db.get(args.changeRequestId);
		if (!change) {
			return failure("NOT_FOUND", "Change request not found");
		}
		const session = await requireRepositoryAccess(
			ctx,
			change.repositoryId,
			"review",
		);
		if (!change.headRevisionId) {
			return failure("NO_REVISION", "No revision is ready to publish");
		}
		if (change.status === "merged") {
			return {
				ok: true as const,
				state: "merged" as const,
				recordId: change.targetRecordId,
			};
		}
		if (change.status === "closed") {
			return failure("CLOSED", "Closed changes cannot be published");
		}
		const rules = await ctx.db
			.query("repositoryRules")
			.withIndex("by_repository", (q) =>
				q.eq("repositoryId", change.repositoryId),
			)
			.unique();
		if (!rules) return failure("RULES_MISSING", "Repository rules are missing");
		const effectiveRole =
			session.membership.role === "administrator"
				? "organization-admin"
				: session.membership.role === "owner"
					? "organization-owner"
					: session.repositoryRole;
		if (!effectiveRole || !rules.finalizerRoles.includes(effectiveRole)) {
			return failure(
				"FINALIZER_REQUIRED",
				"Your role cannot publish changes in this repository",
			);
		}
		const [reviews, checks, labels, files, storageConfig] = await Promise.all([
			ctx.db
				.query("changeReviews")
				.withIndex("by_change_request", (q) =>
					q.eq("changeRequestId", change._id),
				)
				.collect(),
			ctx.db
				.query("checkRuns")
				.withIndex("by_change_request", (q) =>
					q.eq("changeRequestId", change._id),
				)
				.collect(),
			Promise.all(change.labelIds.map((labelId) => ctx.db.get(labelId))),
			ctx.db
				.query("changeFiles")
				.withIndex("by_revision", (q) =>
					q.eq("revisionId", change.headRevisionId as Id<"changeRevisions">),
				)
				.collect(),
			ctx.db
				.query("repositoryStorageConfigs")
				.withIndex("by_repository", (q) =>
					q.eq("repositoryId", change.repositoryId),
				)
				.unique(),
		]);
		if (!(await approvalsSatisfyRules(ctx, change, reviews, rules))) {
			return failure(
				"APPROVALS_MISSING",
				"Required independent approvals are missing",
			);
		}
		if (
			checks.some(
				(check) =>
					check.required &&
					check.conclusion !== "passed" &&
					check.conclusion !== "warning",
			)
		) {
			return failure("CHECKS_BLOCKED", "A required check is not complete");
		}
		if (rules.requireResolvedThreads && change.unresolvedThreads > 0) {
			return failure(
				"THREADS_UNRESOLVED",
				"Resolve blocking review threads before publishing",
			);
		}
		if (change.outOfDate) {
			return failure(
				"OUT_OF_DATE",
				"Update this change against the accepted record first",
			);
		}
		if (labels.some((label) => label?.blocksMerge)) {
			return failure(
				"BLOCKING_LABEL",
				"A protected label is blocking this publication",
			);
		}
		if (!storageConfig || storageConfig.health !== "healthy") {
			return failure(
				"DESTINATION_UNAVAILABLE",
				"Repository storage is not configured or needs attention",
			);
		}
		const primaryFiles = files.filter((file) => file.role === "primary");
		if (primaryFiles.length !== 1) {
			return failure(
				"PRIMARY_DOCUMENT_REQUIRED",
				"Exactly one processed primary document is required",
			);
		}
		if (primaryFiles[0].processingStatus !== "ready") {
			return failure(
				"PROCESSING_INCOMPLETE",
				"The primary document has not finished processing",
			);
		}
		if (change.targetRecordId) {
			const record = await ctx.db.get(change.targetRecordId);
			if (!record || record.currentVersionId !== change.baseVersionId) {
				await ctx.db.patch(change._id, { outOfDate: true });
				return failure(
					"OUT_OF_DATE",
					"The accepted record changed; update this request first",
				);
			}
		}
		if (storageConfig.provider === "google-drive") {
			const connection = storageConfig.connectionId
				? await ctx.db.get(storageConfig.connectionId)
				: null;
			if (!connection || connection.status !== "healthy") {
				return failure(
					"CONNECTION_UNAVAILABLE",
					"The Google Drive connection needs attention",
				);
			}
		}
		const idempotencyKey = `${change._id}:${change.headRevisionId}:${storageConfig.version}`;
		const existing = await ctx.db
			.query("publicationJobs")
			.withIndex("by_idempotency_key", (q) =>
				q.eq("idempotencyKey", idempotencyKey),
			)
			.unique();
		if (existing) {
			return {
				ok: true as const,
				state: existing.status,
				publicationJobId: existing._id,
				recordId: existing.recordId,
			};
		}
		const now = Date.now();
		const publicationJobId = await ctx.db.insert("publicationJobs", {
			organizationId: session.membership.organizationId,
			repositoryId: change.repositoryId,
			changeRequestId: change._id,
			revisionId: change.headRevisionId,
			recordId: change.targetRecordId,
			storageConfigId: storageConfig._id,
			storageConfigVersion: storageConfig.version,
			provider: storageConfig.provider,
			idempotencyKey,
			status: "queued",
			attempts: 0,
			requestedBy: session.membership._id,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.scheduler.runAfter(0, internal.publications.dispatch, {
			publicationJobId,
		});
		await recordAudit(
			ctx,
			session.user._id,
			session.membership.organizationId,
			"Publication requested",
			"publication-job",
			String(publicationJobId),
			`Exact revision ${change.headRevisionId} queued for ${storageConfig.provider}.`,
			now,
		);
		return {
			ok: true as const,
			state: "queued" as const,
			publicationJobId,
		};
	},
});

export const getCommand = internalQuery({
	args: { publicationJobId: v.id("publicationJobs") },
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.publicationJobId);
		if (!job) return null;
		const [change, file, config] = await Promise.all([
			ctx.db.get(job.changeRequestId),
			ctx.db
				.query("changeFiles")
				.withIndex("by_revision", (q) => q.eq("revisionId", job.revisionId))
				.filter((q) => q.eq(q.field("role"), "primary"))
				.unique(),
			ctx.db.get(job.storageConfigId),
		]);
		if (!change || !file || !config) return null;
		const connection = config.connectionId
			? await ctx.db.get(config.connectionId)
			: null;
		const externalRef = job.recordId
			? await ctx.db
					.query("externalRecordRefs")
					.withIndex("by_record", (q) =>
						q.eq("recordId", job.recordId as Id<"platformRecords">),
					)
					.unique()
			: null;
		return {
			commandId: String(job._id),
			publicationJobId: String(job._id),
			idempotencyKey: job.idempotencyKey,
			organizationId: String(job.organizationId),
			repositoryId: String(job.repositoryId),
			changeRequestId: String(job.changeRequestId),
			revisionId: String(job.revisionId),
			recordId: job.recordId ? String(job.recordId) : undefined,
			provider: job.provider,
			storageConfigVersion: job.storageConfigVersion,
			objectKey: file.objectKey,
			azureBlobRef: file.azureBlobRef,
			expectedSha256: file.sha256,
			fileName: file.name,
			mimeType: file.mimeType,
			connection:
				connection && config.driveId && config.folderId
					? {
							keyVaultReference: connection.keyVaultReference,
							driveId: config.driveId,
							folderId: config.folderId,
							existingFileId: externalRef?.externalFileId,
						}
					: undefined,
		};
	},
});

export const dispatch = internalAction({
	args: { publicationJobId: v.id("publicationJobs") },
	handler: async (ctx, args) => {
		const command = await ctx.runQuery(internal.publications.getCommand, args);
		if (!command) {
			await ctx.runMutation(internal.publications.recordFailure, {
				publicationJobId: args.publicationJobId,
				code: "COMMAND_NOT_FOUND",
				message: "Publication inputs are no longer available.",
			});
			return;
		}
		const baseUrl = process.env.AZURE_INTEGRATION_URL;
		const token = process.env.AZURE_INTEGRATION_TOKEN;
		if (!baseUrl || !token) {
			await ctx.runMutation(internal.publications.recordFailure, {
				publicationJobId: args.publicationJobId,
				code: "AZURE_NOT_CONFIGURED",
				message: "Azure integration endpoint is not configured.",
			});
			return;
		}
		await ctx.runMutation(internal.publications.markRunning, {
			publicationJobId: args.publicationJobId,
		});
		try {
			const response = await fetch(
				`${baseUrl.replace(/\/$/, "")}/publications`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(command),
				},
			);
			if (!response.ok) {
				throw new Error(
					`Azure command intake returned ${response.status}: ${await response.text()}`,
				);
			}
			const accepted = (await response.json()) as { commandId?: string };
			await ctx.runMutation(internal.publications.recordCommandAccepted, {
				publicationJobId: args.publicationJobId,
				commandId: accepted.commandId ?? command.commandId,
			});
		} catch (error) {
			await ctx.runMutation(internal.publications.recordFailure, {
				publicationJobId: args.publicationJobId,
				code: "COMMAND_INTAKE_FAILED",
				message:
					error instanceof Error
						? error.message
						: "Azure command intake failed",
			});
		}
	},
});

export const markRunning = internalMutation({
	args: { publicationJobId: v.id("publicationJobs") },
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.publicationJobId);
		if (!job || job.status === "succeeded") return;
		await ctx.db.patch(job._id, {
			status: "running",
			attempts: job.attempts + 1,
			errorCode: undefined,
			errorMessage: undefined,
			updatedAt: Date.now(),
		});
	},
});

export const recordCommandAccepted = internalMutation({
	args: {
		publicationJobId: v.id("publicationJobs"),
		commandId: v.string(),
	},
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.publicationJobId);
		if (!job || job.status === "succeeded") return;
		await ctx.db.patch(job._id, {
			commandId: args.commandId,
			updatedAt: Date.now(),
		});
	},
});

export const recordFailure = internalMutation({
	args: {
		publicationJobId: v.id("publicationJobs"),
		code: v.string(),
		message: v.string(),
	},
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.publicationJobId);
		if (!job || job.status === "succeeded") return;
		await ctx.db.patch(job._id, {
			status: "failed",
			errorCode: args.code,
			errorMessage: args.message,
			updatedAt: Date.now(),
		});
	},
});

export const finalize = internalMutation({
	args: {
		publicationJobId: v.id("publicationJobs"),
		idempotencyKey: v.string(),
		result: publicationResult,
	},
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.publicationJobId);
		if (!job || job.idempotencyKey !== args.idempotencyKey) {
			throw new Error("Publication job not found");
		}
		if (job.status === "succeeded") return job.recordId;
		const [change, revision, repository, config, requester] = await Promise.all(
			[
				ctx.db.get(job.changeRequestId),
				ctx.db.get(job.revisionId),
				ctx.db.get(job.repositoryId),
				ctx.db.get(job.storageConfigId),
				ctx.db.get(job.requestedBy),
			],
		);
		if (!change || !revision || !repository || !config || !requester) {
			throw new Error("Publication inputs are unavailable");
		}
		if (
			change.headRevisionId !== job.revisionId ||
			config.version !== job.storageConfigVersion
		) {
			await ctx.db.patch(job._id, {
				status: "failed",
				errorCode: "STALE_PUBLICATION",
				errorMessage:
					"The reviewed revision or repository destination changed before publication completed.",
				updatedAt: Date.now(),
			});
			throw new Error("Publication is stale");
		}
		const now = Date.now();
		let record = job.recordId ? await ctx.db.get(job.recordId) : null;
		if (!record) {
			const recordId = await ctx.db.insert("platformRecords", {
				organizationId: job.organizationId,
				repositoryId: job.repositoryId,
				title: change.title,
				collection: collectionForKind(repository.kind),
				locationIds: change.locationIds,
				visibility:
					change.publicAfterMerge && repository.visibility === "public"
						? "public"
						: repository.visibility,
				createdAt: now,
				updatedAt: now,
			});
			record = await ctx.db.get(recordId);
			await ctx.db.patch(repository._id, {
				recordCount: repository.recordCount + 1,
				updatedAt: now,
			});
		}
		if (!record) throw new Error("Record could not be created");
		const priorVersions = await ctx.db
			.query("recordVersions")
			.withIndex("by_record", (q) => q.eq("recordId", record._id))
			.collect();
		const versionId = await ctx.db.insert("recordVersions", {
			organizationId: job.organizationId,
			repositoryId: job.repositoryId,
			recordId: record._id,
			changeRequestId: change._id,
			revisionId: revision._id,
			version: priorVersions.length + 1,
			createdBy: job.requestedBy,
			summary: change.summary,
			sha256: args.result.sha256,
			masterProvider: args.result.provider,
			azureEvidenceRef: args.result.azureEvidenceRef,
			publicationManifestRef: args.result.publicationManifestRef,
			externalFileId: args.result.externalFileId,
			externalVersionId: args.result.externalVersionId,
			externalUrl: args.result.externalUrl,
			publishedAt: now,
			legacyBaseline: false,
			createdAt: now,
		});
		await Promise.all([
			ctx.db.patch(record._id, {
				currentVersionId: versionId,
				updatedAt: now,
			}),
			ctx.db.patch(change._id, {
				targetRecordId: record._id,
				status: "merged",
				mergedAt: now,
				mergedBy: job.requestedBy,
				updatedAt: now,
			}),
			ctx.db.patch(job._id, {
				recordId: record._id,
				status: "succeeded",
				remoteResult: args.result,
				updatedAt: now,
			}),
		]);
		if (change.linkedIssueId) {
			await ctx.db.patch(change.linkedIssueId, {
				state: "closed",
				status: "done",
				updatedAt: now,
			});
		}
		if (
			args.result.provider !== "azure" &&
			config.connectionId &&
			args.result.externalFileId &&
			args.result.externalVersionId &&
			args.result.externalUrl &&
			args.result.etag
		) {
			const existingRef = await ctx.db
				.query("externalRecordRefs")
				.withIndex("by_record", (q) => q.eq("recordId", record._id))
				.unique();
			const values = {
				externalFileId: args.result.externalFileId,
				externalVersionId: args.result.externalVersionId,
				externalUrl: args.result.externalUrl,
				etag: args.result.etag,
				lastVerifiedSha256: args.result.sha256,
				health: "healthy" as const,
				lastVerifiedAt: now,
				updatedAt: now,
			};
			if (existingRef) {
				await ctx.db.patch(existingRef._id, values);
			} else {
				await ctx.db.insert("externalRecordRefs", {
					organizationId: job.organizationId,
					repositoryId: job.repositoryId,
					recordId: record._id,
					provider: args.result.provider,
					connectionId: config.connectionId,
					...values,
					createdAt: now,
				});
			}
		}
		if (change.publicAfterMerge && repository.visibility === "public") {
			const [organization, priorSnapshots] = await Promise.all([
				ctx.db.get(job.organizationId),
				ctx.db
					.query("publicRepositorySnapshots")
					.withIndex("by_repository", (q) =>
						q.eq("repositoryId", repository._id),
					)
					.collect(),
			]);
			await ctx.db.insert("publicRepositorySnapshots", {
				organizationId: job.organizationId,
				repositoryId: repository._id,
				organizationSlug:
					organization?.publicSlug ?? organization?.slug ?? "organization",
				repositorySlug: repository.slug,
				version: priorSnapshots.length + 1,
				payload: {
					repository: {
						name: repository.name,
						description: repository.description,
					},
					record: {
						id: String(record._id),
						title: record.title,
						collection: record.collection,
						version: priorVersions.length + 1,
						summary: change.summary,
						sha256: args.result.sha256,
						publishedAt: now,
					},
					change: {
						number: change.number,
						title: change.title,
						summary: change.summary,
					},
				},
				sha256: args.result.sha256,
				publishedBy: job.requestedBy,
				publishedAt: now,
			});
		}
		await ctx.db.insert("platformNotifications", {
			organizationId: job.organizationId,
			membershipId: change.authorMembershipId,
			repositoryId: job.repositoryId,
			type: "merge",
			title: "Change published",
			body: `${change.title} is now the accepted record.`,
			targetType: "record",
			targetId: String(record._id),
			createdAt: now,
		});
		await recordAudit(
			ctx,
			requester.userId,
			job.organizationId,
			"Change published",
			"record-version",
			String(versionId),
			`Published immutable version ${priorVersions.length + 1} through ${args.result.provider}.`,
			now,
		);
		return record._id;
	},
});

async function approvalsSatisfyRules(
	ctx: MutationCtx,
	change: Doc<"changeRequests">,
	reviews: Array<Doc<"changeReviews">>,
	rules: Doc<"repositoryRules">,
) {
	if (!change.headRevisionId) return false;
	const approvals = reviews.filter(
		(review) =>
			review.decision === "approve" &&
			!review.stale &&
			review.revisionId === change.headRevisionId,
	);
	if (approvals.length < rules.minimumApprovals) return false;
	const requiredTeams = await Promise.all(
		rules.requiredTeamIds.map((teamId) =>
			ctx.db
				.query("teamMembers")
				.withIndex("by_team", (q) => q.eq("teamId", teamId))
				.collect(),
		),
	);
	return requiredTeams.every((members) =>
		approvals.some((approval) =>
			members.some(
				(member) => member.membershipId === approval.reviewerMembershipId,
			),
		),
	);
}

function collectionForKind(kind: Doc<"repositories">["kind"]) {
	switch (kind) {
		case "governance":
			return "Board resolutions";
		case "compliance":
			return "Compliance records";
		case "funding":
			return "Financial records";
		case "transparency":
			return "Publications";
		default:
			return "Records";
	}
}

async function recordAudit(
	ctx: MutationCtx,
	actorUserId: Id<"users">,
	organizationId: Id<"organizations">,
	action: string,
	targetType: string,
	targetId: string,
	reason: string,
	createdAt: number,
) {
	await ctx.db.insert("auditEvents", {
		organizationId,
		actorUserId,
		action,
		targetType,
		targetId,
		reason,
		source: "Repository publication",
		createdAt,
	});
}

function failure(code: string, message: string) {
	return { ok: false as const, code, message };
}

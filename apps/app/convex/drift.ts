import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";

const driftKind = v.union(
	v.literal("content-changed"),
	v.literal("deleted"),
	v.literal("moved"),
	v.literal("permission-lost"),
);

export const record = internalMutation({
	args: {
		provider: v.union(v.literal("google-drive"), v.literal("one-drive")),
		externalFileId: v.string(),
		kind: driftKind,
		detail: v.string(),
	},
	handler: async (ctx, args) => {
		const externalRef = await ctx.db
			.query("externalRecordRefs")
			.withIndex("by_provider_file", (q) =>
				q
					.eq("provider", args.provider)
					.eq("externalFileId", args.externalFileId),
			)
			.unique();
		if (!externalRef)
			return { created: false, reason: "unknown-file" as const };
		const [repository, record, config, existingIssues, labels] =
			await Promise.all([
				ctx.db.get(externalRef.repositoryId),
				ctx.db.get(externalRef.recordId),
				ctx.db
					.query("repositoryStorageConfigs")
					.withIndex("by_repository", (q) =>
						q.eq("repositoryId", externalRef.repositoryId),
					)
					.unique(),
				ctx.db
					.query("platformIssues")
					.withIndex("by_repository", (q) =>
						q.eq("repositoryId", externalRef.repositoryId),
					)
					.collect(),
				ctx.db
					.query("labels")
					.withIndex("by_organization", (q) =>
						q.eq("organizationId", externalRef.organizationId),
					)
					.collect(),
			]);
		if (!repository || !record || !config) {
			return { created: false, reason: "missing-scope" as const };
		}
		await Promise.all([
			ctx.db.patch(externalRef._id, {
				health: "degraded",
				updatedAt: Date.now(),
			}),
			ctx.db.patch(config._id, {
				health: "degraded",
				updatedAt: Date.now(),
			}),
		]);
		const issueTitle = `External record drift: ${record.title}`;
		const existing = existingIssues.find(
			(issue) => issue.state === "open" && issue.title === issueTitle,
		);
		if (existing) {
			await ctx.db.patch(existing._id, {
				description: `${existing.description}\n\n${new Date().toISOString()}: ${args.detail}`,
				updatedAt: Date.now(),
			});
			return { created: false, issueId: existing._id };
		}
		const actor = await ctx.db
			.query("memberships")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", externalRef.organizationId),
			)
			.filter((q) => q.eq(q.field("status"), "active"))
			.first();
		if (!actor) return { created: false, reason: "no-active-member" as const };
		const blockingLabel = labels.find(
			(label) => label.name === "Processing failed" && label.system,
		);
		const now = Date.now();
		const issueId = await ctx.db.insert("platformIssues", {
			organizationId: externalRef.organizationId,
			repositoryId: repository._id,
			number: repository.nextIssueNumber,
			title: issueTitle,
			description: `TieCamel detected an unexpected ${args.kind} event in the configured master provider.\n\n${args.detail}\n\nPublication is blocked until an administrator restores or accepts a newly reviewed version.`,
			template: "incident",
			state: "open",
			status: "in-progress",
			authorMembershipId: actor._id,
			assigneeIds: [],
			locationIds: record.locationIds,
			labelIds: blockingLabel ? [blockingLabel._id] : [],
			commentCount: 0,
			watcherIds: [],
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.patch(repository._id, {
			nextIssueNumber: repository.nextIssueNumber + 1,
			issueCount: repository.issueCount + 1,
			updatedAt: now,
		});
		const administrators = await ctx.db
			.query("memberships")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", externalRef.organizationId),
			)
			.collect();
		await Promise.all(
			administrators
				.filter(
					(member) =>
						member.status === "active" &&
						(member.role === "administrator" || member.role === "owner"),
				)
				.map((member) =>
					ctx.db.insert("platformNotifications", {
						organizationId: externalRef.organizationId,
						membershipId: member._id,
						repositoryId: repository._id,
						type: "deadline",
						title: "Critical external record drift",
						body: `${record.title}: ${args.kind}`,
						targetType: "issue",
						targetId: String(issueId),
						createdAt: now,
					}),
				),
		);
		return { created: true, issueId };
	},
});

export const recordRestoration = internalMutation({
	args: {
		recordId: v.id("platformRecords"),
		verifiedSha256: v.string(),
		actorUserId: v.id("users"),
		reason: v.string(),
	},
	handler: async (ctx, args) => {
		const record = await ctx.db.get(args.recordId);
		if (!record) throw new Error("Record not found");
		const currentVersion = record.currentVersionId
			? await ctx.db.get(record.currentVersionId)
			: null;
		if (
			!currentVersion ||
			currentVersion.sha256 !== args.verifiedSha256.toLowerCase()
		) {
			throw new Error("Restored content does not match the approved checksum");
		}
		const externalRef = await ctx.db
			.query("externalRecordRefs")
			.withIndex("by_record", (q) => q.eq("recordId", record._id))
			.unique();
		const config = await ctx.db
			.query("repositoryStorageConfigs")
			.withIndex("by_repository", (q) =>
				q.eq("repositoryId", record.repositoryId),
			)
			.unique();
		const now = Date.now();
		if (externalRef) {
			await ctx.db.patch(externalRef._id, {
				health: "healthy",
				lastVerifiedSha256: currentVersion.sha256,
				lastVerifiedAt: now,
				updatedAt: now,
			});
		}
		if (config) {
			await ctx.db.patch(config._id, {
				health: "healthy",
				updatedAt: now,
			});
		}
		await ctx.db.insert("auditEvents", {
			organizationId: record.organizationId,
			actorUserId: args.actorUserId as Id<"users">,
			action: "Approved external record restored",
			targetType: "record",
			targetId: String(record._id),
			reason: args.reason.trim(),
			source: "Integration recovery",
			createdAt: now,
		});
		return { ok: true as const };
	},
});

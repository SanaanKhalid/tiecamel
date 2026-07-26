import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
	requirePlatformSession,
	requireRepositoryAccess,
} from "./lib/platformAuth";

export const list = query({
	args: {},
	handler: async (ctx) => {
		const session = await requirePlatformSession(ctx);
		const repositories = await ctx.db
			.query("repositories")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", session.membership.organizationId),
			)
			.collect();
		const assignments = await ctx.db.query("repositoryMembers").collect();
		const visible = repositories.filter((repository) => {
			if (
				session.membership.role === "administrator" ||
				session.membership.role === "owner"
			) {
				return true;
			}
			return (
				repository.visibility === "members" ||
				repository.visibility === "public" ||
				assignments.some(
					(item) =>
						item.repositoryId === repository._id &&
						item.membershipId === session.membership._id,
				)
			);
		});
		return Promise.all(
			visible.map(async (repository) => ({
				...repository,
				rules: await ctx.db
					.query("repositoryRules")
					.withIndex("by_repository", (q) =>
						q.eq("repositoryId", repository._id),
					)
					.unique(),
			})),
		);
	},
});

export const getBySlug = query({
	args: { organizationSlug: v.string(), repositorySlug: v.string() },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx);
		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (q) => q.eq("slug", args.organizationSlug))
			.unique();
		if (
			!organization ||
			organization._id !== session.membership.organizationId
		) {
			throw new Error("Organization not found");
		}
		const repository = await ctx.db
			.query("repositories")
			.withIndex("by_organization_and_slug", (q) =>
				q
					.eq("organizationId", organization._id)
					.eq("slug", args.repositorySlug),
			)
			.unique();
		if (!repository) return null;
		await requireRepositoryAccess(ctx, repository._id);
		const rules = await ctx.db
			.query("repositoryRules")
			.withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
			.unique();
		return { ...repository, rules };
	},
});

export const updateRules = mutation({
	args: {
		repositoryId: v.id("repositories"),
		minimumApprovals: v.number(),
		requiredTeamIds: v.array(v.id("teams")),
		dismissApprovalsOnRevision: v.boolean(),
		prohibitSelfApproval: v.boolean(),
		requireIssue: v.boolean(),
		requireResolvedThreads: v.boolean(),
		memberIssuesEnabled: v.boolean(),
		memberCommentsEnabled: v.boolean(),
		finalizerRoles: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const session = await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"admin",
		);
		if (args.minimumApprovals < 1 || args.minimumApprovals > 12) {
			throw new Error("Minimum approvals must be between 1 and 12");
		}
		const teams = await Promise.all(
			args.requiredTeamIds.map((teamId) => ctx.db.get(teamId)),
		);
		if (
			teams.some(
				(team) =>
					!team || team.organizationId !== session.membership.organizationId,
			)
		) {
			throw new Error("Required teams must belong to this organization");
		}
		const existing = await ctx.db
			.query("repositoryRules")
			.withIndex("by_repository", (q) =>
				q.eq("repositoryId", args.repositoryId),
			)
			.unique();
		if (!existing) throw new Error("Repository rules not found");
		const now = Date.now();
		await ctx.db.patch(existing._id, {
			minimumApprovals: args.minimumApprovals,
			requiredTeamIds: args.requiredTeamIds,
			dismissApprovalsOnRevision: args.dismissApprovalsOnRevision,
			prohibitSelfApproval: args.prohibitSelfApproval,
			requireIssue: args.requireIssue,
			requireResolvedThreads: args.requireResolvedThreads,
			memberIssuesEnabled: args.memberIssuesEnabled,
			memberCommentsEnabled: args.memberCommentsEnabled,
			finalizerRoles: args.finalizerRoles,
			version: existing.version + 1,
			updatedAt: now,
		});
		await ctx.db.insert("auditEvents", {
			organizationId: session.membership.organizationId,
			actorUserId: session.user._id,
			action: "Repository protection rules updated",
			targetType: "repository",
			targetId: String(args.repositoryId),
			reason: `${args.minimumApprovals} independent approvals are required.`,
			source: "Repository settings",
			createdAt: now,
		});
	},
});

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
		publicIntegrityAnchoring: v.boolean(),
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
		if (
			args.publicIntegrityAnchoring &&
			session.repository.visibility !== "public"
		) {
			throw new Error(
				"Public integrity anchoring is available only to public repositories",
			);
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
			publicIntegrityAnchoring: args.publicIntegrityAnchoring,
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

export const create = mutation({
	args: {
		name: v.string(),
		slug: v.string(),
		prefix: v.string(),
		description: v.string(),
		visibility: v.union(
			v.literal("restricted"),
			v.literal("internal"),
			v.literal("members"),
			v.literal("public"),
		),
		minimumApprovals: v.number(),
	},
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx);
		if (!["administrator", "owner"].includes(session.membership.role)) {
			throw new Error("Organization administration is required");
		}
		const name = args.name.trim();
		const slug = args.slug.trim().toLowerCase();
		const prefix = args.prefix.trim().toUpperCase();
		const description = args.description.trim();
		if (!name || !description || !/^[a-z0-9-]{2,40}$/.test(slug)) {
			throw new Error("A name, description, and valid URL slug are required");
		}
		if (!/^[A-Z0-9]{2,10}$/.test(prefix)) {
			throw new Error("Issue prefix must contain 2–10 letters or numbers");
		}
		if (args.minimumApprovals < 1 || args.minimumApprovals > 12) {
			throw new Error("Minimum approvals must be between 1 and 12");
		}
		const organizationId = session.membership.organizationId;
		const repositoryWithSlug = await ctx.db
			.query("repositories")
			.withIndex("by_organization_and_slug", (q) =>
				q.eq("organizationId", organizationId).eq("slug", slug),
			)
			.unique();
		const repositories = await ctx.db
			.query("repositories")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.collect();
		if (repositoryWithSlug) throw new Error("This repository URL is in use");
		if (repositories.some((repository) => repository.prefix === prefix)) {
			throw new Error("This issue prefix is in use");
		}
		const now = Date.now();
		const repositoryId = await ctx.db.insert("repositories", {
			organizationId,
			name,
			slug,
			description,
			prefix,
			kind: "custom",
			visibility: args.visibility,
			color:
				["#0f766e", "#2563eb", "#7c3aed", "#b45309"][repositories.length % 4] ??
				"#0f766e",
			nextIssueNumber: 1,
			nextChangeNumber: 1,
			issueCount: 0,
			changeCount: 0,
			recordCount: 0,
			createdAt: now,
			updatedAt: now,
		});
		await Promise.all([
			ctx.db.insert("repositoryRules", {
				organizationId,
				repositoryId,
				minimumApprovals: args.minimumApprovals,
				requiredTeamIds: [],
				dismissApprovalsOnRevision: true,
				prohibitSelfApproval: true,
				requireIssue: true,
				requireResolvedThreads: true,
				memberIssuesEnabled: args.visibility !== "restricted",
				memberCommentsEnabled:
					args.visibility === "members" || args.visibility === "public",
				publicIntegrityAnchoring: false,
				finalizerRoles: [
					"organization-owner",
					"organization-admin",
					"repository-admin",
					"maintainer",
				],
				version: 1,
				createdAt: now,
				updatedAt: now,
			}),
			ctx.db.insert("repositoryMembers", {
				organizationId,
				repositoryId,
				membershipId: session.membership._id,
				role: "repository-admin",
				createdAt: now,
			}),
			ctx.db.insert("repositoryStorageConfigs", {
				organizationId,
				repositoryId,
				provider: "azure",
				displayPath: "TieCamel managed records",
				version: 1,
				health: "healthy",
				createdBy: session.membership._id,
				createdAt: now,
				updatedAt: now,
			}),
			ctx.db.insert("auditEvents", {
				organizationId,
				actorUserId: session.user._id,
				action: "Repository created",
				targetType: "repository",
				targetId: String(repositoryId),
				reason: `${name} created with ${args.visibility} visibility.`,
				source: "Organization settings",
				createdAt: now,
			}),
		]);
		return repositoryId;
	},
});

export const update = mutation({
	args: {
		repositoryId: v.id("repositories"),
		name: v.string(),
		description: v.string(),
		visibility: v.union(
			v.literal("restricted"),
			v.literal("internal"),
			v.literal("members"),
			v.literal("public"),
		),
	},
	handler: async (ctx, args) => {
		const session = await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"admin",
		);
		const name = args.name.trim();
		const description = args.description.trim();
		if (!name || !description)
			throw new Error("Name and description are required");
		const now = Date.now();
		await ctx.db.patch(args.repositoryId, {
			name,
			description,
			visibility: args.visibility,
			updatedAt: now,
		});
		if (args.visibility !== "public") {
			const rules = await ctx.db
				.query("repositoryRules")
				.withIndex("by_repository", (q) =>
					q.eq("repositoryId", args.repositoryId),
				)
				.unique();
			if (rules?.publicIntegrityAnchoring) {
				await ctx.db.patch(rules._id, {
					publicIntegrityAnchoring: false,
					version: rules.version + 1,
					updatedAt: now,
				});
			}
		}
		await ctx.db.insert("auditEvents", {
			organizationId: session.membership.organizationId,
			actorUserId: session.user._id,
			action: "Repository updated",
			targetType: "repository",
			targetId: String(args.repositoryId),
			reason: `${name} now has ${args.visibility} visibility.`,
			source: "Repository settings",
			createdAt: now,
		});
	},
});

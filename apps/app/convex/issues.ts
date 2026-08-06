import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
	requireActiveMembershipIds,
	requirePlatformSession,
	requireRepositoryAccess,
} from "./lib/platformAuth";

const issueStatus = v.union(
	v.literal("todo"),
	v.literal("in-progress"),
	v.literal("in-review"),
	v.literal("done"),
);

export const list = query({
	args: {
		repositoryId: v.optional(v.id("repositories")),
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		if (args.repositoryId) {
			await requireRepositoryAccess(
				ctx,
				args.repositoryId,
				"read",
				args.demoSessionToken,
			);
			const repositoryId = args.repositoryId;
			return ctx.db
				.query("platformIssues")
				.withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
				.collect();
		}
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		return ctx.db
			.query("platformIssues")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", session.membership.organizationId),
			)
			.collect();
	},
});

export const getByNumber = query({
	args: {
		repositoryId: v.id("repositories"),
		number: v.number(),
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"read",
			args.demoSessionToken,
		);
		const issue = await ctx.db
			.query("platformIssues")
			.withIndex("by_repository_and_number", (q) =>
				q.eq("repositoryId", args.repositoryId).eq("number", args.number),
			)
			.unique();
		if (!issue) return null;
		const comments = await ctx.db
			.query("platformComments")
			.withIndex("by_target", (q) =>
				q.eq("targetType", "issue").eq("targetId", String(issue._id)),
			)
			.collect();
		return { ...issue, comments };
	},
});

export const create = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		repositoryId: v.id("repositories"),
		title: v.string(),
		description: v.string(),
		template: v.union(
			v.literal("obligation"),
			v.literal("incident"),
			v.literal("proposal"),
			v.literal("question"),
			v.literal("general"),
		),
		assigneeIds: v.array(v.id("memberships")),
		locationIds: v.array(v.id("locations")),
		labelIds: v.array(v.id("labels")),
		dueDate: v.optional(v.number()),
		recurrence: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const session = await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"contribute",
			args.demoSessionToken,
		);
		const title = args.title.trim();
		const description = args.description.trim();
		if (!title || !description)
			throw new Error("Title and description are required");
		await requireActiveMembershipIds(
			ctx,
			session.membership.organizationId,
			args.assigneeIds,
		);
		const [locations, labels] = await Promise.all([
			Promise.all(args.locationIds.map((locationId) => ctx.db.get(locationId))),
			Promise.all(args.labelIds.map((labelId) => ctx.db.get(labelId))),
		]);
		if (
			locations.some(
				(location) =>
					!location ||
					location.organizationId !== session.membership.organizationId ||
					location.status !== "active",
			)
		) {
			throw new Error("Locations must be active scopes in this organization");
		}
		if (
			labels.some(
				(label) =>
					!label ||
					label.organizationId !== session.membership.organizationId ||
					(label.repositoryId !== undefined &&
						label.repositoryId !== args.repositoryId),
			)
		) {
			throw new Error("Labels must belong to this repository or organization");
		}
		const number = session.repository.nextIssueNumber;
		const now = Date.now();
		const issueId = await ctx.db.insert("platformIssues", {
			organizationId: session.membership.organizationId,
			repositoryId: args.repositoryId,
			number,
			title,
			description,
			template: args.template,
			state: "open",
			status: "todo",
			authorMembershipId: session.membership._id,
			assigneeIds: args.assigneeIds,
			locationIds: args.locationIds,
			labelIds: args.labelIds,
			dueDate: args.dueDate,
			recurrence: args.recurrence,
			commentCount: 0,
			watcherIds: [
				session.membership._id,
				...args.assigneeIds.filter((id) => id !== session.membership._id),
			],
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.patch(args.repositoryId, {
			nextIssueNumber: number + 1,
			issueCount: session.repository.issueCount + 1,
			updatedAt: now,
		});
		await ctx.db.insert("auditEvents", {
			organizationId: session.membership.organizationId,
			actorUserId: session.user._id,
			action: "Issue opened",
			targetType: "issue",
			targetId: String(issueId),
			reason: `${session.repository.prefix}-${number}: ${title}`,
			source: "Repository issues",
			createdAt: now,
		});
		return { issueId, number };
	},
});

export const transition = mutation({
	args: {
		issueId: v.id("platformIssues"),
		status: issueStatus,
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue) throw new Error("Issue not found");
		const session = await requireRepositoryAccess(
			ctx,
			issue.repositoryId,
			"contribute",
			args.demoSessionToken,
		);
		const now = Date.now();
		await ctx.db.patch(issue._id, {
			status: args.status,
			state: args.status === "done" ? "closed" : "open",
			updatedAt: now,
		});
		await ctx.db.insert("auditEvents", {
			organizationId: session.membership.organizationId,
			actorUserId: session.user._id,
			action: args.status === "done" ? "Issue closed" : "Issue status changed",
			targetType: "issue",
			targetId: String(issue._id),
			reason: `Workflow status changed from ${issue.status} to ${args.status}.`,
			source: "Repository issues",
			createdAt: now,
		});
	},
});

export const comment = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		issueId: v.id("platformIssues"),
		body: v.string(),
		visibility: v.union(v.literal("internal"), v.literal("public")),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue) throw new Error("Issue not found");
		const session = await requireRepositoryAccess(
			ctx,
			issue.repositoryId,
			"contribute",
			args.demoSessionToken,
		);
		const body = args.body.trim();
		if (!body) throw new Error("Comment cannot be empty");
		if (
			args.visibility === "public" &&
			session.repository.visibility !== "public"
		) {
			throw new Error("Only public repositories can contain public comments");
		}
		const now = Date.now();
		await ctx.db.insert("platformComments", {
			organizationId: session.membership.organizationId,
			repositoryId: issue.repositoryId,
			targetType: "issue",
			targetId: String(issue._id),
			authorMembershipId: session.membership._id,
			body,
			visibility: args.visibility,
			moderationStatus:
				args.visibility === "public" && session.membership.role === "member"
					? "pending"
					: "approved",
			createdAt: now,
		});
		await ctx.db.patch(issue._id, {
			commentCount: issue.commentCount + 1,
			updatedAt: now,
		});
	},
});

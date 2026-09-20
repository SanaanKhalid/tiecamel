import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const role = v.union(
	v.literal("owner"),
	v.literal("finance"),
	v.literal("secretary"),
	v.literal("reviewer"),
	v.literal("board"),
	v.literal("member"),
);

/** Operator-only provisioning; callers cannot mint identities or choose their own roles. */
export const provision = internalMutation({
	args: {
		slug: v.string(),
		name: v.string(),
		people: v.array(
			v.object({
				clerkUserId: v.string(),
				name: v.string(),
				email: v.string(),
				role,
			}),
		),
	},
	handler: async (ctx, args) => {
		const issuer =
			process.env.CLERK_FRONTEND_API_URL ??
			process.env.CLERK_JWT_ISSUER_DOMAIN ??
			"";
		if (
			process.env.TIECAMEL_OPERATIONAL_TEST_ENABLED !== "true" ||
			!/^https:\/\/[^/]+\.clerk\.accounts\.dev\/?$/.test(issuer)
		)
			throw new Error(
				"Operational test provisioning requires an enabled development identity environment",
			);
		if (
			!/^test-[a-z0-9-]{3,60}$/.test(args.slug) ||
			!args.name.trim() ||
			args.name.length > 100
		)
			throw new Error("Use a test-prefixed slug and a short organization name");
		if (
			args.people.length < 4 ||
			args.people.length > 10 ||
			new Set(args.people.map((p) => p.clerkUserId)).size !== args.people.length
		)
			throw new Error("Provide four to ten distinct test identities");
		if (
			!["owner", "finance", "reviewer", "board"].every((required) =>
				args.people.some((p) => p.role === required),
			)
		)
			throw new Error(
				"Owner, finance, reviewer and board test identities are required",
			);
		const existing = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (q) => q.eq("slug", args.slug))
			.unique();
		if (existing)
			throw new Error(
				"Organization already exists; refusing to overwrite membership or records",
			);
		for (const person of args.people) {
			if (
				!/^user_[a-zA-Z0-9]+$/.test(person.clerkUserId) ||
				!person.name.trim() ||
				!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)
			)
				throw new Error("Provide valid dedicated Clerk test identities");
			const user = await ctx.db
				.query("users")
				.withIndex("by_clerk_user", (q) =>
					q.eq("clerkUserId", person.clerkUserId),
				)
				.unique();
			if (user)
				throw new Error(
					"Use dedicated test accounts not already associated with another workspace",
				);
		}
		const now = Date.now();
		const organizationId = await ctx.db.insert("organizations", {
			name: `[TEST] ${args.name.trim()}`,
			slug: args.slug,
			publicSlug: args.slug,
			operationalTest: true,
			demoOnly: false,
			status: "pilot",
			createdAt: now,
		});
		const repositoryId = await ctx.db.insert("repositories", {
			organizationId,
			name: "Compliance",
			slug: "compliance",
			description: "Synthetic notices and evidence for operational testing.",
			prefix: "COMP",
			kind: "compliance",
			visibility: "restricted",
			color: "#092d2a",
			nextIssueNumber: 1,
			nextChangeNumber: 1,
			issueCount: 0,
			changeCount: 0,
			recordCount: 0,
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("repositoryRules", {
			organizationId,
			repositoryId,
			minimumApprovals: 2,
			requiredTeamIds: [],
			dismissApprovalsOnRevision: true,
			prohibitSelfApproval: true,
			requireIssue: true,
			requireResolvedThreads: true,
			memberIssuesEnabled: false,
			memberCommentsEnabled: false,
			publicIntegrityAnchoring: false,
			finalizerRoles: ["repository-admin", "maintainer"],
			version: 1,
			createdAt: now,
			updatedAt: now,
		});
		const memberships = [];
		for (const person of args.people) {
			const userId = await ctx.db.insert("users", {
				clerkUserId: person.clerkUserId,
				name: person.name,
				email: person.email,
				selectedOrganizationId: organizationId,
				createdAt: now,
			});
			const membershipId = await ctx.db.insert("memberships", {
				organizationId,
				userId,
				role: person.role,
				status: "active",
				createdAt: now,
			});
			if (person.role !== "member")
				await ctx.db.insert("repositoryMembers", {
					organizationId,
					repositoryId,
					membershipId,
					role:
						person.role === "owner"
							? "repository-admin"
							: ["board", "reviewer"].includes(person.role)
								? "reviewer"
								: "contributor",
					createdAt: now,
				});
			memberships.push({ membershipId, role: person.role });
		}
		return { organizationId, repositoryId, memberships };
	},
});

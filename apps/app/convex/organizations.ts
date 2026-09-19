import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
export const choices = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return [];
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
		if (!user) return [];
		const memberships = await ctx.db
			.query("memberships")
			.withIndex("by_user_and_organization", (q) => q.eq("userId", user._id))
			.collect();
		return (
			await Promise.all(
				memberships
					.filter((entry) => entry.status === "active")
					.map(async (entry) => {
						const organization = await ctx.db.get(entry.organizationId);
						return organization && organization.status !== "suspended"
							? {
									id: organization._id,
									name: organization.name,
									selected: user.selectedOrganizationId === organization._id,
								}
							: null;
					}),
			)
		).filter((entry) => entry !== null);
	},
});
export const select = mutation({
	args: { organizationId: v.id("organizations") },
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error("Authentication required");
		const user = await ctx.db
			.query("users")
			.withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
			.unique();
		if (!user) throw new Error("Membership required");
		const membership = await ctx.db
			.query("memberships")
			.withIndex("by_user_and_organization", (q) =>
				q.eq("userId", user._id).eq("organizationId", args.organizationId),
			)
			.unique();
		const organization = await ctx.db.get(args.organizationId);
		if (
			!membership ||
			membership.status !== "active" ||
			!organization ||
			organization.status === "suspended"
		)
			throw new Error("Organization access is unavailable");
		await ctx.db.patch(user._id, {
			selectedOrganizationId: args.organizationId,
		});
	},
});

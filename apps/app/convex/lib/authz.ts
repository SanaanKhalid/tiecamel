import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ConvexCtx = QueryCtx | MutationCtx;

export async function requireMembership(ctx: ConvexCtx) {
	const identity = await ctx.auth.getUserIdentity();
	if (!identity) throw new Error("Authentication required");

	const user = await ctx.db
		.query("users")
		.withIndex("by_clerk_user", (query) =>
			query.eq("clerkUserId", identity.subject),
		)
		.unique();
	if (!user) return null;

	const memberships = await ctx.db
		.query("memberships")
		.withIndex("by_user_and_organization", (query) =>
			query.eq("userId", user._id),
		)
		.collect();
	const membership = memberships.find((item) => item.status === "active");

	return membership ? { identity, user, membership } : null;
}

export async function requireRole(
	ctx: ConvexCtx,
	roles: Array<Doc<"memberships">["role"]>,
) {
	const session = await requireMembership(ctx);
	if (!session) throw new Error("Active organization membership required");
	if (!roles.includes(session.membership.role)) {
		throw new Error("You do not have permission to perform this action");
	}
	return session;
}

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type ConvexCtx = QueryCtx | MutationCtx;

export async function requireMembership(
	ctx: ConvexCtx,
	organizationId?: Id<"organizations">,
) {
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
	const active = memberships.filter((item) => item.status === "active");
	const selectedId = organizationId ?? user.selectedOrganizationId;
	if (!selectedId && active.length > 1)
		throw new Error("Select an organization before continuing");
	const membership = selectedId
		? active.find((item) => item.organizationId === selectedId)
		: active[0];
	if (membership) {
		const organization = await ctx.db.get(membership.organizationId);
		if (!organization || organization.status === "suspended")
			throw new Error("Organization access is suspended");
	}

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

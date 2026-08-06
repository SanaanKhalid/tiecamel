import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireMembership } from "./authz";
import { sha256Hex } from "./canonical";

type Ctx = QueryCtx | MutationCtx;

export async function requirePlatformSession(
	ctx: Ctx,
	demoSessionToken?: string,
) {
	if (demoSessionToken) {
		if (process.env.TIECAMEL_DEMO_SESSIONS_ENABLED !== "true") {
			throw new Error("Development demo sessions are disabled");
		}
		const tokenSha256 = await sha256Hex(demoSessionToken);
		const demo = await ctx.db
			.query("demoSessions")
			.withIndex("by_token_sha256", (q) => q.eq("tokenSha256", tokenSha256))
			.unique();
		if (!demo || demo.expiresAt <= Date.now()) {
			throw new Error("Demo session is invalid or expired");
		}
		const membership = await ctx.db.get(demo.activeMembershipId);
		const user = membership ? await ctx.db.get(membership.userId) : null;
		if (
			!membership ||
			!user ||
			membership.organizationId !== demo.organizationId ||
			membership.status !== "active"
		) {
			throw new Error("Demo membership is unavailable");
		}
		return { identity: null, user, membership, demoSessionId: demo._id };
	}
	const session = await requireMembership(ctx);
	if (!session) throw new Error("Active organization membership required");
	return session;
}

export async function requireRepositoryAccess(
	ctx: Ctx,
	repositoryId: Id<"repositories">,
	mode: "read" | "contribute" | "review" | "admin" = "read",
	demoSessionToken?: string,
) {
	const session = await requirePlatformSession(ctx, demoSessionToken);
	const repository = await ctx.db.get(repositoryId);
	if (
		!repository ||
		repository.organizationId !== session.membership.organizationId
	) {
		throw new Error("Repository not found");
	}

	const organizationRole = session.membership.role;
	if (organizationRole === "administrator" || organizationRole === "owner") {
		return {
			...session,
			repository,
			repositoryRole: "repository-admin" as const,
		};
	}

	const assignment = await ctx.db
		.query("repositoryMembers")
		.withIndex("by_repository_and_member", (q) =>
			q
				.eq("repositoryId", repositoryId)
				.eq("membershipId", session.membership._id),
		)
		.unique();

	if (mode === "read") {
		if (
			assignment ||
			repository.visibility === "members" ||
			repository.visibility === "public"
		) {
			return { ...session, repository, repositoryRole: assignment?.role };
		}
		throw new Error("You do not have access to this repository");
	}

	const allowed = repositoryRolesForMode(mode);
	if (!assignment || !allowed.includes(assignment.role)) {
		throw new Error("You do not have permission to perform this action");
	}
	return { ...session, repository, repositoryRole: assignment.role };
}

export function repositoryRolesForMode(
	mode: "contribute" | "review" | "admin",
): Array<Doc<"repositoryMembers">["role"]> {
	if (mode === "admin") return ["repository-admin"];
	if (mode === "review") {
		return ["repository-admin", "maintainer", "reviewer"];
	}
	return ["repository-admin", "maintainer", "contributor", "reviewer"];
}

export async function requireActiveMembershipIds(
	ctx: Ctx,
	organizationId: Id<"organizations">,
	membershipIds: Id<"memberships">[],
) {
	const uniqueIds = [...new Set(membershipIds)];
	const memberships = await Promise.all(uniqueIds.map((id) => ctx.db.get(id)));
	if (
		memberships.some(
			(membership) =>
				!membership ||
				membership.organizationId !== organizationId ||
				membership.status !== "active",
		)
	) {
		throw new Error(
			"Every selected person must be an active organization member",
		);
	}
	return memberships.filter(Boolean);
}

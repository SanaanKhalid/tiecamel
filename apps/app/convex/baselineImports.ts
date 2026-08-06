import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRepositoryAccess } from "./lib/platformAuth";

export const list = query({
	args: {
		repositoryId: v.id("repositories"),
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"admin",
			args.demoSessionToken,
		);
		return ctx.db
			.query("baselineImports")
			.withIndex("by_repository", (q) =>
				q.eq("repositoryId", args.repositoryId),
			)
			.order("desc")
			.collect();
	},
});

export const request = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		repositoryId: v.id("repositories"),
		connectionId: v.id("providerConnections"),
		externalFileId: v.string(),
		fileName: v.string(),
		attestation: v.string(),
	},
	handler: async (ctx, args) => {
		const session = await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"admin",
			args.demoSessionToken,
		);
		const connection = await ctx.db.get(args.connectionId);
		if (
			!connection ||
			connection.organizationId !== session.membership.organizationId ||
			connection.provider !== "google-drive" ||
			connection.status !== "healthy"
		) {
			return {
				ok: false as const,
				code: "CONNECTION_UNAVAILABLE",
				message: "A healthy Google Drive connection is required.",
			};
		}
		if (args.attestation.trim().length < 20) {
			return {
				ok: false as const,
				code: "ATTESTATION_REQUIRED",
				message:
					"Document how this file became the accepted pre-TieCamel baseline.",
			};
		}
		const duplicate = await ctx.db
			.query("baselineImports")
			.withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
			.filter((q) =>
				q.eq(q.field("externalFileId"), args.externalFileId.trim()),
			)
			.first();
		if (duplicate) {
			return {
				ok: true as const,
				baselineImportId: duplicate._id,
				state: duplicate.status,
			};
		}
		const now = Date.now();
		const baselineImportId = await ctx.db.insert("baselineImports", {
			organizationId: session.membership.organizationId,
			repositoryId: args.repositoryId,
			connectionId: connection._id,
			externalFileId: args.externalFileId.trim(),
			fileName: args.fileName.trim(),
			administratorId: session.membership._id,
			attestation: args.attestation.trim(),
			status: "pending",
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("auditEvents", {
			organizationId: session.membership.organizationId,
			actorUserId: session.user._id,
			action: "Legacy baseline import requested",
			targetType: "baseline-import",
			targetId: String(baselineImportId),
			reason: args.attestation.trim(),
			source: "Google Drive integration",
			createdAt: now,
		});
		return {
			ok: true as const,
			baselineImportId,
			state: "pending" as const,
			enqueueRequired: true as const,
		};
	},
});

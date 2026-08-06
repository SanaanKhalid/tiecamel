import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
	requirePlatformSession,
	requireRepositoryAccess,
} from "./lib/platformAuth";

const provider = v.union(v.literal("google-drive"), v.literal("one-drive"));

export const listConnections = query({
	args: { demoSessionToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		return ctx.db
			.query("providerConnections")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", session.membership.organizationId),
			)
			.collect();
	},
});

export const getRepositoryStorage = query({
	args: {
		repositoryId: v.id("repositories"),
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"read",
			args.demoSessionToken,
		);
		return ctx.db
			.query("repositoryStorageConfigs")
			.withIndex("by_repository", (q) =>
				q.eq("repositoryId", args.repositoryId),
			)
			.unique();
	},
});

export const registerConnection = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		provider,
		displayName: v.string(),
		externalTenant: v.string(),
		serviceIdentity: v.string(),
		keyVaultReference: v.string(),
		capabilities: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		requireOrganizationAdministrator(session.membership.role);
		if (args.provider === "one-drive") {
			return {
				ok: false as const,
				code: "PROVIDER_NOT_ENABLED",
				message: "OneDrive for Business is not enabled in this release.",
			};
		}
		if (!args.keyVaultReference.startsWith("kv://")) {
			return {
				ok: false as const,
				code: "INVALID_SECRET_REFERENCE",
				message: "The credential reference is invalid.",
			};
		}
		const now = Date.now();
		const existing = await ctx.db
			.query("providerConnections")
			.withIndex("by_organization_and_provider", (q) =>
				q
					.eq("organizationId", session.membership.organizationId)
					.eq("provider", args.provider),
			)
			.unique();
		if (existing) {
			await ctx.db.patch(existing._id, {
				displayName: args.displayName.trim(),
				externalTenant: args.externalTenant.trim(),
				serviceIdentity: args.serviceIdentity.trim(),
				keyVaultReference: args.keyVaultReference,
				capabilities: args.capabilities,
				status: "disconnected",
				healthMessage: "Connection must be verified before use.",
				updatedAt: now,
			});
			return { ok: true as const, connectionId: existing._id };
		}
		const connectionId = await ctx.db.insert("providerConnections", {
			organizationId: session.membership.organizationId,
			provider: args.provider,
			status: "disconnected",
			displayName: args.displayName.trim(),
			externalTenant: args.externalTenant.trim(),
			serviceIdentity: args.serviceIdentity.trim(),
			keyVaultReference: args.keyVaultReference,
			capabilities: args.capabilities,
			healthMessage: "Connection must be verified before use.",
			createdBy: session.membership._id,
			createdAt: now,
			updatedAt: now,
		});
		return { ok: true as const, connectionId };
	},
});

export const recordVerification = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		connectionId: v.id("providerConnections"),
		succeeded: v.boolean(),
		message: v.string(),
	},
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		requireOrganizationAdministrator(session.membership.role);
		const connection = await ctx.db.get(args.connectionId);
		if (
			!connection ||
			connection.organizationId !== session.membership.organizationId
		) {
			throw new Error("Provider connection not found");
		}
		const now = Date.now();
		await ctx.db.patch(connection._id, {
			status: args.succeeded ? "healthy" : "degraded",
			healthMessage: args.message.trim(),
			lastVerifiedAt: now,
			updatedAt: now,
		});
		return { ok: true as const };
	},
});

export const configureRepositoryStorage = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		repositoryId: v.id("repositories"),
		provider: v.union(v.literal("azure"), v.literal("google-drive")),
		connectionId: v.optional(v.id("providerConnections")),
		driveId: v.optional(v.string()),
		folderId: v.optional(v.string()),
		displayPath: v.string(),
	},
	handler: async (ctx, args) => {
		const session = await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"admin",
			args.demoSessionToken,
		);
		let connection = null;
		if (args.provider === "google-drive") {
			if (
				!args.connectionId ||
				!args.driveId?.trim() ||
				!args.folderId?.trim()
			) {
				return {
					ok: false as const,
					code: "FIXED_FOLDER_REQUIRED",
					message:
						"Google Drive requires a verified connection, Shared Drive, and fixed folder.",
				};
			}
			connection = await ctx.db.get(args.connectionId);
			if (
				!connection ||
				connection.organizationId !== session.membership.organizationId ||
				connection.provider !== "google-drive" ||
				connection.status !== "healthy"
			) {
				return {
					ok: false as const,
					code: "CONNECTION_UNAVAILABLE",
					message: "The Google Drive connection is not healthy.",
				};
			}
		}
		const now = Date.now();
		const current = await ctx.db
			.query("repositoryStorageConfigs")
			.withIndex("by_repository", (q) =>
				q.eq("repositoryId", args.repositoryId),
			)
			.unique();
		const values = {
			provider: args.provider,
			connectionId:
				args.provider === "google-drive" ? args.connectionId : undefined,
			driveId:
				args.provider === "google-drive" ? args.driveId?.trim() : undefined,
			folderId:
				args.provider === "google-drive" ? args.folderId?.trim() : undefined,
			displayPath:
				args.provider === "google-drive"
					? args.displayPath.trim()
					: "TieCamel managed records",
			version: (current?.version ?? 0) + 1,
			health: "healthy" as const,
			updatedAt: now,
		};
		let configId: Id<"repositoryStorageConfigs">;
		if (current) {
			await ctx.db.patch(current._id, values);
			configId = current._id;
		} else {
			configId = await ctx.db.insert("repositoryStorageConfigs", {
				organizationId: session.membership.organizationId,
				repositoryId: args.repositoryId,
				...values,
				createdBy: session.membership._id,
				createdAt: now,
			});
		}
		return { ok: true as const, configId, version: values.version };
	},
});

export const disconnect = mutation({
	args: {
		connectionId: v.id("providerConnections"),
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		requireOrganizationAdministrator(session.membership.role);
		const connection = await ctx.db.get(args.connectionId);
		if (
			!connection ||
			connection.organizationId !== session.membership.organizationId
		) {
			throw new Error("Provider connection not found");
		}
		await ctx.db.patch(connection._id, {
			status: "disconnected",
			healthMessage:
				"Connection removed. Provider files were not deleted; new publications are paused.",
			updatedAt: Date.now(),
		});
		return { ok: true as const };
	},
});

function requireOrganizationAdministrator(role: string) {
	if (role !== "administrator" && role !== "owner") {
		throw new Error("Organization administrator access required");
	}
}

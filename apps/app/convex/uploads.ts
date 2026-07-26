import { v } from "convex/values";
import { api } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { requireRepositoryAccess } from "./lib/platformAuth";

const allowedMimeTypes = new Set([
	"application/pdf",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	"text/csv",
	"image/png",
	"image/jpeg",
	"image/tiff",
]);

export const authorize = mutation({
	args: {
		repositoryId: v.id("repositories"),
		changeRequestId: v.optional(v.id("changeRequests")),
		fileName: v.string(),
		mimeType: v.string(),
		size: v.number(),
	},
	handler: async (ctx, args) => {
		const session = await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"contribute",
		);
		if (!allowedMimeTypes.has(args.mimeType)) {
			throw new Error("This file type is not supported");
		}
		if (args.size <= 0 || args.size > 50 * 1024 * 1024) {
			throw new Error("Files must be between 1 byte and 50 MB");
		}
		if (/\.(zip|exe|dmg|docm|xlsm)$/i.test(args.fileName)) {
			throw new Error(
				"Archives, executables, and macro-enabled files are prohibited",
			);
		}
		if (args.changeRequestId) {
			const change = await ctx.db.get(args.changeRequestId);
			if (!change || change.repositoryId !== args.repositoryId) {
				throw new Error("Change request not found");
			}
		}
		const now = Date.now();
		const uploadId = crypto.randomUUID();
		const safeName = args.fileName.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
		const objectKey = `quarantine/${session.membership.organizationId}/${args.repositoryId}/${uploadId}/${safeName}`;
		const azureBlobRef = `azure://${objectKey}`;
		const sessionId = await ctx.db.insert("uploadSessions", {
			organizationId: session.membership.organizationId,
			repositoryId: args.repositoryId,
			changeRequestId: args.changeRequestId,
			createdBy: session.membership._id,
			fileName: args.fileName,
			mimeType: args.mimeType,
			size: args.size,
			objectKey,
			azureBlobRef,
			status: "authorized",
			expiresAt: now + 15 * 60 * 1000,
			createdAt: now,
			updatedAt: now,
		});
		return {
			uploadSessionId: sessionId,
			objectKey,
			azureBlobRef,
			expiresAt: now + 15 * 60 * 1000,
			uploadUrlRequired: true,
		};
	},
});

export const getSession = query({
	args: { uploadSessionId: v.id("uploadSessions") },
	handler: async (ctx, args) => {
		const upload = await ctx.db.get(args.uploadSessionId);
		if (!upload) return null;
		const session = await requireRepositoryAccess(ctx, upload.repositoryId);
		if (
			upload.createdBy !== session.membership._id &&
			!["administrator", "owner"].includes(session.membership.role)
		) {
			throw new Error("Upload session not found");
		}
		return upload;
	},
});

export const requestUploadUrl = action({
	args: { uploadSessionId: v.id("uploadSessions") },
	handler: async (
		ctx,
		args,
	): Promise<{
		url: string;
		method: "PUT";
		headers: Record<string, string>;
		expiresAt: string;
	}> => {
		const upload = await ctx.runQuery(api.uploads.getSession, args);
		if (!upload) throw new Error("Upload session not found");
		if (upload.status !== "authorized" || upload.expiresAt < Date.now()) {
			throw new Error("Upload session is no longer active");
		}
		const baseUrl = process.env.AZURE_INTEGRATION_URL;
		const token = process.env.AZURE_INTEGRATION_TOKEN;
		if (!baseUrl || !token) {
			throw new Error("Azure document storage is not configured");
		}
		const response = await fetch(`${baseUrl.replace(/\/$/, "")}/uploads`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				uploadSessionId: String(upload._id),
				organizationId: String(upload.organizationId),
				repositoryId: String(upload.repositoryId),
				objectKey: upload.objectKey,
				azureBlobRef: upload.azureBlobRef,
				fileName: upload.fileName,
				mimeType: upload.mimeType,
				size: upload.size,
			}),
		});
		if (!response.ok) {
			throw new Error(
				`Azure could not authorize the upload (${response.status}): ${await response.text()}`,
			);
		}
		return response.json() as Promise<{
			url: string;
			method: "PUT";
			headers: Record<string, string>;
			expiresAt: string;
		}>;
	},
});

export const finalize = mutation({
	args: {
		uploadSessionId: v.id("uploadSessions"),
		sha256: v.string(),
	},
	handler: async (ctx, args) => {
		const upload = await ctx.db.get(args.uploadSessionId);
		if (!upload) throw new Error("Upload session not found");
		const session = await requireRepositoryAccess(
			ctx,
			upload.repositoryId,
			"contribute",
		);
		if (upload.createdBy !== session.membership._id) {
			throw new Error("Only the uploader can finalize this session");
		}
		if (upload.expiresAt < Date.now()) {
			await ctx.db.patch(upload._id, {
				status: "expired",
				updatedAt: Date.now(),
			});
			throw new Error("Upload session expired");
		}
		if (!/^[a-f0-9]{64}$/i.test(args.sha256)) {
			throw new Error("A valid SHA-256 checksum is required");
		}
		const now = Date.now();
		await ctx.db.patch(upload._id, {
			sha256: args.sha256.toLowerCase(),
			status: "uploaded",
			updatedAt: now,
		});
		const jobId = await ctx.db.insert("processingJobs", {
			organizationId: upload.organizationId,
			repositoryId: upload.repositoryId,
			uploadSessionId: upload._id,
			status: "queued",
			attempt: 0,
			createdAt: now,
			updatedAt: now,
		});
		return { jobId, enqueueRequired: true };
	},
});

export const recordProcessingResult = internalMutation({
	args: {
		uploadSessionId: v.id("uploadSessions"),
		succeeded: v.boolean(),
		result: v.optional(v.any()),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const upload = await ctx.db.get(args.uploadSessionId);
		if (!upload) throw new Error("Upload session not found");
		const job = await ctx.db
			.query("processingJobs")
			.withIndex("by_upload_session", (q) =>
				q.eq("uploadSessionId", upload._id),
			)
			.unique();
		if (!job) throw new Error("Processing job not found");
		const now = Date.now();
		await Promise.all([
			ctx.db.patch(upload._id, {
				status: args.succeeded ? "ready" : "failed",
				updatedAt: now,
			}),
			ctx.db.patch(job._id, {
				status: args.succeeded ? "succeeded" : "failed",
				result: args.result,
				error: args.error,
				updatedAt: now,
			}),
		]);
	},
});

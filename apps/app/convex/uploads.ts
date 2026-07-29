import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
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
		role: v.optional(v.union(v.literal("primary"), v.literal("evidence"))),
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
		let revisionId: Id<"changeRevisions"> | undefined;
		if (args.changeRequestId) {
			const change = await ctx.db.get(args.changeRequestId);
			if (!change || change.repositoryId !== args.repositoryId) {
				throw new Error("Change request not found");
			}
			if (
				!change.headRevisionId ||
				["merged", "closed"].includes(change.status)
			) {
				throw new Error("This change request cannot receive another document");
			}
			revisionId = change.headRevisionId;
			const [files, uploads] = await Promise.all([
				ctx.db
					.query("changeFiles")
					.withIndex("by_change_request", (q) =>
						q.eq("changeRequestId", change._id),
					)
					.collect(),
				ctx.db
					.query("uploadSessions")
					.withIndex("by_organization", (q) =>
						q.eq("organizationId", session.membership.organizationId),
					)
					.filter((q) => q.eq(q.field("changeRequestId"), change._id))
					.collect(),
			]);
			const activeUploads = uploads.filter(
				(upload) => !["failed", "expired"].includes(upload.status),
			);
			if (files.length + activeUploads.length >= 20) {
				throw new Error("A change request may contain at most 20 files");
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
			revisionId,
			createdBy: session.membership._id,
			fileName: args.fileName,
			mimeType: args.mimeType,
			size: args.size,
			objectKey,
			azureBlobRef,
			role: args.role ?? "primary",
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
			idempotencyKey: `process:${upload._id}:${args.sha256.toLowerCase()}`,
			status: "queued",
			attempt: 0,
			createdAt: now,
			updatedAt: now,
		});
		if (upload.changeRequestId && upload.revisionId) {
			await ctx.db.insert("checkRuns", {
				organizationId: upload.organizationId,
				repositoryId: upload.repositoryId,
				changeRequestId: upload.changeRequestId,
				revisionId: upload.revisionId,
				name: "Document processing",
				description: `${upload.fileName} is being scanned, validated, extracted, and compared.`,
				conclusion: "queued",
				required: true,
				details: { uploadSessionId: String(upload._id) },
				createdAt: now,
				updatedAt: now,
			});
		}
		await ctx.scheduler.runAfter(0, internal.uploads.dispatchProcessing, {
			processingJobId: jobId,
		});
		return { jobId, enqueueRequired: true };
	},
});

export const retry = mutation({
	args: { uploadSessionId: v.id("uploadSessions") },
	handler: async (ctx, args) => {
		const upload = await ctx.db.get(args.uploadSessionId);
		if (!upload?.sha256) throw new Error("Upload is not ready to retry");
		const session = await requireRepositoryAccess(
			ctx,
			upload.repositoryId,
			"contribute",
		);
		if (
			upload.createdBy !== session.membership._id &&
			!["administrator", "owner"].includes(session.membership.role)
		) {
			throw new Error("Only the uploader or an administrator can retry");
		}
		const job = await ctx.db
			.query("processingJobs")
			.withIndex("by_upload_session", (q) =>
				q.eq("uploadSessionId", upload._id),
			)
			.unique();
		if (!job || job.status !== "failed") {
			throw new Error("This processing job is not retryable");
		}
		const now = Date.now();
		await Promise.all([
			ctx.db.patch(job._id, {
				idempotencyKey: `process:${upload._id}:${upload.sha256}:retry${job.attempt + 1}`,
				status: "queued",
				error: undefined,
				updatedAt: now,
			}),
			ctx.db.patch(upload._id, {
				status: "uploaded",
				updatedAt: now,
			}),
		]);
		if (upload.changeRequestId) {
			const checks = await ctx.db
				.query("checkRuns")
				.withIndex("by_change_request", (q) =>
					q.eq(
						"changeRequestId",
						upload.changeRequestId as Id<"changeRequests">,
					),
				)
				.collect();
			const check = checks.find(
				(item) =>
					item.name === "Document processing" &&
					(item.details as { uploadSessionId?: string } | undefined)
						?.uploadSessionId === String(upload._id),
			);
			if (check) {
				await ctx.db.patch(check._id, {
					conclusion: "queued",
					description: `${upload.fileName} was queued for another processing attempt.`,
					updatedAt: now,
				});
			}
		}
		await ctx.scheduler.runAfter(0, internal.uploads.dispatchProcessing, {
			processingJobId: job._id,
		});
		return { ok: true as const, processingJobId: job._id };
	},
});

export const getProcessingCommand = internalQuery({
	args: { processingJobId: v.id("processingJobs") },
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.processingJobId);
		if (!job) return null;
		const upload = await ctx.db.get(job.uploadSessionId);
		if (!upload?.sha256) return null;
		let baseVersionRef: string | undefined;
		let baseFields:
			| Array<{
					field: string;
					value: string;
					provenance: string;
					confidence?: number;
			  }>
			| undefined;
		if (upload.changeRequestId) {
			const change = await ctx.db.get(upload.changeRequestId);
			if (change?.baseVersionId) {
				const baseVersion = await ctx.db.get(change.baseVersionId);
				baseVersionRef = baseVersion?.azureEvidenceRef;
				if (baseVersion) {
					const fields = await ctx.db
						.query("extractedFields")
						.withIndex("by_revision", (q) =>
							q.eq("revisionId", baseVersion.revisionId),
						)
						.collect();
					baseFields = fields.map((field) => ({
						field: field.field,
						value: field.value,
						provenance: field.provenance,
						confidence: field.confidence,
					}));
				}
			}
		}
		return {
			jobId: String(job._id),
			uploadSessionId: String(upload._id),
			idempotencyKey:
				job.idempotencyKey ?? `process:${upload._id}:${upload.sha256}`,
			organizationId: String(upload.organizationId),
			repositoryId: String(upload.repositoryId),
			changeRequestId: upload.changeRequestId
				? String(upload.changeRequestId)
				: undefined,
			revisionId: upload.revisionId ? String(upload.revisionId) : undefined,
			objectKey: upload.objectKey,
			azureBlobRef: upload.azureBlobRef,
			fileName: upload.fileName,
			mimeType: upload.mimeType,
			expectedSize: upload.size,
			expectedSha256: upload.sha256,
			baseVersionRef,
			baseFields,
		};
	},
});

export const dispatchProcessing = internalAction({
	args: { processingJobId: v.id("processingJobs") },
	handler: async (ctx, args) => {
		const command = await ctx.runQuery(
			internal.uploads.getProcessingCommand,
			args,
		);
		if (!command) {
			await ctx.runMutation(internal.uploads.recordDispatchFailure, {
				processingJobId: args.processingJobId,
				error: "Processing inputs are no longer available.",
			});
			return;
		}
		const baseUrl = process.env.AZURE_INTEGRATION_URL;
		const token = process.env.AZURE_INTEGRATION_TOKEN;
		if (!baseUrl || !token) {
			await ctx.runMutation(internal.uploads.recordDispatchFailure, {
				processingJobId: args.processingJobId,
				error: "Azure document processing is not configured.",
			});
			return;
		}
		await ctx.runMutation(internal.uploads.markProcessingRunning, {
			processingJobId: args.processingJobId,
		});
		try {
			const response = await fetch(`${baseUrl.replace(/\/$/, "")}/processing`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(command),
			});
			if (!response.ok) {
				throw new Error(
					`Azure processing intake returned ${response.status}: ${await response.text()}`,
				);
			}
			const accepted = (await response.json()) as { commandId?: string };
			await ctx.runMutation(internal.uploads.recordProcessingAccepted, {
				processingJobId: args.processingJobId,
				commandId: accepted.commandId ?? command.jobId,
			});
		} catch (error) {
			await ctx.runMutation(internal.uploads.recordDispatchFailure, {
				processingJobId: args.processingJobId,
				error:
					error instanceof Error
						? error.message
						: "Azure processing intake failed.",
			});
		}
	},
});

export const markProcessingRunning = internalMutation({
	args: { processingJobId: v.id("processingJobs") },
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.processingJobId);
		if (!job || job.status === "succeeded") return;
		const now = Date.now();
		const upload = await ctx.db.get(job.uploadSessionId);
		await Promise.all([
			ctx.db.patch(job._id, {
				status: "running",
				attempt: job.attempt + 1,
				error: undefined,
				updatedAt: now,
			}),
			upload
				? ctx.db.patch(upload._id, {
						status: "processing",
						updatedAt: now,
					})
				: Promise.resolve(),
		]);
	},
});

export const recordProcessingAccepted = internalMutation({
	args: {
		processingJobId: v.id("processingJobs"),
		commandId: v.string(),
	},
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.processingJobId);
		if (!job || job.status === "succeeded") return;
		await ctx.db.patch(job._id, {
			commandId: args.commandId,
			updatedAt: Date.now(),
		});
	},
});

export const recordDispatchFailure = internalMutation({
	args: { processingJobId: v.id("processingJobs"), error: v.string() },
	handler: async (ctx, args) => {
		const job = await ctx.db.get(args.processingJobId);
		if (!job || job.status === "succeeded") return;
		const upload = await ctx.db.get(job.uploadSessionId);
		await Promise.all([
			ctx.db.patch(job._id, {
				status: "failed",
				error: args.error,
				updatedAt: Date.now(),
			}),
			upload
				? ctx.db.patch(upload._id, {
						status: "failed",
						updatedAt: Date.now(),
					})
				: Promise.resolve(),
		]);
		if (upload?.changeRequestId) {
			const checks = await ctx.db
				.query("checkRuns")
				.withIndex("by_change_request", (q) =>
					q.eq(
						"changeRequestId",
						upload.changeRequestId as Id<"changeRequests">,
					),
				)
				.collect();
			const processingCheck = checks.find(
				(check) =>
					check.name === "Document processing" &&
					(check.details as { uploadSessionId?: string } | undefined)
						?.uploadSessionId === String(upload._id),
			);
			if (processingCheck) {
				await ctx.db.patch(processingCheck._id, {
					conclusion: "failed",
					description: args.error,
					updatedAt: Date.now(),
				});
			}
		}
	},
});

export const recordProcessingResult = internalMutation({
	args: {
		uploadSessionId: v.id("uploadSessions"),
		idempotencyKey: v.string(),
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
		if (job.idempotencyKey !== args.idempotencyKey) {
			throw new Error("Processing callback does not match this upload");
		}
		if (job.status === "succeeded") return;
		const now = Date.now();
		const result = args.result as
			| {
					sha256?: string;
					detectedMimeType?: string;
					malwareScan?: string;
					extracted?: Array<{
						field: string;
						value: string;
						provenance: string;
						confidence?: number;
					}>;
					findings?: Array<{
						field: string;
						before?: string;
						after?: string;
						provenance: string;
						severity: "info" | "warning" | "critical";
						source: "deterministic" | "advisory-ai";
					}>;
					textDiff?: Array<{
						type: "added" | "removed" | "unchanged";
						content: string;
					}>;
					visualManifestKey?: string;
					processorVersion?: string;
			  }
			| undefined;
		const checksumMatches =
			!args.succeeded ||
			(Boolean(result?.sha256) &&
				result?.sha256?.toLowerCase() === upload.sha256?.toLowerCase());
		const succeeded =
			args.succeeded &&
			checksumMatches &&
			result?.malwareScan === "clean" &&
			Boolean(upload.sha256);
		const error =
			args.error ??
			(checksumMatches
				? result?.malwareScan === "clean"
					? undefined
					: "The document did not pass malware scanning."
				: "Azure returned a checksum that does not match the uploaded file.");
		await Promise.all([
			ctx.db.patch(upload._id, {
				status: succeeded ? "ready" : "failed",
				updatedAt: now,
			}),
			ctx.db.patch(job._id, {
				status: succeeded ? "succeeded" : "failed",
				result: args.result,
				error,
				updatedAt: now,
			}),
		]);
		if (!upload.changeRequestId || !upload.revisionId) return;
		const checks = await ctx.db
			.query("checkRuns")
			.withIndex("by_change_request", (q) =>
				q.eq("changeRequestId", upload.changeRequestId as Id<"changeRequests">),
			)
			.collect();
		const processingCheck = checks.find(
			(check) =>
				check.name === "Document processing" &&
				(check.details as { uploadSessionId?: string } | undefined)
					?.uploadSessionId === String(upload._id),
		);
		if (processingCheck) {
			await ctx.db.patch(processingCheck._id, {
				conclusion: succeeded ? "passed" : "failed",
				description: succeeded
					? `${upload.fileName} passed malware, format, checksum, and extraction checks.`
					: error || `${upload.fileName} could not be processed.`,
				details: {
					...(processingCheck.details as Record<string, unknown> | undefined),
					processorVersion: result?.processorVersion,
					detectedMimeType: result?.detectedMimeType,
				},
				updatedAt: now,
			});
		}
		if (!succeeded || !result || !upload.sha256) return;
		const files = await ctx.db
			.query("changeFiles")
			.withIndex("by_revision", (q) =>
				q.eq("revisionId", upload.revisionId as Id<"changeRevisions">),
			)
			.collect();
		if (files.some((file) => file.objectKey === upload.objectKey)) return;
		const fileId = await ctx.db.insert("changeFiles", {
			organizationId: upload.organizationId,
			repositoryId: upload.repositoryId,
			changeRequestId: upload.changeRequestId,
			revisionId: upload.revisionId,
			name: upload.fileName,
			mimeType: result.detectedMimeType ?? upload.mimeType,
			size: upload.size,
			sha256: upload.sha256,
			role: upload.role ?? "primary",
			objectKey: upload.objectKey,
			azureBlobRef: upload.azureBlobRef,
			processingStatus: "ready",
			createdAt: now,
		});
		for (const extracted of result.extracted ?? []) {
			await ctx.db.insert("extractedFields", {
				organizationId: upload.organizationId,
				changeRequestId: upload.changeRequestId,
				revisionId: upload.revisionId,
				fileId,
				field: extracted.field,
				value: extracted.value,
				provenance: extracted.provenance,
				confidence: extracted.confidence,
				createdAt: now,
			});
		}
		await ctx.db.insert("documentDiffs", {
			organizationId: upload.organizationId,
			changeRequestId: upload.changeRequestId,
			revisionId: upload.revisionId,
			baseVersionId: (await ctx.db.get(upload.changeRequestId))?.baseVersionId,
			structured: result.findings ?? [],
			text: result.textDiff ?? [],
			visualManifestKey: result.visualManifestKey,
			createdAt: now,
		});
		for (const finding of result.findings ?? []) {
			await ctx.db.insert("diffFindings", {
				organizationId: upload.organizationId,
				changeRequestId: upload.changeRequestId,
				revisionId: upload.revisionId,
				field: finding.field,
				before: finding.before,
				after: finding.after,
				provenance: finding.provenance,
				severity: finding.severity,
				source: finding.source,
				createdAt: now,
			});
		}
	},
});

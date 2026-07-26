import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
	path: "/integrations/publication-callback",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const body = await request.text();
		const timestamp = request.headers.get("x-tiecamel-timestamp");
		const signature = request.headers.get("x-tiecamel-signature");
		const secret = process.env.AZURE_CALLBACK_SECRET;
		if (
			!secret ||
			!timestamp ||
			!signature ||
			Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000 ||
			!(await validSignature(secret, timestamp, body, signature))
		) {
			return Response.json(
				{ error: "Invalid callback signature" },
				{ status: 401 },
			);
		}
		const callback = JSON.parse(body) as {
			publicationJobId: string;
			idempotencyKey: string;
			succeeded: boolean;
			result?: {
				provider: "azure" | "google-drive" | "one-drive";
				azureEvidenceRef: string;
				publicationManifestRef: string;
				sha256: string;
				externalFileId?: string;
				externalVersionId?: string;
				externalUrl?: string;
				etag?: string;
			};
			error?: { code: string; message: string };
		};
		const publicationJobId = callback.publicationJobId as Id<"publicationJobs">;
		if (callback.succeeded && callback.result) {
			await ctx.runMutation(internal.publications.finalize, {
				publicationJobId,
				idempotencyKey: callback.idempotencyKey,
				result: callback.result,
			});
		} else {
			await ctx.runMutation(internal.publications.recordFailure, {
				publicationJobId,
				code: callback.error?.code ?? "PUBLICATION_FAILED",
				message: callback.error?.message ?? "Publication failed",
			});
		}
		return Response.json({ ok: true });
	}),
});

http.route({
	path: "/integrations/drift-callback",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const body = await request.text();
		const timestamp = request.headers.get("x-tiecamel-timestamp");
		const signature = request.headers.get("x-tiecamel-signature");
		const secret = process.env.AZURE_CALLBACK_SECRET;
		if (
			!secret ||
			!timestamp ||
			!signature ||
			Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000 ||
			!(await validSignature(secret, timestamp, body, signature))
		) {
			return Response.json(
				{ error: "Invalid callback signature" },
				{ status: 401 },
			);
		}
		const event = JSON.parse(body) as {
			provider: "google-drive" | "one-drive";
			externalFileId: string;
			kind: "content-changed" | "deleted" | "moved" | "permission-lost";
			detail: string;
		};
		const result = await ctx.runMutation(internal.drift.record, event);
		return Response.json({ ok: true, ...result });
	}),
});

export default http;

async function validSignature(
	secret: string,
	timestamp: string,
	body: string,
	expected: string,
) {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(`${timestamp}.${body}`),
	);
	const actual = [...new Uint8Array(signature)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return constantTimeEqual(actual, expected.toLowerCase());
}

function constantTimeEqual(left: string, right: string) {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { verifyResend, verifyTwilio } from "./lib/notificationProviders";

const http = httpRouter();

http.route({
	path: "/webhooks/resend",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const raw = await request.text();
		if (raw.length > 128_000)
			return new Response("Payload too large", { status: 413 });
		const secret = process.env.RESEND_WEBHOOK_SECRET;
		if (
			!secret ||
			!(await verifyResend(
				secret,
				raw,
				{
					id: request.headers.get("svix-id") ?? "",
					timestamp: request.headers.get("svix-timestamp") ?? "",
					signature: request.headers.get("svix-signature") ?? "",
				},
				Date.now(),
			))
		)
			return new Response("Invalid signature", { status: 401 });
		try {
			const event = JSON.parse(raw) as {
				type: string;
				data: {
					email_id: string;
					from?: string;
					to?: string[];
					subject?: string;
					attachments?: unknown[];
				};
			};
			if (!event.data || typeof event.data.email_id !== "string")
				return new Response("Invalid event", { status: 400 });
			if (event.type === "email.received")
				await ctx.runMutation(internal.inbound.accept, {
					emailId: event.data.email_id,
					recipients: event.data.to ?? [],
					sender: event.data.from ?? "Unknown sender",
					subject: event.data.subject ?? "Untitled incoming notice",
					attachmentCount: event.data.attachments?.length ?? 0,
				});
			else if (
				[
					"email.delivered",
					"email.bounced",
					"email.failed",
					"email.complained",
				].includes(event.type)
			)
				await ctx.runMutation(internal.delivery.receipt, {
					providerId: event.data.email_id,
					channel: "email",
					status: event.type === "email.delivered" ? "delivered" : "failed",
				});
			return Response.json({ ok: true });
		} catch {
			return new Response("Event could not be processed; retry required", {
				status: 503,
			});
		}
	}),
});
http.route({
	path: "/webhooks/twilio",
	method: "POST",
	handler: httpAction(async (ctx, request) => {
		const raw = await request.text();
		if (raw.length > 32_000)
			return new Response("Payload too large", { status: 413 });
		const secret = process.env.TWILIO_AUTH_TOKEN,
			base = process.env.TIECAMEL_WEBHOOK_BASE;
		const parsedUrl = new URL(request.url);
		const delivery = parsedUrl.searchParams.get("delivery");
		if (
			!secret ||
			!base ||
			!delivery ||
			[...parsedUrl.searchParams.keys()].some((key) => key !== "delivery")
		)
			return new Response("Invalid callback", { status: 401 });
		const publicUrl = `${base.replace(/\/$/, "")}/webhooks/twilio?delivery=${encodeURIComponent(delivery)}`;
		const params = new URLSearchParams(raw);
		if (
			!(await verifyTwilio(
				secret,
				publicUrl,
				params,
				request.headers.get("x-twilio-signature") ?? "",
			))
		)
			return new Response("Invalid signature", { status: 401 });
		const state = params.get("MessageStatus"),
			sid = params.get("MessageSid");
		if (!sid || !state) return new Response("Missing message", { status: 400 });
		if (
			[
				"delivered",
				"read",
				"failed",
				"undelivered",
				"sent",
				"queued",
				"accepted",
			].includes(state)
		)
			await ctx.runMutation(internal.delivery.receipt, {
				deliveryId: delivery as Id<"notificationOutbox">,
				providerId: sid,
				channel: "whatsapp",
				status: ["delivered", "read"].includes(state)
					? "delivered"
					: ["failed", "undelivered"].includes(state)
						? "failed"
						: "accepted",
			});
		return Response.json({ ok: true });
	}),
});

http.route({
	path: "/health/governance",
	method: "GET",
	handler: httpAction(async (ctx) => {
		const health = await ctx.runQuery(internal.health.governance, {});
		return Response.json(health, {
			status: health.ok ? 200 : 503,
			headers: { "Cache-Control": "no-store" },
		});
	}),
});

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
				manifestSha256: string;
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
	path: "/integrations/processing-callback",
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
			uploadSessionId: string;
			idempotencyKey: string;
			succeeded: boolean;
			result?: unknown;
			error?: { code: string; message: string };
		};
		await ctx.runMutation(internal.uploads.recordProcessingResult, {
			uploadSessionId: callback.uploadSessionId as Id<"uploadSessions">,
			idempotencyKey: callback.idempotencyKey,
			succeeded: callback.succeeded,
			result: callback.result,
			error: callback.error?.message,
		});
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

http.route({
	path: "/integrations/integrity-callback",
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
			integrityAnchorId: string;
			idempotencyKey: string;
			succeeded: boolean;
			result?: {
				signature: string;
				slot: number;
				explorerUrl: string;
				observedMemo?: string;
			};
			error?: { code: string; message: string };
		};
		const integrityAnchorId =
			callback.integrityAnchorId as Id<"integrityAnchors">;
		if (callback.succeeded && callback.result) {
			await ctx.runMutation(internal.integrity.finalize, {
				integrityAnchorId,
				idempotencyKey: callback.idempotencyKey,
				...callback.result,
			});
		} else {
			await ctx.runMutation(internal.integrity.recordFailure, {
				integrityAnchorId,
				code: callback.error?.code ?? "ANCHOR_FAILED",
				message: callback.error?.message ?? "Solana anchoring failed",
			});
		}
		return Response.json({ ok: true });
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

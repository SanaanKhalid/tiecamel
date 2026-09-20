import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	internalAction,
	internalMutation,
	mutation,
	query,
} from "./_generated/server";
import { requirePlatformSession } from "./lib/platformAuth";

const scope = {
	organizationId: v.id("organizations"),
	demoSessionToken: v.optional(v.string()),
};
export const inbox = query({
	args: scope,
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(
			ctx,
			args.demoSessionToken,
			args.organizationId,
		);
		if (session.membership.role === "member")
			throw new Error("Board access required");
		const [route, notices] = await Promise.all([
			ctx.db
				.query("inboundMailRoutes")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", args.organizationId),
				)
				.unique(),
			ctx.db
				.query("inboundNotices")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", args.organizationId),
				)
				.order("desc")
				.take(100),
		]);
		return {
			address: route?.address ?? null,
			configured:
				!!process.env.TIECAMEL_INBOUND_DOMAIN &&
				!!process.env.RESEND_WEBHOOK_SECRET &&
				!!process.env.RESEND_API_KEY,
			notices,
		};
	},
});
export const enable = mutation({
	args: scope,
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(
			ctx,
			args.demoSessionToken,
			args.organizationId,
		);
		if (
			!["board", "secretary", "owner", "administrator"].includes(
				session.membership.role,
			)
		)
			throw new Error("A director or secretary must enable the notice inbox");
		if ("demoSessionId" in session)
			throw new Error("Live email forwarding is disabled for demos");
		const domain = process.env.TIECAMEL_INBOUND_DOMAIN;
		if (
			!domain ||
			!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain) ||
			!process.env.RESEND_WEBHOOK_SECRET ||
			!process.env.RESEND_API_KEY
		)
			throw new Error(
				"Verified inbound email domain and webhook are not configured",
			);
		const existing = await ctx.db
			.query("inboundMailRoutes")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.unique();
		if (existing) return existing.address;
		const address = `notices-${crypto.randomUUID().replaceAll("-", "")}@${domain.toLowerCase()}`;
		await ctx.db.insert("inboundMailRoutes", {
			organizationId: args.organizationId,
			address,
			createdAt: Date.now(),
		});
		return address;
	},
});
export const accept = internalMutation({
	args: {
		emailId: v.string(),
		recipients: v.array(v.string()),
		sender: v.string(),
		subject: v.string(),
		attachmentCount: v.number(),
	},
	handler: async (ctx, args) => {
		if (!/^[a-zA-Z0-9_-]{1,100}$/.test(args.emailId))
			throw new Error("Invalid provider email identifier");
		if (
			await ctx.db
				.query("inboundNotices")
				.withIndex("by_provider_email", (q) =>
					q.eq("providerEmailId", args.emailId),
				)
				.unique()
		)
			return;
		const routes = await Promise.all(
			args.recipients.slice(0, 20).map((recipient) =>
				ctx.db
					.query("inboundMailRoutes")
					.withIndex("by_address", (q) =>
						q.eq("address", recipient.trim().toLowerCase()),
					)
					.unique(),
			),
		);
		const orgs = new Set(
			routes
				.filter((route) => route !== null)
				.map((route) => String(route.organizationId)),
		);
		// Never copy a multi-organization message into multiple private workspaces.
		if (orgs.size !== 1) return;
		const route = routes.find((entry) => entry !== null);
		if (!route) return;
		const organization = await ctx.db.get(route.organizationId);
		if (
			!organization ||
			organization.demoOnly ||
			organization.status === "suspended"
		)
			return;
		const recent = await ctx.db
			.query("inboundNotices")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", route.organizationId),
			)
			.order("desc")
			.take(101);
		if (
			recent.filter((entry) => entry.createdAt > Date.now() - 3_600_000)
				.length >= 100
		)
			throw new Error("Inbox capacity exceeded; provider should retry later");
		const id = await ctx.db.insert("inboundNotices", {
			organizationId: route.organizationId,
			providerEmailId: args.emailId,
			sender: args.sender.slice(0, 500),
			subject: args.subject.slice(0, 300),
			excerpt: "",
			attachmentCount: Math.max(0, Math.floor(args.attachmentCount)),
			status: "pending",
			createdAt: Date.now(),
		});
		await ctx.scheduler.runAfter(0, internal.inbound.retrieve, {
			id,
			emailId: args.emailId,
		});
	},
});
export const retrieve = internalAction({
	args: { id: v.id("inboundNotices"), emailId: v.string() },
	handler: async (ctx, args) => {
		try {
			if (!process.env.RESEND_API_KEY)
				throw new Error("Received-email retrieval is not configured");
			const response = await fetch(
				`https://api.resend.com/emails/receiving/${encodeURIComponent(args.emailId)}`,
				{
					headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
					signal: AbortSignal.timeout(15_000),
				},
			);
			if (!response.ok)
				throw new Error(
					`Received-email retrieval failed (HTTP ${response.status})`,
				);
			const message = (await response.json()) as {
				text?: string;
				html?: string;
			};
			// HTML is never rendered or interpreted as instructions. Attachments stay at the provider
			// until a human transfers them through the managed, scanned document upload workflow.
			const excerpt = (
				message.text ??
				"This email has no plain-text body. Review the original email and upload its notice through Documents."
			).slice(0, 16_000);
			await ctx.runMutation(internal.inbound.retrieved, {
				id: args.id,
				excerpt,
			});
		} catch (error) {
			await ctx.runMutation(internal.inbound.retrieved, {
				id: args.id,
				error: error instanceof Error ? error.message : "Retrieval failed",
			});
		}
	},
});
export const retrieved = internalMutation({
	args: {
		id: v.id("inboundNotices"),
		excerpt: v.optional(v.string()),
		error: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const notice = await ctx.db.get(args.id);
		if (!notice || notice.status === "linked") return;
		await ctx.db.patch(notice._id, {
			status: args.error ? "failed" : "unconfirmed",
			excerpt: args.excerpt ?? notice.excerpt,
			error: args.error,
		});
	},
});
export const retryRetrieval = mutation({
	args: { ...scope, id: v.id("inboundNotices") },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(
			ctx,
			args.demoSessionToken,
			args.organizationId,
		);
		if (session.membership.role === "member")
			throw new Error("Board access required");
		const notice = await ctx.db.get(args.id);
		if (
			!notice ||
			notice.organizationId !== args.organizationId ||
			notice.status !== "failed"
		)
			throw new Error("Failed notice not found");
		await ctx.db.patch(notice._id, { status: "pending", error: undefined });
		await ctx.scheduler.runAfter(0, internal.inbound.retrieve, {
			id: notice._id,
			emailId: notice.providerEmailId,
		});
	},
});

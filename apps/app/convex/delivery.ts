import { v } from "convex/values";
import { escalationFor } from "../src/governance/model";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	action,
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { nextDeliveryStatus, sendAlert } from "./lib/notificationProviders";
import { requirePlatformSession } from "./lib/platformAuth";

const scope = {
	organizationId: v.id("organizations"),
	demoSessionToken: v.optional(v.string()),
};
export const status = query({
	args: scope,
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(
			ctx,
			args.demoSessionToken,
			args.organizationId,
		);
		if (session.membership.role === "member")
			throw new Error("Board access required");
		const rows = await ctx.db
			.query("notificationOutbox")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.order("desc")
			.take(100);
		const monitor = await ctx.db
			.query("governanceMonitor")
			.withIndex("by_name", (q) => q.eq("name", "notification-delivery"))
			.unique();
		return {
			enabled: process.env.TIECAMEL_ALERT_DELIVERY_ENABLED === "true",
			lastWorkerAt: monitor?.lastSweepAt ?? null,
			rows: rows.map((row) => ({
				id: row._id,
				channel: row.channel,
				status: row.status,
				attempts: row.attempts,
				error: row.error,
				updatedAt: row.updatedAt,
				membershipId: row.membershipId,
			})),
		};
	},
});
export const claim = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const stuck = await ctx.db
			.query("notificationOutbox")
			.withIndex("by_status_and_next", (q) => q.eq("status", "sending"))
			.take(20);
		for (const row of stuck)
			if ((row.leaseUntil ?? 0) <= now)
				await ctx.db.patch(row._id, {
					status:
						row.channel === "email" && now - row.createdAt < 20 * 3_600_000
							? "queued"
							: "uncertain",
					error: "Worker lease expired; delivery needs reconciliation",
					nextAttemptAt: now,
					leaseToken: undefined,
					leaseUntil: undefined,
				});
		const due = await ctx.db
			.query("notificationOutbox")
			.withIndex("by_status_and_next", (q) =>
				q.eq("status", "queued").lte("nextAttemptAt", now),
			)
			.take(20);
		const claims: { id: Id<"notificationOutbox">; token: string }[] = [];
		for (const row of due) {
			if (row.attempts >= 5 || now - row.createdAt >= 20 * 3_600_000) {
				await ctx.db.patch(row._id, {
					status: "failed",
					error: "Retry budget expired; board intervention required",
					updatedAt: now,
				});
				continue;
			}
			const token = crypto.randomUUID();
			await ctx.db.patch(row._id, {
				status: "sending",
				attempts: row.attempts + 1,
				leaseToken: token,
				leaseUntil: now + 120_000,
				updatedAt: now,
			});
			claims.push({ id: row._id, token });
		}
		return claims;
	},
});
export const context = internalQuery({
	args: { id: v.id("notificationOutbox"), token: v.string() },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.id);
		if (!row || row.status !== "sending" || row.leaseToken !== args.token)
			return null;
		const [organization, membership, contact, alert] = await Promise.all([
			ctx.db.get(row.organizationId),
			ctx.db.get(row.membershipId),
			ctx.db
				.query("alertContacts")
				.withIndex("by_member", (q) => q.eq("membershipId", row.membershipId))
				.unique(),
			ctx.db.get(row.alertId),
		]);
		const user = membership ? await ctx.db.get(membership.userId) : null;
		const obligation = alert ? await ctx.db.get(alert.obligationId) : null;
		const state = obligation?.control;
		if (
			!organization ||
			organization.demoOnly ||
			organization.status === "suspended" ||
			membership?.status !== "active" ||
			membership.role === "member" ||
			membership.organizationId !== row.organizationId ||
			alert?.organizationId !== row.organizationId ||
			alert.membershipId !== row.membershipId ||
			obligation?.organizationId !== row.organizationId ||
			!state ||
			!user ||
			state.phase === "resolved"
		)
			return null;
		const eligible =
			state.ownerId === String(membership._id) ||
			state.backupId === String(membership._id) ||
			(state.reviewerId === String(membership._id) &&
				escalationFor(state, Date.now()) >= 3) ||
			(state.critical && membership.role === "board");
		if (!eligible) return null;
		const destination =
			row.channel === "email" ? user.email : (contact?.whatsappNumber ?? "");
		const optedIn =
			row.channel === "email"
				? !!user.email
				: !!contact?.whatsappConsentedAt && !!contact?.whatsappVerifiedAt;
		return { row, destination, optedIn, slug: organization.slug };
	},
});
export const finish = internalMutation({
	args: {
		id: v.id("notificationOutbox"),
		token: v.string(),
		status: v.union(
			v.literal("accepted"),
			v.literal("blocked"),
			v.literal("failed"),
			v.literal("uncertain"),
			v.literal("suppressed"),
		),
		providerId: v.optional(v.string()),
		error: v.optional(v.string()),
		retryable: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.id);
		if (!row || row.leaseToken !== args.token || row.status === "delivered")
			return;
		const now = Date.now();
		const retry =
			args.retryable &&
			row.attempts < 5 &&
			now - row.createdAt < 20 * 3_600_000;
		const providerId = args.providerId;
		const receipt = providerId
			? await ctx.db
					.query("deliveryReceipts")
					.withIndex("by_provider_and_channel", (q) =>
						q.eq("providerId", providerId).eq("channel", row.channel),
					)
					.unique()
			: null;
		const status = receipt?.status ?? (retry ? "queued" : args.status);
		await ctx.db.patch(row._id, {
			status:
				status === "accepted"
					? (nextDeliveryStatus(
							row.status,
							"accepted",
						) as Doc<"notificationOutbox">["status"])
					: status,
			providerId: args.providerId ?? row.providerId,
			error:
				status === "failed" && receipt
					? "Provider reported delivery failure"
					: args.error,
			nextAttemptAt: now + Math.min(60, 2 ** row.attempts) * 60_000,
			leaseToken: undefined,
			leaseUntil: undefined,
			updatedAt: now,
		});
	},
});
export const heartbeat = internalMutation({
	args: {},
	handler: async (ctx) => {
		const row = await ctx.db
			.query("governanceMonitor")
			.withIndex("by_name", (q) => q.eq("name", "notification-delivery"))
			.unique();
		if (row) await ctx.db.patch(row._id, { lastSweepAt: Date.now() });
		else
			await ctx.db.insert("governanceMonitor", {
				name: "notification-delivery",
				lastSweepAt: Date.now(),
			});
	},
});
export const dispatch = internalAction({
	args: {},
	handler: async (ctx) => {
		const claims: { id: Id<"notificationOutbox">; token: string }[] =
			await ctx.runMutation(internal.delivery.claim, {});
		await Promise.all(
			claims.map(async (claim) => {
				const context = await ctx.runQuery(internal.delivery.context, claim);
				if (!context) {
					await ctx.runMutation(internal.delivery.finish, {
						...claim,
						status: "suppressed",
						error:
							"Demo, inactive membership, resolved case or unavailable organization",
					});
					return;
				}
				const result = await sendAlert(
					{
						id: claim.id,
						channel: context.row.channel,
						destination: context.destination,
						optedIn: context.optedIn,
						url: `${process.env.TIECAMEL_APP_URL ?? ""}/${encodeURIComponent(context.slug)}/responsibilities`,
					},
					{
						enabled: process.env.TIECAMEL_ALERT_DELIVERY_ENABLED,
						resendKey: process.env.RESEND_API_KEY,
						emailFrom: process.env.TIECAMEL_ALERT_FROM,
						twilioSid: process.env.TWILIO_ACCOUNT_SID,
						twilioToken: process.env.TWILIO_AUTH_TOKEN,
						whatsappFrom: process.env.TWILIO_WHATSAPP_FROM,
						templateSid: process.env.TWILIO_ALERT_TEMPLATE_SID,
						callbackBase: process.env.TIECAMEL_WEBHOOK_BASE,
					},
				);
				await ctx.runMutation(internal.delivery.finish, {
					...claim,
					...result,
				});
			}),
		);
		await ctx.runMutation(internal.delivery.heartbeat, {});
	},
});
export const retryBlocked = mutation({
	args: { ...scope, id: v.id("notificationOutbox") },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(
			ctx,
			args.demoSessionToken,
			args.organizationId,
		);
		if (
			!["board", "secretary", "administrator", "owner"].includes(
				session.membership.role,
			)
		)
			throw new Error("Board delivery oversight is required");
		const row = await ctx.db.get(args.id);
		if (
			!row ||
			row.organizationId !== args.organizationId ||
			!["blocked", "failed"].includes(row.status)
		)
			throw new Error("Only known blocked or failed deliveries may be retried");
		if (row.attempts >= 5 || Date.now() - row.createdAt >= 20 * 3_600_000)
			throw new Error(
				"Retry budget expired. Record direct human follow-up instead.",
			);
		await ctx.db.patch(row._id, {
			status: "queued",
			nextAttemptAt: Date.now(),
			error: undefined,
			updatedAt: Date.now(),
		});
	},
});
/** Only invoked after the provider signature has been checked by the HTTP boundary. */
export const receipt = internalMutation({
	args: {
		deliveryId: v.optional(v.id("notificationOutbox")),
		providerId: v.string(),
		channel: v.union(v.literal("email"), v.literal("whatsapp")),
		status: v.union(
			v.literal("accepted"),
			v.literal("delivered"),
			v.literal("failed"),
		),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("deliveryReceipts")
			.withIndex("by_provider_and_channel", (q) =>
				q.eq("providerId", args.providerId).eq("channel", args.channel),
			)
			.unique();
		const receiptStatus = nextDeliveryStatus(
			existing?.status ?? "queued",
			args.status,
		) as "accepted" | "delivered" | "failed";
		if (existing)
			await ctx.db.patch(existing._id, {
				status: receiptStatus,
				receivedAt: Date.now(),
			});
		else
			await ctx.db.insert("deliveryReceipts", {
				providerId: args.providerId,
				channel: args.channel,
				status: receiptStatus,
				receivedAt: Date.now(),
			});
		const row = args.deliveryId
			? await ctx.db.get(args.deliveryId)
			: await ctx.db
					.query("notificationOutbox")
					.withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
					.unique();
		if (
			!row ||
			row.channel !== args.channel ||
			(row.providerId && row.providerId !== args.providerId)
		)
			return;
		await ctx.db.patch(row._id, {
			providerId: args.providerId,
			status: nextDeliveryStatus(
				row.status,
				args.status,
			) as Doc<"notificationOutbox">["status"],
			error:
				args.status === "failed"
					? "Provider reported delivery failure"
					: row.error,
			updatedAt: Date.now(),
		});
		// A provider delivery/read receipt must NEVER write governance acknowledgement or approval.
	},
});
export const myContact = query({
	args: scope,
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(
			ctx,
			args.demoSessionToken,
			args.organizationId,
		);
		const contact = await ctx.db
			.query("alertContacts")
			.withIndex("by_member", (q) =>
				q.eq("membershipId", session.membership._id),
			)
			.unique();
		return {
			membershipId: session.membership._id,
			email: session.user.email,
			contact,
			demo: "demoSessionId" in session,
		};
	},
});
export const setWhatsAppConsent = mutation({
	args: { ...scope, number: v.string(), consent: v.boolean() },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(
			ctx,
			args.demoSessionToken,
			args.organizationId,
		);
		if (!/^\+[1-9]\d{7,14}$/.test(args.number))
			throw new Error(
				"Use a valid international phone number, for example +15551234567",
			);
		const current = await ctx.db
			.query("alertContacts")
			.withIndex("by_member", (q) =>
				q.eq("membershipId", session.membership._id),
			)
			.unique();
		const values = {
			organizationId: args.organizationId,
			membershipId: session.membership._id,
			whatsappNumber: args.number,
			whatsappConsentedAt: args.consent ? Date.now() : undefined,
			whatsappVerifiedAt:
				current?.whatsappNumber === args.number
					? current.whatsappVerifiedAt
					: undefined,
			updatedAt: Date.now(),
		};
		if (current) await ctx.db.patch(current._id, values);
		else await ctx.db.insert("alertContacts", values);
	},
});
export const verifyPhone = action({
	args: { ...scope, code: v.optional(v.string()) },
	handler: async (ctx, args): Promise<{ verified: boolean }> => {
		const { api } = await import("./_generated/api");
		const current = await ctx.runQuery(api.delivery.myContact, {
			organizationId: args.organizationId,
			demoSessionToken: args.demoSessionToken,
		});
		if (current.demo)
			throw new Error("Phone verification is disabled in demos");
		const phone = current.contact?.whatsappNumber;
		if (!phone || !current.contact?.whatsappConsentedAt)
			throw new Error("Opt in with your own phone number first");
		const sid = process.env.TWILIO_ACCOUNT_SID,
			token = process.env.TWILIO_AUTH_TOKEN,
			service = process.env.TWILIO_VERIFY_SERVICE_SID;
		if (
			process.env.TIECAMEL_ALERT_DELIVERY_ENABLED !== "true" ||
			!sid ||
			!token ||
			!service
		)
			throw new Error("Phone verification is not configured");
		if (args.code && !/^\d{4,10}$/.test(args.code))
			throw new Error("Enter the verification code");
		await ctx.runMutation(internal.delivery.reservePhoneVerification, {
			membershipId: current.membershipId,
			number: phone,
		});
		const response = await fetch(
			`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/${args.code ? "VerificationCheck" : "Verifications"}`,
			{
				method: "POST",
				headers: {
					Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams(
					args.code
						? { To: phone, Code: args.code }
						: { To: phone, Channel: "whatsapp" },
				),
				signal: AbortSignal.timeout(15_000),
			},
		);
		if (!response.ok)
			throw new Error(
				"Phone verification failed; check your number or code and try later",
			);
		const result = (await response.json()) as { status: string };
		if (result.status === "approved") {
			await ctx.runMutation(internal.delivery.markPhoneVerified, {
				membershipId: current.membershipId,
				number: phone,
			});
			return { verified: true };
		}
		return { verified: false };
	},
});
export const reservePhoneVerification = internalMutation({
	args: { membershipId: v.id("memberships"), number: v.string() },
	handler: async (ctx, args) => {
		const contact = await ctx.db
			.query("alertContacts")
			.withIndex("by_member", (q) => q.eq("membershipId", args.membershipId))
			.unique();
		if (
			!contact ||
			contact.whatsappNumber !== args.number ||
			!contact.whatsappConsentedAt
		)
			throw new Error("Contact changed during verification");
		const now = Date.now();
		const inWindow = now - (contact.verificationWindowAt ?? 0) < 15 * 60_000;
		if (inWindow && (contact.verificationAttempts ?? 0) >= 5)
			throw new Error(
				"Too many verification requests. Try again in 15 minutes.",
			);
		await ctx.db.patch(contact._id, {
			verificationWindowAt: inWindow ? contact.verificationWindowAt : now,
			verificationAttempts: inWindow
				? (contact.verificationAttempts ?? 0) + 1
				: 1,
		});
	},
});
export const markPhoneVerified = internalMutation({
	args: { membershipId: v.id("memberships"), number: v.string() },
	handler: async (ctx, args) => {
		const contact = await ctx.db
			.query("alertContacts")
			.withIndex("by_member", (q) => q.eq("membershipId", args.membershipId))
			.unique();
		if (
			!contact ||
			contact.whatsappNumber !== args.number ||
			!contact.whatsappConsentedAt
		)
			throw new Error("Contact changed during verification");
		await ctx.db.patch(contact._id, {
			whatsappVerifiedAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});

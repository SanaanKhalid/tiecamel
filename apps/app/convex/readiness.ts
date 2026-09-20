import { v } from "convex/values";
import { pilotReadiness } from "../src/governance/readiness";
import { query } from "./_generated/server";
import { governanceRoster } from "./governance";
import { requirePlatformSession } from "./lib/platformAuth";

export const status = query({
	args: {
		organizationId: v.id("organizations"),
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(
			ctx,
			args.demoSessionToken,
			args.organizationId,
		);
		if (session.membership.role === "member")
			throw new Error("Board access required");
		const [
			roster,
			obligations,
			contacts,
			inbox,
			responsibilityScan,
			deliveryScan,
			organization,
		] = await Promise.all([
			governanceRoster(ctx, args.organizationId),
			ctx.db
				.query("obligations")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", args.organizationId),
				)
				.collect(),
			ctx.db
				.query("alertContacts")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", args.organizationId),
				)
				.collect(),
			ctx.db
				.query("inboundMailRoutes")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", args.organizationId),
				)
				.unique(),
			ctx.db
				.query("governanceMonitor")
				.withIndex("by_name", (q) => q.eq("name", "responsibilities"))
				.unique(),
			ctx.db
				.query("governanceMonitor")
				.withIndex("by_name", (q) => q.eq("name", "notification-delivery"))
				.unique(),
			ctx.db.get(args.organizationId),
		]);
		const secureAppUrl = /^https:\/\//.test(process.env.TIECAMEL_APP_URL ?? "");
		const secureWebhook = /^https:\/\//.test(
			process.env.TIECAMEL_WEBHOOK_BASE ?? "",
		);
		return pilotReadiness({
			demo: organization?.demoOnly === true,
			operationalTest: organization?.operationalTest === true,
			roster,
			cases: obligations.flatMap((row) => (row.control ? [row.control] : [])),
			whatsappMemberIds: contacts
				.filter(
					(row) =>
						row.whatsappNumber &&
						row.whatsappConsentedAt &&
						row.whatsappVerifiedAt,
				)
				.map((row) => String(row.membershipId)),
			config: {
				email: Boolean(
					secureAppUrl &&
						process.env.RESEND_API_KEY &&
						process.env.TIECAMEL_ALERT_FROM &&
						process.env.RESEND_WEBHOOK_SECRET,
				),
				whatsapp: Boolean(
					secureAppUrl &&
						secureWebhook &&
						process.env.TWILIO_ACCOUNT_SID &&
						process.env.TWILIO_AUTH_TOKEN &&
						process.env.TWILIO_WHATSAPP_FROM &&
						(organization?.operationalTest
							? process.env.TWILIO_TEST_ALERT_TEMPLATE_SID
							: process.env.TWILIO_ALERT_TEMPLATE_SID) &&
						process.env.TWILIO_VERIFY_SERVICE_SID,
				),
				inbound: Boolean(
					process.env.TIECAMEL_INBOUND_DOMAIN &&
						process.env.RESEND_API_KEY &&
						process.env.RESEND_WEBHOOK_SECRET,
				),
				deliveryEnabled: process.env.TIECAMEL_ALERT_DELIVERY_ENABLED === "true",
			},
			inboxEnabled: Boolean(inbox),
			scans: {
				responsibilities: responsibilityScan?.lastSweepAt,
				delivery: deliveryScan?.lastSweepAt,
			},
			now: Date.now(),
		});
	},
});

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { sha256Hex } from "./lib/canonical";

export const start = mutation({
	args: { organizationSlug: v.string() },
	handler: async (ctx, args) => {
		assertDemoEnabled();
		let organization = await ctx.db
			.query("organizations")
			.withIndex("by_slug", (q) => q.eq("slug", args.organizationSlug))
			.unique();
		if (!organization) {
			const now = Date.now();
			const organizationId = await ctx.db.insert("organizations", {
				name: "Islamic Center of Naperville",
				slug: args.organizationSlug,
				publicSlug: args.organizationSlug,
				status: "pilot",
				createdAt: now,
			});
			const people = [
				["Muhammad Rahman", "muhammad@demo.tiecamel.com", "owner"],
				["Amina Razzak", "amina@demo.tiecamel.com", "finance"],
				["Samira Khan", "samira@demo.tiecamel.com", "secretary"],
				["Noor Hassan", "noor@demo.tiecamel.com", "reviewer"],
				["Daniel Brooks", "daniel@demo.tiecamel.com", "member"],
				["Omar Shah", "omar@demo.tiecamel.com", "board"],
			] as const;
			for (const [name, email, role] of people) {
				const userId = await ctx.db.insert("users", {
					clerkUserId: `demo:${email}`,
					name,
					email,
					createdAt: now,
				});
				await ctx.db.insert("memberships", {
					organizationId,
					userId,
					role,
					status: "active",
					createdAt: now,
				});
			}
			organization = await ctx.db.get(organizationId);
		}
		if (!organization)
			throw new Error("Demo organization could not be created");
		const memberships = (
			await ctx.db
				.query("memberships")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organization._id),
				)
				.collect()
		).filter((membership) => membership.status === "active");
		if (!memberships.length) throw new Error("Demo members are not seeded");
		const preferred =
			memberships.find((membership) => membership.role === "owner") ??
			memberships[0];
		const token = `tc_demo_${crypto.randomUUID()}_${crypto.randomUUID()}`;
		const now = Date.now();
		await ctx.db.insert("demoSessions", {
			organizationId: organization._id,
			tokenSha256: await sha256Hex(token),
			activeMembershipId: preferred._id,
			allowedMembershipIds: memberships.map((membership) => membership._id),
			expiresAt: now + 24 * 60 * 60 * 1000,
			createdAt: now,
			updatedAt: now,
		});
		return {
			token,
			activeMembershipId: preferred._id,
			expiresAt: now + 24 * 60 * 60 * 1000,
		};
	},
});

export const switchMembership = mutation({
	args: { token: v.string(), membershipId: v.id("memberships") },
	handler: async (ctx, args) => {
		assertDemoEnabled();
		const tokenSha256 = await sha256Hex(args.token);
		const session = await ctx.db
			.query("demoSessions")
			.withIndex("by_token_sha256", (q) => q.eq("tokenSha256", tokenSha256))
			.unique();
		if (
			!session ||
			session.expiresAt <= Date.now() ||
			!session.allowedMembershipIds.includes(args.membershipId)
		) {
			throw new Error("Demo session is invalid or expired");
		}
		await ctx.db.patch(session._id, {
			activeMembershipId: args.membershipId,
			updatedAt: Date.now(),
		});
		return { ok: true as const };
	},
});

/**
 * Development-only bridge that replaces a bundled demo:// baseline with the
 * exact same bytes uploaded to the configured Azure quarantine container.
 * This keeps the seeded fixture convenient while ensuring subsequent change
 * requests exercise the real Azure download and comparison path.
 */
export const attachAzureBaseline = mutation({
	args: {
		token: v.string(),
		recordVersionId: v.id("recordVersions"),
		uploadSessionId: v.id("uploadSessions"),
	},
	handler: async (ctx, args) => {
		assertDemoEnabled();
		const tokenSha256 = await sha256Hex(args.token);
		const session = await ctx.db
			.query("demoSessions")
			.withIndex("by_token_sha256", (q) => q.eq("tokenSha256", tokenSha256))
			.unique();
		if (!session || session.expiresAt <= Date.now()) {
			throw new Error("Demo session is invalid or expired");
		}
		const [version, upload] = await Promise.all([
			ctx.db.get(args.recordVersionId),
			ctx.db.get(args.uploadSessionId),
		]);
		if (
			!version ||
			!upload ||
			version.organizationId !== session.organizationId ||
			upload.organizationId !== session.organizationId ||
			version.repositoryId !== upload.repositoryId ||
			upload.mimeType !== "application/pdf"
		) {
			throw new Error("The demo baseline upload does not match this record");
		}
		const expectedSha256 = version.contentSha256 ?? version.sha256;
		if (!upload.sha256 || upload.sha256 !== expectedSha256) {
			throw new Error(
				"The uploaded baseline checksum does not match the record",
			);
		}
		const now = Date.now();
		await ctx.db.patch(version._id, {
			exactBlobRef: upload.azureBlobRef,
			azureEvidenceRef: upload.azureBlobRef,
		});
		const files = await ctx.db
			.query("changeFiles")
			.withIndex("by_revision", (q) => q.eq("revisionId", version.revisionId))
			.collect();
		const primary = files.find((file) => file.role === "primary");
		if (primary) {
			await ctx.db.patch(primary._id, {
				objectKey: upload.objectKey,
				azureBlobRef: upload.azureBlobRef,
			});
		}
		await ctx.db.patch(upload._id, { status: "ready", updatedAt: now });
		return { ok: true as const, objectRef: upload.azureBlobRef };
	},
});

function assertDemoEnabled() {
	if (process.env.TIECAMEL_DEMO_SESSIONS_ENABLED !== "true") {
		throw new Error("Development demo sessions are disabled");
	}
}

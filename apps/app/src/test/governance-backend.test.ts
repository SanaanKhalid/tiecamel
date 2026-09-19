import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { DAY, type NewResponsibility } from "../governance/model";

const modules = import.meta.glob("../../convex/**/*.ts");
afterEach(() => vi.unstubAllEnvs());
async function setup() {
	const t = convexTest(schema, modules);
	const seed = await t.run(async (ctx) => {
		const now = Date.now();
		const organizationId = await ctx.db.insert("organizations", {
			name: "Pilot",
			slug: "pilot",
			publicSlug: "pilot",
			status: "pilot",
			createdAt: now,
		});
		const otherId = await ctx.db.insert("organizations", {
			name: "Other",
			slug: "other",
			status: "pilot",
			createdAt: now,
		});
		const ids: Id<"memberships">[] = [];
		for (const [i, role] of (
			["finance", "secretary", "reviewer", "board", "member"] as const
		).entries()) {
			const userId = await ctx.db.insert("users", {
				name: `Person ${i}`,
				email: `test${i}@example.invalid`,
				clerkUserId: `clerk-${i}`,
				createdAt: now,
			});
			ids.push(
				await ctx.db.insert("memberships", {
					organizationId,
					userId,
					role,
					status: "active",
					createdAt: now,
				}),
			);
		}
		return { organizationId, otherId, ids };
	});
	const owner = t.withIdentity({ subject: "clerk-0" });
	const input: NewResponsibility = {
		title: "Private tax notice",
		category: "tax",
		critical: true,
		source: "Private source",
		sourceExcerpt: "Confidential legal excerpt",
		ownerId: seed.ids[0],
		backupId: seed.ids[1],
		reviewerId: seed.ids[2],
		dueAt: Date.now() + 10 * DAY,
		timezone: "America/Chicago",
		nextCheckAt: Date.now() + DAY,
		expectedEvidence: "Receipt",
	};
	return { t, owner, ...seed, input };
}
describe("persistent governance authorization and races", () => {
	it("rejects cross-tenant registration and membership assignments", async () => {
		const s = await setup();
		await expect(
			s.owner.mutation(api.governance.register, {
				organizationId: s.otherId,
				input: s.input,
			}),
		).rejects.toThrow("membership");
		const outsider = await s.t.run(async (ctx) => {
			const userId = await ctx.db.insert("users", {
				name: "Other",
				email: "other@example.invalid",
				clerkUserId: "other",
				createdAt: Date.now(),
			});
			return ctx.db.insert("memberships", {
				organizationId: s.otherId,
				userId,
				role: "reviewer",
				status: "active",
				createdAt: Date.now(),
			});
		});
		await expect(
			s.owner.mutation(api.governance.register, {
				organizationId: s.organizationId,
				input: { ...s.input, reviewerId: outsider },
			}),
		).rejects.toThrow("active organization");
	});
	it("records immutable chained events and rejects stale commands", async () => {
		const s = await setup();
		const obligationId = await s.owner.mutation(api.governance.register, {
			organizationId: s.organizationId,
			input: s.input,
		});
		const args = {
			organizationId: s.organizationId,
			obligationId,
			expectedRevision: 1,
			command: { type: "confirm" as const },
		};
		await s.owner.mutation(api.governance.act, args);
		await expect(s.owner.mutation(api.governance.act, args)).rejects.toThrow(
			"changed",
		);
		const events = await s.owner.query(api.governance.history, {
			organizationId: s.organizationId,
			obligationId,
		});
		expect(events).toHaveLength(2);
		expect(events[1].priorEventSha256).toBe(events[0].eventSha256);
	});
	it("provides all-board alert visibility, deduplicates catch-up, and does not leak private content", async () => {
		const s = await setup();
		await s.owner.mutation(api.governance.register, {
			organizationId: s.organizationId,
			input: {
				...s.input,
				dueAt: Date.now() - DAY,
				nextCheckAt: Date.now() - 2 * DAY,
			},
		});
		await s.t.mutation(internal.governance.sweep, {});
		await s.t.mutation(internal.governance.sweep, {});
		const workspace = await s.t
			.withIdentity({ subject: "clerk-3" })
			.query(api.governance.workspace, { organizationId: s.organizationId });
		expect(workspace.cases).toHaveLength(1);
		expect(workspace.alerts).toHaveLength(4);
		expect(
			workspace.alerts.some((entry) => entry.membershipId === s.ids[3]),
		).toBe(true);
		const community = await s.t.query(api.governance.community, {
			organizationSlug: "pilot",
		});
		expect(community?.summary.overdue).toBe(1);
		expect(JSON.stringify(community)).not.toContain("Confidential");
		expect(JSON.stringify(community)).not.toContain("Private source");
	});
	it("blocks ordinary members from private workspace and critical closure before provisioning", async () => {
		const s = await setup();
		await expect(
			s.t
				.withIdentity({ subject: "clerk-4" })
				.query(api.governance.workspace, { organizationId: s.organizationId }),
		).rejects.toThrow("Board workspace");
		const obligationId = await s.owner.mutation(api.governance.register, {
			organizationId: s.organizationId,
			input: s.input,
		});
		await expect(
			s.owner.mutation(api.governance.act, {
				organizationId: s.organizationId,
				obligationId,
				expectedRevision: 1,
				command: { type: "resolve" },
			}),
		).rejects.toThrow("not provisioned");
	});
	it("refuses demo access to an existing pilot organization", async () => {
		const s = await setup();
		vi.stubEnv("TIECAMEL_DEMO_SESSIONS_ENABLED", "true");
		await expect(
			s.t.mutation(api.demoSessions.start, { organizationSlug: "pilot" }),
		).rejects.toThrow("isolated");
		expect(
			await s.t.query(api.demoSessions.validate, { token: "expired" }),
		).toBe(false);
	});
});

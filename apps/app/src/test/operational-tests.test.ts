import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");
const people = (
	["owner", "finance", "reviewer", "board", "member"] as const
).map((role, index) => ({
	clerkUserId: `user_test${index}`,
	name: `Test ${role}`,
	email: `${role}@example.invalid`,
	role,
}));
const input = { slug: "test-pilot", name: "Pilot", people };
function setup() {
	vi.stubEnv("TIECAMEL_OPERATIONAL_TEST_ENABLED", "true");
	vi.stubEnv("CLERK_FRONTEND_API_URL", "https://test.clerk.accounts.dev");
	return convexTest(schema, modules);
}
afterEach(() => vi.unstubAllEnvs());

describe("operational test provisioning", () => {
	it("blocks phone verification sends to non-allowlisted test numbers", async () => {
		const t = setup();
		const { organizationId } = await t.mutation(
			internal.operationalTests.provision,
			input,
		);
		const owner = t.withIdentity({ subject: people[0].clerkUserId });
		await owner.mutation(api.delivery.setWhatsAppConsent, {
			organizationId,
			number: "+15551234567",
			consent: true,
		});
		await expect(
			owner.action(api.delivery.verifyPhone, { organizationId }),
		).rejects.toThrow("not allowlisted");
	});
	it("requires explicit enablement and a development issuer", async () => {
		const t = setup();
		vi.stubEnv("TIECAMEL_OPERATIONAL_TEST_ENABLED", "false");
		await expect(
			t.mutation(internal.operationalTests.provision, input),
		).rejects.toThrow("development identity");
		vi.stubEnv("TIECAMEL_OPERATIONAL_TEST_ENABLED", "true");
		vi.stubEnv("CLERK_FRONTEND_API_URL", "https://accounts.tiecamel.com");
		await expect(
			t.mutation(internal.operationalTests.provision, input),
		).rejects.toThrow("development identity");
	});
	it("creates an empty persistent workspace with fixed, distinct roles and no demo session", async () => {
		const t = setup();
		const result = await t.mutation(internal.operationalTests.provision, input);
		const owner = t.withIdentity({ subject: people[0].clerkUserId });
		const workspace = await owner.query(api.platform.workspace, {});
		expect(workspace.organization).toMatchObject({
			operationalTest: true,
			demoOnly: false,
			name: "[TEST] Pilot",
		});
		expect(workspace.repositories).toHaveLength(1);
		await expect(
			owner.mutation(api.platform.ensureSeeded, {}),
		).resolves.toEqual({ created: false });
		const counts = await t.run(async (ctx) => ({
			demos: (await ctx.db.query("demoSessions").collect()).length,
			obligations: (await ctx.db.query("obligations").collect()).length,
			files: (await ctx.db.query("changeFiles").collect()).length,
		}));
		expect(counts).toEqual({ demos: 0, obligations: 0, files: 0 });
		const report = await owner.query(api.readiness.status, {
			organizationId: result.organizationId,
		});
		expect(report.operationalTest).toBe(true);
		expect(report.liveCriticalClosureReady).toBe(false);
		expect(report.checks.find((check) => check.id === "people")?.state).toBe(
			"attention",
		);
		const community = await t.query(api.governance.community, {
			organizationSlug: input.slug,
		});
		expect(community?.operationalTest).toBe(true);
	});
	it("rejects reuse, duplicate identities, and accounts belonging to other workspaces", async () => {
		const t = setup();
		await expect(
			t.mutation(internal.operationalTests.provision, {
				...input,
				people: [people[0], people[0], people[2], people[3]],
			}),
		).rejects.toThrow("distinct");
		await t.mutation(internal.operationalTests.provision, input);
		await expect(
			t.mutation(internal.operationalTests.provision, input),
		).rejects.toThrow("already exists");
		await expect(
			t.mutation(internal.operationalTests.provision, {
				...input,
				slug: "test-other",
			}),
		).rejects.toThrow("dedicated test accounts");
	});
	it("enforces tenant boundaries, role boundaries, revocation, and the kill switch", async () => {
		const t = setup();
		const first = await t.mutation(internal.operationalTests.provision, input);
		const second = await t.mutation(internal.operationalTests.provision, {
			...input,
			slug: "test-other",
			people: people.map((person) => ({
				...person,
				clerkUserId: `${person.clerkUserId}other`,
			})),
		});
		const owner = t.withIdentity({ subject: people[0].clerkUserId });
		await expect(
			owner.query(api.readiness.status, {
				organizationId: second.organizationId,
			}),
		).rejects.toThrow("membership");
		await expect(
			t
				.withIdentity({ subject: people[4].clerkUserId })
				.query(api.readiness.status, { organizationId: first.organizationId }),
		).rejects.toThrow("Board access");
		vi.stubEnv("TIECAMEL_OPERATIONAL_TEST_ENABLED", "false");
		await expect(owner.query(api.platform.workspace, {})).rejects.toThrow(
			"testing is disabled",
		);
		expect(await owner.query(api.organizations.choices, {})).toEqual([]);
		vi.stubEnv("TIECAMEL_OPERATIONAL_TEST_ENABLED", "true");
		await t.run((ctx) =>
			ctx.db.patch(first.memberships[0].membershipId, { status: "revoked" }),
		);
		await expect(owner.query(api.platform.workspace, {})).rejects.toThrow(
			"membership",
		);
	});
});

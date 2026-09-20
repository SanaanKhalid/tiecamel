// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PilotReadiness } from "../components/pilot-readiness";
import { createResponsibility, type Person } from "../governance/model";
import { pilotReadiness, type ReadinessInput } from "../governance/readiness";

afterEach(cleanup);
const now = 1_800_000_000_000;
const roster: Person[] = ["finance", "secretary", "board"].map((role, i) => ({
	id: `member-${i}`,
	userId: `user-${i}`,
	name: `Person ${i}`,
	role: role as Person["role"],
	active: true,
}));
function fixture(): ReadinessInput {
	const state = createResponsibility(
		{
			title: "Tax notice",
			category: "tax",
			critical: true,
			source: "County",
			sourceExcerpt: "Original notice",
			ownerId: roster[0].id,
			backupId: roster[1].id,
			reviewerId: roster[2].id,
			dueAt: now + 86400000,
			timezone: "America/Chicago",
			nextCheckAt: now + 3600000,
			expectedEvidence: "Settlement receipt",
		},
		roster,
		now,
	);
	return {
		demo: false,
		roster,
		cases: [state],
		whatsappMemberIds: roster.map((person) => person.id),
		config: {
			email: true,
			whatsapp: true,
			inbound: true,
			deliveryEnabled: true,
		},
		inboxEnabled: true,
		scans: { responsibilities: now, delivery: now },
		now,
	};
}
describe("honest pilot readiness", () => {
	it("never certifies live closure or provider delivery from configuration alone", () => {
		const result = pilotReadiness(fixture());
		expect(result.liveCriticalClosureReady).toBe(false);
		expect(result.checks.find((check) => check.id === "email")?.state).toBe(
			"unverified",
		);
		expect(result.checks.find((check) => check.id === "signing")?.state).toBe(
			"attention",
		);
	});
	it("flags unconfirmed sources and missing inventory without claiming coverage", () => {
		const input = fixture();
		expect(
			pilotReadiness(input).checks.find((check) => check.id === "sources")
				?.state,
		).toBe("attention");
		input.cases = [];
		expect(
			pilotReadiness(input).checks.find((check) => check.id === "inventory")
				?.state,
		).toBe("attention");
		expect(
			pilotReadiness(input).categories.every(
				(category) => category.registered === 0,
			),
		).toBe(true);
	});
	it("counts distinct people and flags a director who cannot independently review", () => {
		const input = fixture();
		expect(
			pilotReadiness(input).checks.find((check) => check.id === "people")
				?.state,
		).toBe("observed");
		input.roster = roster.map((person) =>
			person.role === "board"
				? { ...person, userId: roster[0].userId }
				: person,
		);
		expect(
			pilotReadiness(input).checks.find((check) => check.id === "people")
				?.state,
		).toBe("attention");
	});
	it("does not call stale, missing or future-dated worker observations current", () => {
		const input = fixture();
		for (const at of [undefined, now - 16 * 60000, now + 1]) {
			input.scans.delivery = at;
			expect(
				pilotReadiness(input).checks.find((check) => check.id === "workers")
					?.state,
			).toBe("attention");
		}
	});
	it("keeps demos and incomplete WhatsApp consent explicitly unready", () => {
		const input = fixture();
		input.demo = true;
		expect(
			pilotReadiness(input).checks.find((check) => check.id === "email")?.state,
		).toBe("attention");
		input.demo = false;
		input.whatsappMemberIds = [];
		expect(
			pilotReadiness(input).checks.find((check) => check.id === "whatsapp")
				?.detail,
		).toContain("3 active staff contacts");
	});
	it("shows plain-language next steps without a misleading green go-live badge", () => {
		render(<PilotReadiness readiness={pilotReadiness(fixture())} />);
		expect(screen.getByText(/Pilot readiness · setup required/)).toBeTruthy();
		expect(
			screen.getByText(/Live critical closure remains disabled/),
		).toBeTruthy();
		expect(screen.getAllByText("Needs live test")).toHaveLength(3);
		expect(screen.getByText("tax: 1 registered")).toBeTruthy();
	});
});

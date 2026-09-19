import { describe, expect, it } from "vitest";
import {
	applyCommand,
	closureReadiness,
	communitySummary,
	createResponsibility,
	DAY,
	escalationFor,
	HOUR,
	monitoringHealth,
	type NewResponsibility,
	type Person,
	riskFor,
} from "../governance/model";

const now = Date.UTC(2026, 8, 19);
const roster: Person[] = [
	{ id: "owner", userId: "u1", name: "Owner", role: "finance", active: true },
	{
		id: "backup",
		userId: "u2",
		name: "Backup",
		role: "secretary",
		active: true,
	},
	{
		id: "reviewer",
		userId: "u3",
		name: "Reviewer",
		role: "reviewer",
		active: true,
	},
	{
		id: "director",
		userId: "u4",
		name: "Director",
		role: "board",
		active: true,
	},
	{
		id: "admin",
		userId: "u5",
		name: "Admin",
		role: "administrator",
		active: true,
	},
];
const input: NewResponsibility = {
	title: "Property tax liability",
	category: "tax",
	critical: true,
	source: "County notice",
	sourceExcerpt: "Payment due October 1",
	ownerId: "owner",
	backupId: "backup",
	reviewerId: "reviewer",
	dueAt: now + 12 * DAY,
	timezone: "America/Chicago",
	nextCheckAt: now + DAY,
	expectedEvidence:
		"County receipt or approved exemption covering this liability",
};
const create = () => createResponsibility(input, roster, now);
const confirmed = () =>
	applyCommand(create(), { type: "confirm" }, roster[0], roster, now + 1);
const evidenceCommand = {
	type: "evidence",
	digest: "a".repeat(64),
	reference: "secure-document:receipt",
	note: "Receipt covers the full liability",
	outcome: "liability-settled",
} as const;
const evidence = () =>
	applyCommand(confirmed(), evidenceCommand, roster[0], roster, now + 2);
describe("governance control invariants", () => {
	it("requires three different people, even when one user has duplicate memberships", () => {
		expect(() =>
			createResponsibility(
				input,
				roster.map((p) => (p.id === "backup" ? { ...p, userId: "u1" } : p)),
				now,
			),
		).toThrow("different people");
	});
	it("requires a real timezone and finite dates", () => {
		expect(() =>
			createResponsibility({ ...input, timezone: "unknown" }, roster, now),
		).toThrow("time zone");
		expect(() =>
			createResponsibility({ ...input, dueAt: Number.NaN }, roster, now),
		).toThrow("dates");
	});
	it("unconfirmed data is never healthy", () =>
		expect(riskFor(create(), now)).toBe("unconfirmed"));
	it("acknowledgement does not confirm, approve or close", () => {
		const state = applyCommand(
			create(),
			{ type: "acknowledge" },
			roster[0],
			roster,
			now,
		);
		expect(state.phase).toBe("intake");
		expect(state.approvals).toEqual([]);
		expect(escalationFor(state, now + 49 * HOUR)).toBe(3);
	});
	it("pending exemption never clears liability", () => {
		const state = applyCommand(
			confirmed(),
			{ type: "exemption", status: "pending" },
			roster[0],
			roster,
			now + 2,
		);
		expect(() =>
			applyCommand(
				state,
				{ ...evidenceCommand, outcome: "exemption-approved" },
				roster[0],
				roster,
				now + 3,
			),
		).toThrow("pending exemption");
		expect(riskFor(state, now + 13 * DAY)).toBe("overdue");
	});
	it("rejects generic tax closure evidence and malformed digest", () => {
		expect(() =>
			applyCommand(
				confirmed(),
				{ ...evidenceCommand, outcome: "obligation-completed" },
				roster[0],
				roster,
				now + 2,
			),
		).toThrow("Tax closure");
		expect(() =>
			applyCommand(
				confirmed(),
				{ ...evidenceCommand, digest: "bad" },
				roster[0],
				roster,
				now + 2,
			),
		).toThrow("SHA-256");
	});
	it("blocks owner and submitter self-approval without an admin exception", () => {
		expect(() =>
			applyCommand(evidence(), { type: "approve" }, roster[0], roster, now + 3),
		).toThrow("cannot approve");
		const adminEvidence = applyCommand(
			confirmed(),
			evidenceCommand,
			roster[4],
			roster,
			now + 2,
		);
		expect(() =>
			applyCommand(
				adminEvidence,
				{ type: "approve" },
				roster[4],
				roster,
				now + 3,
			),
		).toThrow("cannot approve");
		expect(() =>
			applyCommand(evidence(), { type: "resolve" }, roster[4], roster, now + 3),
		).toThrow("Independent review");
	});
	it("requires two distinct independent approvals including a director", () => {
		let state = applyCommand(
			evidence(),
			{ type: "approve" },
			roster[2],
			roster,
			now + 3,
		);
		expect(closureReadiness(state, roster).ready).toBe(false);
		expect(() =>
			applyCommand(state, { type: "approve" }, roster[2], roster, now + 4),
		).toThrow("already approved");
		state = applyCommand(
			state,
			{ type: "approve" },
			roster[1],
			roster,
			now + 4,
		);
		expect(closureReadiness(state, roster).ready).toBe(false);
		state = applyCommand(
			state,
			{ type: "approve" },
			roster[3],
			roster,
			now + 5,
		);
		expect(
			applyCommand(state, { type: "resolve" }, roster[0], roster, now + 6)
				.phase,
		).toBe("resolved");
	});
	it("invalidates all prior approvals when evidence changes", () => {
		let state = applyCommand(
			evidence(),
			{ type: "approve" },
			roster[2],
			roster,
			now + 3,
		);
		state = applyCommand(state, evidenceCommand, roster[0], roster, now + 4);
		expect(state.approvals).toEqual([]);
		expect(state.evidence?.revision).toBe(2);
	});
	it("revoked reviewers and changed identities do not count toward closure", () => {
		let state = applyCommand(
			evidence(),
			{ type: "approve" },
			roster[2],
			roster,
			now + 3,
		);
		state = applyCommand(
			state,
			{ type: "approve" },
			roster[3],
			roster,
			now + 4,
		);
		expect(
			closureReadiness(
				state,
				roster.map((p) => (p.id === "director" ? { ...p, active: false } : p)),
			).ready,
		).toBe(false);
	});
	it("handover invalidates approvals but preserves actual deadline and evidence", () => {
		const state = applyCommand(
			evidence(),
			{
				type: "reassign",
				ownerId: "backup",
				backupId: "owner",
				reviewerId: "reviewer",
				reason: "Officer transition",
			},
			roster[3],
			roster,
			now + 3,
		);
		expect(state.dueAt).toBe(input.dueAt);
		expect(state.evidence).toBeDefined();
		expect(state.approvals).toEqual([]);
	});
	it("escalates at 24h and 48h, and documented response never erases deadline", () => {
		expect(escalationFor(create(), now)).toBe(1);
		expect(escalationFor(create(), now + 24 * HOUR)).toBe(2);
		expect(escalationFor(create(), now + 48 * HOUR)).toBe(3);
		const state = applyCommand(
			confirmed(),
			{ type: "respond", note: "Consulting counsel" },
			roster[0],
			roster,
			now + 2,
		);
		expect(escalationFor(state, input.dueAt)).toBe(3);
	});
	it("fails closed on missing or stale monitoring", () => {
		expect(monitoringHealth(undefined, now)).toBe("unknown");
		expect(monitoringHealth(now - HOUR, now)).toBe("stale");
	});
	it("never leaks source, names, private evidence or unreviewed text to the public summary", () => {
		const result = JSON.stringify(communitySummary([evidence()], now));
		for (const secret of [
			input.title,
			input.source,
			input.sourceExcerpt,
			"secure-document",
			"Receipt covers",
		])
			expect(result).not.toContain(secret);
	});
	it("requires an independent director for detailed disclosure", () => {
		const state = applyCommand(
			confirmed(),
			{ type: "propose-disclosure", text: "Board response is in progress." },
			roster[3],
			roster,
			now + 2,
		);
		expect(() =>
			applyCommand(
				state,
				{ type: "approve-disclosure" },
				roster[3],
				roster,
				now + 3,
			),
		).toThrow("different director");
		expect(() =>
			applyCommand(
				state,
				{ type: "approve-disclosure" },
				roster[4],
				roster,
				now + 3,
			),
		).toThrow("different director");
	});
});

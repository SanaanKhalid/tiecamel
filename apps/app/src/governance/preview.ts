import type { Member } from "../platform/types";
import {
	applyCommand,
	createResponsibility,
	DAY,
	type Person,
	type Responsibility,
} from "./model";
export type CaseEntry = {
	id: string;
	state: Responsibility;
	linkedIssueId?: string;
};
export type PreviewState = {
	publications?: { text: string; approvedAt: number; revision: number }[];
	cases: CaseEntry[];
	now: number;
	events: {
		caseId: string;
		kind: string;
		by: string;
		at: number;
		revision: number;
	}[];
};
/** Only used by the labelled, browser-local demonstration. Live roles come from the server. */
export function previewRoster(members: Member[]): Person[] {
	return members.map((member) => ({
		id: member.id,
		userId: member.id,
		name: member.name,
		active: true,
		role:
			member.role === "verified-member"
				? "member"
				: member.id === "member-daniel" || member.id === "member-muhammad"
					? "board"
					: member.id === "member-samira"
						? "secretary"
						: member.role === "reviewer"
							? "reviewer"
							: "finance",
	}));
}
export function previewSeed(roster: Person[], now: number): PreviewState {
	const owner = roster.find((p) => p.role === "finance") ?? roster[0];
	const backup = roster.find((p) => p.role === "secretary") ?? roster[1];
	const reviewer = roster.find((p) => p.role === "reviewer") ?? roster[2];
	if (!owner || !backup || !reviewer) return { cases: [], now, events: [] };
	const tax = createResponsibility(
		{
			title: "Property tax notice needs a documented response",
			category: "tax",
			critical: true,
			source: "Sample county tax notice — demonstration only",
			sourceExcerpt:
				"Payment remains due while an exemption application is pending.",
			ownerId: owner.id,
			backupId: backup.id,
			reviewerId: reviewer.id,
			dueAt: now + 7 * DAY,
			nextCheckAt: now + DAY,
			timezone: "America/Chicago",
			expectedEvidence:
				"Paid-in-full receipt, or approved exemption explicitly covering this liability and period.",
		},
		roster,
		now,
	);
	const insurance = createResponsibility(
		{
			...tax,
			title: "Renew community center liability insurance",
			category: "insurance",
			critical: false,
			source: "Sample insurance renewal reminder",
			sourceExcerpt: "Confirm the renewal and retain the policy binder.",
			dueAt: now + 35 * DAY,
			nextCheckAt: now + 14 * DAY,
			expectedEvidence: "New policy binder and insurer confirmation.",
		},
		roster,
		now,
	);
	return {
		now,
		cases: [
			{ id: "demo-tax", state: tax },
			{
				id: "demo-insurance",
				state: applyCommand(insurance, { type: "confirm" }, owner, roster, now),
			},
		],
		events: [],
	};
}

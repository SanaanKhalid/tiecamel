import { isGovernanceStaff, type Person, type Responsibility } from "./model";

export type ReadinessCheck = {
	id: string;
	title: string;
	state: "observed" | "attention" | "unverified";
	detail: string;
	next: string;
};
export type ReadinessInput = {
	demo: boolean;
	operationalTest?: boolean;
	roster: Person[];
	cases: Responsibility[];
	whatsappMemberIds: string[];
	config: {
		email: boolean;
		whatsapp: boolean;
		inbound: boolean;
		deliveryEnabled: boolean;
	};
	inboxEnabled: boolean;
	scans: { responsibilities?: number; delivery?: number };
	now: number;
};

/** Operational observations, not a compliance certificate or provider health claim. */
export function pilotReadiness(input: ReadinessInput) {
	const staff = input.roster.filter(isGovernanceStaff);
	const people = new Set(staff.map((person) => person.userId));
	const critical = input.cases.filter(
		(state) => state.critical && state.phase !== "resolved",
	);
	const blockedCases = critical.filter((state) => {
		const owner = input.roster.find((person) => person.id === state.ownerId);
		const eligible = staff.filter(
			(person) =>
				person.userId !== owner?.userId &&
				person.userId !== state.evidence?.submittedByUser,
		);
		return (
			!owner ||
			!isGovernanceStaff(owner) ||
			new Set(eligible.map((person) => person.userId)).size < 2 ||
			!eligible.some((person) => person.role === "board")
		);
	}).length;
	const unconfirmed = input.cases.filter(
		(state) => state.phase !== "resolved" && !state.confirmedAt,
	).length;
	const missingContacts = staff.filter(
		(person) => !input.whatsappMemberIds.includes(person.id),
	).length;
	const stale = [input.scans.responsibilities, input.scans.delivery].some(
		(at) => at === undefined || at > input.now || input.now - at > 15 * 60_000,
	);
	const hasBoard =
		people.size >= 3 &&
		staff.some((person) => person.role === "board") &&
		blockedCases === 0;
	const checks: ReadinessCheck[] = [
		...(input.operationalTest
			? [
					{
						id: "test-identities",
						title: "Operational test identities",
						state: "attention" as const,
						detail:
							"Synthetic test users do not establish real board-member identity or independent human review. Outbound recipients are restricted by the server allowlist.",
						next: "Use synthetic documents and consenting test recipients only. Verify each external service end to end before claiming it is operational.",
					},
				]
			: []),
		{
			id: "inventory",
			title: "Responsibility inventory",
			state: input.cases.length ? "observed" : "attention",
			detail: `${input.cases.length} registered responsibilities. Unregistered obligations are outside monitoring.`,
			next: "Review property taxes, filings, insurance, grant restrictions and other deadlines with the board; assign an owner and backup to each.",
		},
		{
			id: "sources",
			title: "Human-confirmed notices",
			state: input.cases.length && !unconfirmed ? "observed" : "attention",
			detail: `${unconfirmed} open notices still need source and deadline confirmation.`,
			next: "Check the original authority's notice, exact due date and time zone. A pending exemption is not a resolved liability.",
		},
		{
			id: "people",
			title: "Independent review capacity",
			state: hasBoard && !input.operationalTest ? "observed" : "attention",
			detail: `${people.size} distinct active staff identities; ${blockedCases} critical cases lack two eligible reviewers including a director.`,
			next: "Confirm real people and roles. Owners and evidence submitters cannot review their own closure; separate submitters may require a fourth person.",
		},
		{
			id: "email",
			title: "Email alerts",
			state:
				input.config.email && input.config.deliveryEnabled && !input.demo
					? "unverified"
					: "attention",
			detail: input.demo
				? "Demo organizations never send real alerts."
				: input.config.email && input.config.deliveryEnabled
					? "Server configuration is present; end-to-end delivery has not been certified."
					: "Outbound email is disabled or missing required configuration.",
			next: "Configure the verified sender and signed callbacks, then send a controlled pilot alert and inspect its delivered receipt.",
		},
		{
			id: "whatsapp",
			title: "WhatsApp alerts and consent",
			state:
				input.config.whatsapp &&
				input.config.deliveryEnabled &&
				!missingContacts &&
				staff.length > 0 &&
				!input.demo
					? "unverified"
					: "attention",
			detail: `${missingContacts} active staff contacts are missing verified WhatsApp opt-in. ${input.config.whatsapp ? "Server configuration is present." : "Provider configuration is incomplete."}`,
			next: "Use an approved template, verify each person's own number and consent, then test a real receipt. No SMS fallback is assumed.",
		},
		{
			id: "inbox",
			title: "Forwarded-notice intake",
			state:
				input.config.inbound && input.inboxEnabled && !input.demo
					? "unverified"
					: "attention",
			detail: input.inboxEnabled
				? "An inbox route exists; receiving a real notice still needs a live test."
				: "This organization has no active forwarding route.",
			next: "Enable the dedicated inbox, forward a controlled notice and assign it. Upload original attachments through the managed document workflow.",
		},
		{
			id: "workers",
			title: "Monitoring freshness",
			state: stale ? "attention" : "observed",
			detail: stale
				? "At least one worker heartbeat is missing or older than 15 minutes."
				: "Both worker heartbeats were observed within 15 minutes. This does not prove message delivery.",
			next: "Configure an independent uptime monitor for /health/governance and assign an outage responder outside TieCamel.",
		},
		{
			id: "signing",
			title: "Secure independent approvals",
			state: "attention",
			detail:
				"Live critical closure is disabled. Local Solana tests do not provision individual signing accounts or a public deployment.",
			next: "Complete passkey ownership, board adoption, reviewed devnet deployment and two-person end-to-end verification before enabling critical closure.",
		},
	];
	return {
		demo: input.demo,
		operationalTest: input.operationalTest === true,
		liveCriticalClosureReady: false as const,
		checks,
		categories: (["tax", "filing", "insurance", "grant", "other"] as const).map(
			(category) => ({
				category,
				registered: input.cases.filter((state) => state.category === category)
					.length,
			}),
		),
	};
}

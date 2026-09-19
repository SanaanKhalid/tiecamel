/** Shared deterministic policy engine. The server supplies identity, roster and time. */
export const DAY = 86_400_000;
export const HOUR = 3_600_000;
export type GovernanceRole =
	| "administrator"
	| "board"
	| "secretary"
	| "finance"
	| "owner"
	| "reviewer"
	| "member";
export type Person = {
	id: string;
	userId: string;
	name: string;
	role: GovernanceRole;
	active: boolean;
};
export type Evidence = {
	digest: string;
	reference: string;
	note: string;
	submittedBy: string;
	submittedByUser: string;
	revision: number;
	at: number;
	outcome: "liability-settled" | "exemption-approved" | "obligation-completed";
};
export type Approval = {
	by: string;
	userId: string;
	evidenceRevision: number;
	at: number;
};
export type Responsibility = {
	title: string;
	category: "tax" | "filing" | "insurance" | "grant" | "other";
	critical: boolean;
	source: string;
	sourceExcerpt: string;
	ownerId: string;
	backupId: string;
	reviewerId: string;
	dueAt: number;
	timezone: string;
	nextCheckAt: number;
	expectedEvidence: string;
	createdAt: number;
	updatedAt: number;
	revision: number;
	policyVersion: number;
	phase: "intake" | "open" | "review" | "resolved";
	exemption: "not-applicable" | "pending" | "approved";
	acknowledgedBy: string[];
	confirmedAt?: number;
	response?: { by: string; note: string; at: number };
	evidence?: Evidence;
	approvals: Approval[];
	disclosure?: {
		text: string;
		proposedBy: string;
		approvedBy?: string;
		at: number;
	};
	resolvedAt?: number;
};
export type NewResponsibility = Pick<
	Responsibility,
	| "title"
	| "category"
	| "critical"
	| "source"
	| "sourceExcerpt"
	| "ownerId"
	| "backupId"
	| "reviewerId"
	| "dueAt"
	| "timezone"
	| "nextCheckAt"
	| "expectedEvidence"
>;
export type Command =
	| { type: "confirm" }
	| { type: "acknowledge" }
	| { type: "respond"; note: string }
	| { type: "exemption"; status: Responsibility["exemption"] }
	| {
			type: "evidence";
			digest: string;
			reference: string;
			note: string;
			outcome: Evidence["outcome"];
	  }
	| { type: "approve" }
	| { type: "resolve" }
	| {
			type: "reassign";
			ownerId: string;
			backupId: string;
			reviewerId: string;
			reason: string;
	  }
	| { type: "propose-disclosure"; text: string }
	| { type: "approve-disclosure" };

export function isDirector(person: Person) {
	return person.role === "board";
}
export function isGovernanceStaff(person: Person) {
	return person.active && person.role !== "member";
}
function requireText(value: string, label: string, max = 4000) {
	if (!value.trim() || value.length > max)
		throw new Error(`${label} is required (maximum ${max} characters)`);
}
function person(roster: Person[], id: string) {
	const member = roster.find((entry) => entry.id === id && entry.active);
	if (!member || !isGovernanceStaff(member))
		throw new Error("An active organization officer or reviewer is required");
	return member;
}
export function validateAssignments(
	input: Pick<Responsibility, "ownerId" | "backupId" | "reviewerId">,
	roster: Person[],
) {
	const people = [input.ownerId, input.backupId, input.reviewerId].map((id) =>
		person(roster, id),
	);
	if (new Set(people.map((entry) => entry.userId)).size !== 3)
		throw new Error(
			"Owner, backup and oversight reviewer must be three different people",
		);
}
export function createResponsibility(
	input: NewResponsibility,
	roster: Person[],
	now: number,
): Responsibility {
	requireText(input.title, "Title", 180);
	requireText(input.source, "Notice source", 1000);
	requireText(input.sourceExcerpt, "Source excerpt");
	requireText(input.expectedEvidence, "Expected evidence", 1000);
	validateAssignments(input, roster);
	if (![input.dueAt, input.nextCheckAt, now].every(Number.isFinite))
		throw new Error("Valid dates are required");
	if (input.nextCheckAt > input.dueAt)
		throw new Error("Next check must not be after the actual deadline");
	try {
		new Intl.DateTimeFormat("en", { timeZone: input.timezone });
	} catch {
		throw new Error("A valid IANA time zone is required");
	}
	return {
		...input,
		title: input.title.trim(),
		revision: 1,
		policyVersion: 1,
		createdAt: now,
		updatedAt: now,
		phase: "intake",
		exemption: "not-applicable",
		acknowledgedBy: [],
		approvals: [],
	};
}
export function validApprovals(
	state: Responsibility,
	roster: Person[],
): Approval[] {
	const evidence = state.evidence;
	if (!evidence) return [];
	const owner = roster.find((entry) => entry.id === state.ownerId);
	const seen = new Set<string>();
	return state.approvals.filter((approval) => {
		const reviewer = roster.find(
			(entry) => entry.id === approval.by && entry.active,
		);
		if (
			!reviewer ||
			!isGovernanceStaff(reviewer) ||
			reviewer.userId !== approval.userId ||
			seen.has(reviewer.userId) ||
			reviewer.userId === owner?.userId ||
			reviewer.userId === evidence.submittedByUser ||
			approval.evidenceRevision !== evidence.revision
		)
			return false;
		seen.add(reviewer.userId);
		return true;
	});
}
export function closureReadiness(state: Responsibility, roster: Person[]) {
	const approvals = validApprovals(state, roster);
	const hasDirector = approvals.some((approval) =>
		roster.some((entry) => entry.id === approval.by && isDirector(entry)),
	);
	const required = state.critical ? 2 : 1;
	return {
		count: approvals.length,
		required,
		hasDirector,
		ready:
			state.phase === "review" &&
			!!state.confirmedAt &&
			!!state.evidence &&
			approvals.length >= required &&
			(!state.critical || hasDirector),
	};
}
export function applyCommand(
	state: Responsibility,
	command: Command,
	actor: Person,
	roster: Person[],
	now: number,
): Responsibility {
	const trustedActor = person(roster, actor.id);
	if (trustedActor.userId !== actor.userId)
		throw new Error("Identity does not match the active roster");
	if (now < state.updatedAt) throw new Error("Time cannot move backwards");
	if (
		state.phase === "resolved" &&
		command.type !== "propose-disclosure" &&
		command.type !== "approve-disclosure"
	)
		throw new Error(
			"Resolved records are immutable; register a new responsibility for a new obligation",
		);
	const next: Responsibility = structuredClone(state);
	const isOwner = trustedActor.id === state.ownerId;
	const isLead = isOwner || trustedActor.id === state.backupId;
	switch (command.type) {
		case "confirm":
			if (state.phase !== "intake")
				throw new Error("This notice has already been confirmed");
			next.confirmedAt = now;
			next.phase = "open";
			break;
		case "acknowledge":
			if (!next.acknowledgedBy.includes(actor.id))
				next.acknowledgedBy.push(actor.id);
			break;
		case "respond":
			requireText(command.note, "Documented response");
			if (!isLead && actor.id !== state.reviewerId && !isDirector(trustedActor))
				throw new Error(
					"Only a responsible officer or director can record the response",
				);
			next.response = { by: actor.id, note: command.note.trim(), at: now };
			break;
		case "exemption":
			if (state.category !== "tax")
				throw new Error(
					"Exemption status is only applicable to tax responsibilities",
				);
			next.exemption = command.status;
			break;
		case "evidence":
			if (state.phase === "intake")
				throw new Error(
					"Confirm the source and deadline before submitting closure evidence",
				);
			requireText(command.note, "Evidence explanation");
			requireText(command.reference, "Evidence reference", 1000);
			if (!/^[a-f0-9]{64}$/.test(command.digest))
				throw new Error("Evidence must have an exact SHA-256 digest");
			if (
				state.category === "tax" &&
				command.outcome === "obligation-completed"
			)
				throw new Error(
					"Tax closure must document settled liability or an approved exemption covering this liability",
				);
			if (
				command.outcome === "exemption-approved" &&
				state.exemption !== "approved"
			)
				throw new Error(
					"A pending exemption is not proof that the liability is resolved",
				);
			next.evidence = {
				digest: command.digest,
				reference: command.reference,
				note: command.note.trim(),
				submittedBy: actor.id,
				submittedByUser: actor.userId,
				revision: (state.evidence?.revision ?? 0) + 1,
				at: now,
				outcome: command.outcome,
			};
			next.approvals = [];
			next.phase = "review";
			break;
		case "approve": {
			if (state.phase !== "review" || !state.evidence)
				throw new Error("Current closure evidence is required");
			const owner = roster.find((entry) => entry.id === state.ownerId);
			if (
				actor.userId === owner?.userId ||
				actor.userId === state.evidence.submittedByUser
			)
				throw new Error(
					"The owner and evidence submitter cannot approve their own closure",
				);
			if (
				validApprovals(state, roster).some(
					(entry) => entry.userId === actor.userId,
				)
			)
				throw new Error("You have already approved this evidence revision");
			next.approvals = [
				...validApprovals(state, roster),
				{
					by: actor.id,
					userId: actor.userId,
					evidenceRevision: state.evidence.revision,
					at: now,
				},
			];
			break;
		}
		case "resolve":
			if (!closureReadiness(state, roster).ready)
				throw new Error(
					"Independent review is incomplete; critical closure needs two people including a director",
				);
			next.phase = "resolved";
			next.resolvedAt = now;
			break;
		case "reassign":
			if (!isDirector(trustedActor) && trustedActor.role !== "secretary")
				throw new Error(
					"A director or secretary must record responsibility handover",
				);
			requireText(command.reason, "Handover reason");
			validateAssignments(command, roster);
			next.ownerId = command.ownerId;
			next.backupId = command.backupId;
			next.reviewerId = command.reviewerId;
			next.approvals = [];
			next.acknowledgedBy = [];
			break;
		case "propose-disclosure":
			requireText(command.text, "Redacted community update", 2000);
			next.disclosure = {
				text: command.text.trim(),
				proposedBy: actor.id,
				at: now,
			};
			break;
		case "approve-disclosure": {
			const proposal = state.disclosure;
			if (!proposal || proposal.approvedBy)
				throw new Error("An unapproved disclosure is required");
			const author = roster.find((entry) => entry.id === proposal.proposedBy);
			if (!isDirector(trustedActor) || actor.userId === author?.userId)
				throw new Error(
					"A different director must approve the redacted community update",
				);
			next.disclosure = { ...proposal, approvedBy: actor.id };
			break;
		}
	}
	next.updatedAt = now;
	next.revision += 1;
	return next;
}
export function riskFor(state: Responsibility, now: number) {
	if (state.phase === "resolved") return "resolved";
	if (now >= state.dueAt) return "overdue";
	if (state.phase === "intake") return "unconfirmed";
	if (state.critical || now >= state.nextCheckAt) return "at-risk";
	if (state.dueAt - now <= 30 * DAY) return "due-soon";
	return "scheduled";
}
export function escalationFor(state: Responsibility, now: number) {
	if (state.phase === "resolved") return 0;
	if (
		now >= state.dueAt ||
		(state.critical && !state.response && now - state.createdAt >= 48 * HOUR)
	)
		return 3;
	if (
		state.critical &&
		!state.acknowledgedBy.includes(state.ownerId) &&
		now - state.createdAt >= 24 * HOUR
	)
		return 2;
	return state.critical ? 1 : 0;
}
export function monitoringHealth(lastSweepAt: number | undefined, now: number) {
	return lastSweepAt === undefined
		? "unknown"
		: now - lastSweepAt > 15 * 60_000
			? "stale"
			: "current";
}
/** Intentionally allowlisted output: no titles, sources, names, dates or evidence. */
export function communitySummary(
	states: Responsibility[],
	now: number,
	lastSweepAt?: number,
) {
	return {
		scope:
			"Registered responsibilities only; not a certification of compliance.",
		registered: states.length,
		unresolved: states.filter((state) => state.phase !== "resolved").length,
		overdue: states.filter(
			(state) => state.phase !== "resolved" && state.dueAt <= now,
		).length,
		awaitingConfirmation: states.filter((state) => state.phase === "intake")
			.length,
		restrictedUpdates: states.filter(
			(state) => state.phase !== "resolved" && !state.disclosure?.approvedBy,
		).length,
		escalated: states.filter((state) => escalationFor(state, now) >= 3).length,
		monitoring: monitoringHealth(lastSweepAt, now),
		lastSweepAt: lastSweepAt ?? null,
	};
}

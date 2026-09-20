import { v } from "convex/values";
import {
	applyCommand,
	communitySummary,
	createResponsibility,
	DAY,
	escalationFor,
	isGovernanceStaff,
	type Person,
	type Responsibility,
	riskFor,
} from "../src/governance/model";
import { previewSeed } from "../src/governance/preview";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
	internalMutation,
	type MutationCtx,
	mutation,
	type QueryCtx,
	query,
} from "./_generated/server";
import { canonicalJson, sha256Hex } from "./lib/canonical";
import {
	governanceCommand,
	responsibilityInput,
} from "./lib/governanceValidators";
import {
	requirePlatformSession,
	requireRepositoryAccess,
} from "./lib/platformAuth";

const scope = {
	organizationId: v.id("organizations"),
	demoSessionToken: v.optional(v.string()),
};
export async function governanceRoster(
	ctx: QueryCtx | MutationCtx,
	organizationId: Id<"organizations">,
): Promise<Person[]> {
	const memberships = await ctx.db
		.query("memberships")
		.withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
		.collect();
	return Promise.all(
		memberships.map(async (member) => ({
			id: String(member._id),
			userId: String(member.userId),
			name: (await ctx.db.get(member.userId))?.name ?? "Former member",
			role: member.role,
			active: member.status === "active",
		})),
	);
}
async function staffSession(
	ctx: QueryCtx | MutationCtx,
	args: { organizationId: Id<"organizations">; demoSessionToken?: string },
) {
	const session = await requirePlatformSession(
		ctx,
		args.demoSessionToken,
		args.organizationId,
	);
	if (session.membership.role === "member")
		throw new Error("Board workspace access is required");
	return session;
}
async function appendEvent(
	ctx: MutationCtx,
	obligation: Doc<"obligations">,
	actorId: Id<"memberships">,
	kind: string,
	payload: unknown,
) {
	const state = obligation.control;
	if (!state) throw new Error("Responsibility controls are missing");
	const prior = await ctx.db
		.query("governanceEvents")
		.withIndex("by_obligation", (q) => q.eq("obligationId", obligation._id))
		.order("desc")
		.first();
	const stateSha256 = await sha256Hex(canonicalJson(state));
	const event = {
		organizationId: obligation.organizationId,
		obligationId: obligation._id,
		actorMembershipId: actorId,
		revision: state.revision,
		kind,
		payload: canonicalJson(payload),
		stateSha256,
		priorEventSha256: prior?.eventSha256 ?? "0".repeat(64),
		createdAt: state.updatedAt,
	};
	await ctx.db.insert("governanceEvents", {
		...event,
		eventSha256: await sha256Hex(canonicalJson(event)),
	});
}
function legacyFields(state: Responsibility, now: number) {
	const risk = riskFor(state, now);
	return {
		title: state.title,
		category: state.category,
		ownerMembershipId: state.ownerId as Id<"memberships">,
		backupMembershipId: state.backupId as Id<"memberships">,
		reviewerMembershipId: state.reviewerId as Id<"memberships">,
		dueDate: state.dueAt,
		status:
			risk === "overdue"
				? ("breached" as const)
				: risk === "resolved"
					? ("resolved" as const)
					: risk === "due-soon"
						? ("due-soon" as const)
						: ("at-risk" as const),
		workStatus:
			state.phase === "resolved"
				? ("complete" as const)
				: state.phase === "review"
					? ("in-review" as const)
					: state.response
						? ("in-progress" as const)
						: ("open" as const),
		evidenceStatus:
			state.phase === "resolved"
				? ("verified" as const)
				: state.evidence
					? ("submitted" as const)
					: ("missing" as const),
		escalationLevel: escalationFor(state, now),
		updatedAt: state.updatedAt,
	};
}
export const workspace = query({
	args: scope,
	handler: async (ctx, args) => {
		const session = await staffSession(ctx, args);
		const [obligations, roster, alerts, monitor] = await Promise.all([
			ctx.db
				.query("obligations")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", args.organizationId),
				)
				.collect(),
			governanceRoster(ctx, args.organizationId),
			ctx.db
				.query("governanceAlerts")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", args.organizationId),
				)
				.order("desc")
				.take(200),
			ctx.db
				.query("governanceMonitor")
				.withIndex("by_name", (q) => q.eq("name", "responsibilities"))
				.unique(),
		]);
		const cases = obligations.flatMap((obligation) =>
			obligation.control
				? [
						{
							id: obligation._id,
							state: obligation.control,
							linkedIssueId: obligation.linkedIssueId,
						},
					]
				: [],
		);
		const publications = await ctx.db
			.query("governancePublications")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.order("desc")
			.take(100);
		return {
			cases,
			publications: publications.map((entry) => ({
				text: entry.text,
				approvedAt: entry.approvedAt,
				revision: entry.revision,
			})),
			roster,
			viewerId: String(session.membership._id),
			alerts,
			summary: communitySummary(
				cases.map((entry) => entry.state),
				Date.now(),
				monitor?.lastSweepAt,
			),
			serverTime: Date.now(),
			demo: "demoSessionId" in session,
		};
	},
});
export const register = mutation({
	args: {
		...scope,
		input: v.object(responsibilityInput),
		linkedIssueId: v.optional(v.id("platformIssues")),
		inboundNoticeId: v.optional(v.id("inboundNotices")),
	},
	handler: async (ctx, args) => {
		const session = await staffSession(ctx, args);
		if (args.inboundNoticeId) {
			const notice = await ctx.db.get(args.inboundNoticeId);
			if (
				!notice ||
				notice.organizationId !== args.organizationId ||
				notice.status !== "unconfirmed"
			)
				throw new Error("Incoming notice is unavailable or already linked");
		}
		if (args.linkedIssueId) {
			const issue = await ctx.db.get(args.linkedIssueId);
			if (
				!issue ||
				issue.organizationId !== args.organizationId ||
				issue.obligationId
			)
				throw new Error("Issue is unavailable or already controlled");
			await requireRepositoryAccess(
				ctx,
				issue.repositoryId,
				"contribute",
				args.demoSessionToken,
			);
		}
		const now = Date.now();
		const state = createResponsibility(
			args.input,
			await governanceRoster(ctx, args.organizationId),
			now,
		);
		const id = await ctx.db.insert("obligations", {
			organizationId: args.organizationId,
			...legacyFields(state, now),
			visibility: "board",
			createdAt: now,
			control: state,
			governanceActive: true,
			linkedIssueId: args.linkedIssueId,
		});
		if (args.linkedIssueId)
			await ctx.db.patch(args.linkedIssueId, {
				obligationId: id,
				status: "todo",
				state: "open",
				updatedAt: now,
			});
		if (args.inboundNoticeId)
			await ctx.db.patch(args.inboundNoticeId, {
				status: "linked",
				obligationId: id,
			});
		const obligation = await ctx.db.get(id);
		if (!obligation) throw new Error("Responsibility was not stored");
		await appendEvent(
			ctx,
			obligation,
			session.membership._id,
			"register",
			args.input,
		);
		await queueAlerts(ctx, obligation, now);
		return id;
	},
});
export const act = mutation({
	args: {
		...scope,
		obligationId: v.id("obligations"),
		expectedRevision: v.number(),
		command: governanceCommand,
	},
	handler: async (ctx, args) => {
		const session = await staffSession(ctx, args);
		const obligation = await ctx.db.get(args.obligationId);
		if (
			!obligation?.control ||
			obligation.organizationId !== args.organizationId
		)
			throw new Error("Responsibility not found");
		if (obligation.control.revision !== args.expectedRevision)
			throw new Error(
				"This responsibility changed. Refresh and review the current version before continuing.",
			);
		const roster = await governanceRoster(ctx, args.organizationId);
		const actor = roster.find(
			(entry) => entry.id === String(session.membership._id),
		);
		if (!actor || !isGovernanceStaff(actor))
			throw new Error("Active officer required");
		if (
			args.command.type === "evidence" &&
			!(
				"demoSessionId" in session &&
				args.command.reference.startsWith("demo://")
			)
		) {
			const command = args.command;
			const files = await ctx.db
				.query("changeFiles")
				.withIndex("by_sha256", (q) => q.eq("sha256", command.digest))
				.collect();
			const file = files.find(
				(entry) =>
					entry.organizationId === args.organizationId &&
					entry.azureBlobRef === command.reference &&
					entry.processingStatus === "ready",
			);
			if (!file)
				throw new Error(
					"Select a processed managed document with a matching fingerprint. Unprocessed or external references cannot be closure evidence.",
				);
			await requireRepositoryAccess(
				ctx,
				file.repositoryId,
				"read",
				args.demoSessionToken,
			);
		}
		// Do not silently substitute account login for the approved individual-signing design.
		if (
			(args.command.type === "approve" || args.command.type === "resolve") &&
			obligation.control.critical &&
			!("demoSessionId" in session)
		) {
			throw new Error(
				"Critical secure approvals are not provisioned yet. Evidence and escalation remain available; closure is blocked.",
			);
		}
		const now = Date.now();
		const state = applyCommand(
			obligation.control,
			args.command,
			actor,
			roster,
			now,
		);
		await ctx.db.patch(obligation._id, {
			control: state,
			...legacyFields(state, now),
			governanceActive: state.phase !== "resolved",
		});
		await appendEvent(
			ctx,
			{ ...obligation, control: state },
			session.membership._id,
			args.command.type,
			args.command,
		);
		if (args.command.type === "evidence" && state.evidence) {
			await ctx.db.insert("evidenceSubmissions", {
				organizationId: args.organizationId,
				obligationId: obligation._id,
				submittedBy: session.membership._id,
				note: state.evidence.note,
				sha256: state.evidence.digest,
				status: "submitted",
				createdAt: now,
			});
		}
		if (args.command.type === "approve-disclosure" && state.disclosure) {
			await ctx.db.insert("governancePublications", {
				organizationId: args.organizationId,
				obligationId: obligation._id,
				text: state.disclosure.text,
				approvedAt: now,
				revision: state.revision,
			});
		}
		if (state.phase === "resolved" && obligation.linkedIssueId)
			await ctx.db.patch(obligation.linkedIssueId, {
				status: "done",
				state: "closed",
				updatedAt: now,
			});
		await queueAlerts(ctx, { ...obligation, control: state }, now);
		return state.revision;
	},
});
export const seedDemo = mutation({
	args: scope,
	handler: async (ctx, args) => {
		const session = await staffSession(ctx, args);
		if (!("demoSessionId" in session))
			throw new Error(
				"Sample records are available only in isolated demo organizations",
			);
		const existing = await ctx.db
			.query("obligations")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", args.organizationId),
			)
			.first();
		if (existing) return;
		const roster = await governanceRoster(ctx, args.organizationId);
		const sample = previewSeed(roster, Date.now());
		for (const entry of sample.cases) {
			const state = entry.state;
			const id = await ctx.db.insert("obligations", {
				organizationId: args.organizationId,
				...legacyFields(state, state.updatedAt),
				control: state,
				governanceActive: true,
				visibility: "board",
				createdAt: state.createdAt,
			});
			const obligation = await ctx.db.get(id);
			if (obligation) {
				await appendEvent(
					ctx,
					obligation,
					session.membership._id,
					"demo-register",
					state,
				);
				await queueAlerts(ctx, obligation, state.updatedAt);
			}
		}
	},
});
export const history = query({
	args: { ...scope, obligationId: v.id("obligations") },
	handler: async (ctx, args) => {
		await staffSession(ctx, args);
		const obligation = await ctx.db.get(args.obligationId);
		if (!obligation || obligation.organizationId !== args.organizationId)
			throw new Error("Responsibility not found");
		return ctx.db
			.query("governanceEvents")
			.withIndex("by_obligation", (q) =>
				q.eq("obligationId", args.obligationId),
			)
			.collect();
	},
});
export const community = query({
	args: { organizationSlug: v.string() },
	handler: async (ctx, args) => {
		const organization = await ctx.db
			.query("organizations")
			.withIndex("by_public_slug", (q) =>
				q.eq("publicSlug", args.organizationSlug),
			)
			.unique();
		if (!organization || organization.status === "suspended") return null;
		const [obligations, publications, monitor] = await Promise.all([
			ctx.db
				.query("obligations")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organization._id),
				)
				.collect(),
			ctx.db
				.query("governancePublications")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organization._id),
				)
				.order("desc")
				.take(100),
			ctx.db
				.query("governanceMonitor")
				.withIndex("by_name", (q) => q.eq("name", "responsibilities"))
				.unique(),
		]);
		return {
			organization: organization.name,
			demo: organization.demoOnly === true,
			summary: communitySummary(
				obligations.flatMap((entry) => (entry.control ? [entry.control] : [])),
				Date.now(),
				monitor?.lastSweepAt,
			),
			publications: publications.map((entry) => ({
				text: entry.text,
				approvedAt: entry.approvedAt,
				revision: entry.revision,
			})),
		};
	},
});

async function queueAlerts(
	ctx: MutationCtx,
	obligation: Doc<"obligations">,
	now: number,
) {
	const state = obligation.control;
	if (!state || state.phase === "resolved") return;
	const level = escalationFor(state, now);
	const stages: string[] = level > 0 ? [`escalation-${level}`] : [];
	for (const days of [30, 14, 7, 1])
		if (state.dueAt - now <= days * DAY && state.dueAt > now)
			stages.push(`due-${days}`);
	// Catch-up uses the most urgent reminder, not a burst of every missed reminder.
	const stage =
		level >= 2
			? `escalation-${level}-day-${Math.floor((now - state.createdAt) / DAY)}`
			: (stages.at(-1) ??
				(now >= state.nextCheckAt
					? `follow-up-day-${Math.floor((now - state.nextCheckAt) / DAY)}`
					: undefined));
	if (!stage) return;
	const roster = await governanceRoster(ctx, obligation.organizationId);
	const ids = new Set([
		state.ownerId,
		state.backupId,
		...(level >= 3 ? [state.reviewerId] : []),
		...roster
			.filter(
				(entry) => entry.active && entry.role === "board" && state.critical,
			)
			.map((entry) => entry.id),
	]);
	for (const membershipId of ids) {
		if (!roster.some((entry) => entry.id === membershipId && entry.active))
			continue;
		const dedupeKey = `${obligation._id}:${state.ownerId}:${state.backupId}:${membershipId}:${stage}`;
		if (
			await ctx.db
				.query("governanceAlerts")
				.withIndex("by_dedupe", (q) => q.eq("dedupeKey", dedupeKey))
				.unique()
		)
			continue;
		const alertId = await ctx.db.insert("governanceAlerts", {
			organizationId: obligation.organizationId,
			obligationId: obligation._id,
			membershipId: membershipId as Id<"memberships">,
			dedupeKey,
			stage,
			createdAt: now,
		});
		const organization = await ctx.db.get(obligation.organizationId);
		for (const channel of ["email", "whatsapp"] as const)
			await ctx.db.insert("notificationOutbox", {
				organizationId: obligation.organizationId,
				alertId,
				membershipId: membershipId as Id<"memberships">,
				channel,
				status: organization?.demoOnly ? "suppressed" : "queued",
				attempts: 0,
				nextAttemptAt: now,
				createdAt: now,
				updatedAt: now,
			});
	}
}
export const sweep = internalMutation({
	args: { cursor: v.optional(v.string()), startedAt: v.optional(v.number()) },
	handler: async (ctx, args) => {
		const startedAt = args.startedAt ?? Date.now();
		const page = await ctx.db
			.query("obligations")
			.paginate({ cursor: args.cursor ?? null, numItems: 50 });
		for (const obligation of page.page) {
			if (!obligation.control || !obligation.governanceActive) continue;
			await queueAlerts(ctx, obligation, Date.now());
			await ctx.db.patch(
				obligation._id,
				legacyFields(obligation.control, Date.now()),
			);
		}
		if (!page.isDone) {
			await ctx.scheduler.runAfter(0, internal.governance.sweep, {
				cursor: page.continueCursor,
				startedAt,
			});
		} else {
			const monitor = await ctx.db
				.query("governanceMonitor")
				.withIndex("by_name", (q) => q.eq("name", "responsibilities"))
				.unique();
			// The oldest completed scan time is used; long-running scans never look fresh.
			if (!monitor)
				await ctx.db.insert("governanceMonitor", {
					name: "responsibilities",
					lastSweepAt: startedAt,
				});
			else if (monitor.lastSweepAt < startedAt)
				await ctx.db.patch(monitor._id, { lastSweepAt: startedAt });
		}
	},
});

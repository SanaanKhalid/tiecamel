import { v } from "convex/values";
export const category = v.union(
	v.literal("tax"),
	v.literal("filing"),
	v.literal("insurance"),
	v.literal("grant"),
	v.literal("other"),
);
export const exemption = v.union(
	v.literal("not-applicable"),
	v.literal("pending"),
	v.literal("approved"),
);
export const outcome = v.union(
	v.literal("liability-settled"),
	v.literal("exemption-approved"),
	v.literal("obligation-completed"),
);
export const responsibilityInput = {
	title: v.string(),
	category,
	critical: v.boolean(),
	source: v.string(),
	sourceExcerpt: v.string(),
	ownerId: v.string(),
	backupId: v.string(),
	reviewerId: v.string(),
	dueAt: v.number(),
	timezone: v.string(),
	nextCheckAt: v.number(),
	expectedEvidence: v.string(),
};
export const responsibility = v.object({
	...responsibilityInput,
	createdAt: v.number(),
	updatedAt: v.number(),
	revision: v.number(),
	policyVersion: v.number(),
	phase: v.union(
		v.literal("intake"),
		v.literal("open"),
		v.literal("review"),
		v.literal("resolved"),
	),
	exemption,
	acknowledgedBy: v.array(v.string()),
	confirmedAt: v.optional(v.number()),
	response: v.optional(
		v.object({ by: v.string(), note: v.string(), at: v.number() }),
	),
	evidence: v.optional(
		v.object({
			digest: v.string(),
			reference: v.string(),
			note: v.string(),
			submittedBy: v.string(),
			submittedByUser: v.string(),
			revision: v.number(),
			at: v.number(),
			outcome,
		}),
	),
	approvals: v.array(
		v.object({
			by: v.string(),
			userId: v.string(),
			evidenceRevision: v.number(),
			at: v.number(),
		}),
	),
	disclosure: v.optional(
		v.object({
			text: v.string(),
			proposedBy: v.string(),
			approvedBy: v.optional(v.string()),
			at: v.number(),
		}),
	),
	resolvedAt: v.optional(v.number()),
});
export const governanceCommand = v.union(
	v.object({ type: v.literal("confirm") }),
	v.object({ type: v.literal("acknowledge") }),
	v.object({ type: v.literal("respond"), note: v.string() }),
	v.object({ type: v.literal("exemption"), status: exemption }),
	v.object({
		type: v.literal("evidence"),
		digest: v.string(),
		reference: v.string(),
		note: v.string(),
		outcome,
	}),
	v.object({ type: v.literal("approve") }),
	v.object({ type: v.literal("resolve") }),
	v.object({
		type: v.literal("reassign"),
		ownerId: v.string(),
		backupId: v.string(),
		reviewerId: v.string(),
		reason: v.string(),
	}),
	v.object({ type: v.literal("propose-disclosure"), text: v.string() }),
	v.object({ type: v.literal("approve-disclosure") }),
);

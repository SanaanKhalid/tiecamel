import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { requireRepositoryAccess } from "./lib/platformAuth";

export { request as merge } from "./publications";

const reviewDecision = v.union(
	v.literal("comment"),
	v.literal("approve"),
	v.literal("request-changes"),
);

export const list = query({
	args: { repositoryId: v.id("repositories") },
	handler: async (ctx, args) => {
		await requireRepositoryAccess(ctx, args.repositoryId);
		return ctx.db
			.query("changeRequests")
			.withIndex("by_repository", (q) =>
				q.eq("repositoryId", args.repositoryId),
			)
			.order("desc")
			.collect();
	},
});

export const getByNumber = query({
	args: { repositoryId: v.id("repositories"), number: v.number() },
	handler: async (ctx, args) => {
		await requireRepositoryAccess(ctx, args.repositoryId);
		const change = await ctx.db
			.query("changeRequests")
			.withIndex("by_repository_and_number", (q) =>
				q.eq("repositoryId", args.repositoryId).eq("number", args.number),
			)
			.unique();
		if (!change) return null;
		const [revisions, reviews, checks, comments, findings] = await Promise.all([
			ctx.db
				.query("changeRevisions")
				.withIndex("by_change_request", (q) =>
					q.eq("changeRequestId", change._id),
				)
				.collect(),
			ctx.db
				.query("changeReviews")
				.withIndex("by_change_request", (q) =>
					q.eq("changeRequestId", change._id),
				)
				.collect(),
			ctx.db
				.query("checkRuns")
				.withIndex("by_change_request", (q) =>
					q.eq("changeRequestId", change._id),
				)
				.collect(),
			ctx.db
				.query("platformComments")
				.withIndex("by_target", (q) =>
					q.eq("targetType", "change").eq("targetId", String(change._id)),
				)
				.collect(),
			change.headRevisionId
				? ctx.db
						.query("diffFindings")
						.withIndex("by_revision", (q) =>
							q.eq(
								"revisionId",
								change.headRevisionId as Id<"changeRevisions">,
							),
						)
						.collect()
				: [],
		]);
		const revisionsWithFiles = await Promise.all(
			revisions.map(async (revision) => ({
				...revision,
				files: await ctx.db
					.query("changeFiles")
					.withIndex("by_revision", (q) => q.eq("revisionId", revision._id))
					.collect(),
			})),
		);
		return {
			...change,
			revisions: revisionsWithFiles,
			reviews,
			checks,
			comments,
			findings,
		};
	},
});

export const create = mutation({
	args: {
		repositoryId: v.id("repositories"),
		title: v.string(),
		summary: v.string(),
		linkedIssueId: v.optional(v.id("platformIssues")),
		targetRecordId: v.optional(v.id("platformRecords")),
		locationIds: v.array(v.id("locations")),
		labelIds: v.array(v.id("labels")),
		publicAfterMerge: v.boolean(),
	},
	handler: async (ctx, args) => {
		const session = await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"contribute",
		);
		const rules = await requiredRules(ctx, args.repositoryId);
		if (args.linkedIssueId) {
			const issue = await ctx.db.get(args.linkedIssueId);
			if (!issue || issue.repositoryId !== args.repositoryId) {
				throw new Error("Linked issue must belong to this repository");
			}
		}
		if (args.targetRecordId) {
			const record = await ctx.db.get(args.targetRecordId);
			if (!record || record.repositoryId !== args.repositoryId) {
				throw new Error("Target record must belong to this repository");
			}
		}
		const [locations, labels] = await Promise.all([
			Promise.all(args.locationIds.map((locationId) => ctx.db.get(locationId))),
			Promise.all(args.labelIds.map((labelId) => ctx.db.get(labelId))),
		]);
		if (
			locations.some(
				(location) =>
					!location ||
					location.organizationId !== session.membership.organizationId ||
					location.status !== "active",
			)
		) {
			throw new Error("Locations must be active scopes in this organization");
		}
		if (
			labels.some(
				(label) =>
					!label ||
					label.organizationId !== session.membership.organizationId ||
					(label.repositoryId !== undefined &&
						label.repositoryId !== args.repositoryId),
			)
		) {
			throw new Error("Labels must belong to this repository or organization");
		}
		const title = args.title.trim();
		const summary = args.summary.trim();
		if (!title || !summary) throw new Error("Title and summary are required");
		if (args.publicAfterMerge && session.repository.visibility !== "public") {
			throw new Error("Only public repositories can publish accepted records");
		}
		const now = Date.now();
		const number = session.repository.nextChangeNumber;
		const changeId = await ctx.db.insert("changeRequests", {
			organizationId: session.membership.organizationId,
			repositoryId: args.repositoryId,
			number,
			title,
			summary,
			status: "open",
			authorMembershipId: session.membership._id,
			locationIds: args.locationIds,
			labelIds: args.labelIds,
			linkedIssueId: args.linkedIssueId,
			targetRecordId: args.targetRecordId,
			baseVersionId: args.targetRecordId
				? (await ctx.db.get(args.targetRecordId))?.currentVersionId
				: undefined,
			rulesVersion: rules.version,
			unresolvedThreads: 0,
			outOfDate: false,
			publicAfterMerge: args.publicAfterMerge,
			createdAt: now,
			updatedAt: now,
		});
		const revisionId = await ctx.db.insert("changeRevisions", {
			organizationId: session.membership.organizationId,
			repositoryId: args.repositoryId,
			changeRequestId: changeId,
			number: 1,
			authorMembershipId: session.membership._id,
			message: "Initial proposed revision.",
			createdAt: now,
		});
		await ctx.db.patch(changeId, { headRevisionId: revisionId });
		await Promise.all([
			ctx.db.insert("checkRuns", {
				organizationId: session.membership.organizationId,
				repositoryId: args.repositoryId,
				changeRequestId: changeId,
				revisionId,
				name: "Repository rules",
				description: `${rules.minimumApprovals} independent approvals are required.`,
				conclusion: "passed",
				required: true,
				createdAt: now,
				updatedAt: now,
			}),
			ctx.db.patch(args.repositoryId, {
				nextChangeNumber: number + 1,
				changeCount: session.repository.changeCount + 1,
				updatedAt: now,
			}),
		]);
		if (args.linkedIssueId) {
			await ctx.db.patch(args.linkedIssueId, {
				status: "in-review",
				updatedAt: now,
			});
		}
		await recordAudit(
			ctx,
			session,
			"Change request opened",
			"change-request",
			String(changeId),
			`${session.repository.name} #${number}: ${title}`,
			now,
		);
		return { changeId, number };
	},
});

export const comment = mutation({
	args: {
		changeRequestId: v.id("changeRequests"),
		body: v.string(),
		visibility: v.union(v.literal("internal"), v.literal("public")),
	},
	handler: async (ctx, args) => {
		const change = await ctx.db.get(args.changeRequestId);
		if (!change) throw new Error("Change request not found");
		const session = await requireRepositoryAccess(
			ctx,
			change.repositoryId,
			"contribute",
		);
		const body = args.body.trim();
		if (!body) throw new Error("Comment cannot be empty");
		if (
			args.visibility === "public" &&
			session.repository.visibility !== "public"
		) {
			throw new Error("Only public repositories can contain public comments");
		}
		if (["merged", "closed"].includes(change.status)) {
			throw new Error("This change request is no longer open for comments");
		}
		const now = Date.now();
		const commentId = await ctx.db.insert("platformComments", {
			organizationId: session.membership.organizationId,
			repositoryId: change.repositoryId,
			targetType: "change",
			targetId: String(change._id),
			authorMembershipId: session.membership._id,
			body,
			visibility: args.visibility,
			moderationStatus:
				args.visibility === "public" && session.membership.role === "member"
					? "pending"
					: "approved",
			createdAt: now,
		});
		await ctx.db.patch(change._id, { updatedAt: now });
		return commentId;
	},
});

export const submitReview = mutation({
	args: {
		changeRequestId: v.id("changeRequests"),
		decision: reviewDecision,
		body: v.string(),
	},
	handler: async (ctx, args) => {
		const change = await ctx.db.get(args.changeRequestId);
		if (!change) throw new Error("Change request not found");
		const session = await requireRepositoryAccess(
			ctx,
			change.repositoryId,
			"review",
		);
		if (!change.headRevisionId)
			throw new Error("No revision is ready for review");
		const rules = await requiredRules(ctx, change.repositoryId);
		if (
			args.decision === "approve" &&
			rules.prohibitSelfApproval &&
			change.authorMembershipId === session.membership._id
		) {
			throw new Error("Authors cannot approve their own change request");
		}
		if (["merged", "closed"].includes(change.status)) {
			throw new Error("This change request is no longer reviewable");
		}
		const existing = await ctx.db
			.query("changeReviews")
			.withIndex("by_change_and_reviewer", (q) =>
				q
					.eq("changeRequestId", change._id)
					.eq("reviewerMembershipId", session.membership._id),
			)
			.unique();
		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				revisionId: change.headRevisionId,
				decision: args.decision,
				body: args.body.trim(),
				stale: false,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("changeReviews", {
				organizationId: session.membership.organizationId,
				repositoryId: change.repositoryId,
				changeRequestId: change._id,
				revisionId: change.headRevisionId,
				reviewerMembershipId: session.membership._id,
				decision: args.decision,
				body: args.body.trim(),
				stale: false,
				createdAt: now,
				updatedAt: now,
			});
		}
		const reviews = await ctx.db
			.query("changeReviews")
			.withIndex("by_change_request", (q) =>
				q.eq("changeRequestId", change._id),
			)
			.collect();
		const nextReviews = existing
			? reviews.map((review) =>
					review._id === existing._id
						? {
								...review,
								revisionId: change.headRevisionId as Id<"changeRevisions">,
								decision: args.decision,
								stale: false,
							}
						: review,
				)
			: [
					...reviews,
					{
						reviewerMembershipId: session.membership._id,
						revisionId: change.headRevisionId,
						decision: args.decision,
						stale: false,
					},
				];
		const approved = await approvalsSatisfyRules(
			ctx,
			change,
			nextReviews,
			rules,
		);
		await ctx.db.patch(change._id, {
			status:
				args.decision === "request-changes"
					? "changes-requested"
					: approved
						? "approved"
						: "open",
			updatedAt: now,
		});
		await recordAudit(
			ctx,
			session,
			args.decision === "approve"
				? "Change approved"
				: args.decision === "request-changes"
					? "Changes requested"
					: "Change reviewed",
			"change-request",
			String(change._id),
			args.body.trim() || `Review decision: ${args.decision}.`,
			now,
		);
	},
});

export const legacyMergeDisabled = mutation({
	args: { changeRequestId: v.id("changeRequests") },
	handler: async (ctx, args) => {
		if (args.changeRequestId) {
			throw new Error(
				"Direct merge is disabled. Use the publication workflow.",
			);
		}
		const change = await ctx.db.get(args.changeRequestId);
		if (!change) throw new Error("Change request not found");
		const session = await requireRepositoryAccess(
			ctx,
			change.repositoryId,
			"review",
		);
		if (!change.headRevisionId) throw new Error("No revision is ready");
		if (change.status === "merged") return change.targetRecordId;
		if (change.status === "closed")
			throw new Error("Closed changes cannot be accepted");
		const rules = await requiredRules(ctx, change.repositoryId);
		const effectiveRole =
			session.membership.role === "administrator"
				? "organization-admin"
				: session.membership.role === "owner"
					? "organization-owner"
					: session.repositoryRole;
		if (!effectiveRole || !rules.finalizerRoles.includes(effectiveRole)) {
			throw new Error("Your role cannot accept changes in this repository");
		}
		const [reviews, checks, labels] = await Promise.all([
			ctx.db
				.query("changeReviews")
				.withIndex("by_change_request", (q) =>
					q.eq("changeRequestId", change._id),
				)
				.collect(),
			ctx.db
				.query("checkRuns")
				.withIndex("by_change_request", (q) =>
					q.eq("changeRequestId", change._id),
				)
				.collect(),
			Promise.all(change.labelIds.map((labelId) => ctx.db.get(labelId))),
		]);
		if (!(await approvalsSatisfyRules(ctx, change, reviews, rules))) {
			throw new Error("Required independent approvals are missing");
		}
		if (
			checks.some((check) => check.required && check.conclusion === "failed")
		) {
			throw new Error("A required check is failing");
		}
		if (rules.requireResolvedThreads && change.unresolvedThreads > 0) {
			throw new Error("Resolve blocking review threads before accepting");
		}
		if (change.outOfDate) {
			throw new Error("Update this change against the accepted record first");
		}
		if (labels.some((label) => label?.blocksMerge)) {
			throw new Error("A protected label is blocking this change");
		}
		if (change.targetRecordId) {
			const target = await ctx.db.get(change.targetRecordId);
			if (!target || target.currentVersionId !== change.baseVersionId) {
				await ctx.db.patch(change._id, { outOfDate: true });
				throw new Error(
					"The accepted record changed; update this request first",
				);
			}
		}
		const now = Date.now();
		const revisionFiles = await ctx.db
			.query("changeFiles")
			.withIndex("by_revision", (q) =>
				q.eq("revisionId", change.headRevisionId as Id<"changeRevisions">),
			)
			.collect();
		if (
			revisionFiles.some(
				(file) =>
					file.processingStatus !== "ready" &&
					file.processingStatus !== "quarantined",
			)
		) {
			throw new Error("Every uploaded document must finish processing");
		}
		let record = change.targetRecordId
			? await ctx.db.get(change.targetRecordId)
			: null;
		if (!record) {
			const recordId = await ctx.db.insert("platformRecords", {
				organizationId: session.membership.organizationId,
				repositoryId: change.repositoryId,
				title: change.title,
				collection: collectionForKind(session.repository.kind),
				locationIds: change.locationIds,
				visibility:
					change.publicAfterMerge && session.repository.visibility === "public"
						? "public"
						: session.repository.visibility,
				createdAt: now,
				updatedAt: now,
			});
			record = await ctx.db.get(recordId);
			await ctx.db.patch(change.repositoryId, {
				recordCount: session.repository.recordCount + 1,
				updatedAt: now,
			});
		}
		if (!record) throw new Error("Record could not be created");
		const priorVersions = await ctx.db
			.query("recordVersions")
			.withIndex("by_record", (q) => q.eq("recordId", record._id))
			.collect();
		const sha256 =
			revisionFiles[0]?.sha256 ??
			`structured-${change.headRevisionId}-${change.updatedAt}`;
		const versionId = await ctx.db.insert("recordVersions", {
			organizationId: session.membership.organizationId,
			repositoryId: change.repositoryId,
			recordId: record._id,
			changeRequestId: change._id,
			revisionId: change.headRevisionId,
			version: priorVersions.length + 1,
			createdBy: session.membership._id,
			summary: change.summary,
			sha256,
			masterProvider: "azure",
			azureEvidenceRef: `azure://evidence/${session.membership.organizationId}/${change.repositoryId}/${change._id}/${change.headRevisionId}`,
			publicationManifestRef: `azure://evidence/${session.membership.organizationId}/${change.repositoryId}/${change._id}/${change.headRevisionId}/publication-manifest.json`,
			publishedAt: now,
			legacyBaseline: false,
			createdAt: now,
		});
		await Promise.all([
			ctx.db.patch(record._id, {
				currentVersionId: versionId,
				updatedAt: now,
			}),
			ctx.db.patch(change._id, {
				targetRecordId: record._id,
				status: "merged",
				mergedAt: now,
				mergedBy: session.membership._id,
				updatedAt: now,
			}),
		]);
		if (change.linkedIssueId) {
			await ctx.db.patch(change.linkedIssueId, {
				state: "closed",
				status: "done",
				updatedAt: now,
			});
		}
		if (change.publicAfterMerge && session.repository.visibility === "public") {
			const organization = await ctx.db.get(session.membership.organizationId);
			const priorSnapshots = await ctx.db
				.query("publicRepositorySnapshots")
				.withIndex("by_repository", (q) =>
					q.eq("repositoryId", change.repositoryId),
				)
				.collect();
			await ctx.db.insert("publicRepositorySnapshots", {
				organizationId: session.membership.organizationId,
				repositoryId: change.repositoryId,
				organizationSlug:
					organization?.publicSlug ?? organization?.slug ?? "organization",
				repositorySlug: session.repository.slug,
				version: priorSnapshots.length + 1,
				payload: {
					repository: {
						name: session.repository.name,
						description: session.repository.description,
					},
					record: {
						id: String(record._id),
						title: record.title,
						collection: record.collection,
						version: priorVersions.length + 1,
						summary: change.summary,
						sha256,
						publishedAt: now,
					},
					change: {
						number: change.number,
						title: change.title,
						summary: change.summary,
					},
				},
				sha256,
				publishedBy: session.membership._id,
				publishedAt: now,
			});
		}
		await ctx.db.insert("platformNotifications", {
			organizationId: session.membership.organizationId,
			membershipId: change.authorMembershipId,
			repositoryId: change.repositoryId,
			type: "merge",
			title: "Change accepted",
			body: `${change.title} is now the accepted record.`,
			targetType: "record",
			targetId: String(record._id),
			createdAt: now,
		});
		await recordAudit(
			ctx,
			session,
			"Change accepted",
			"record-version",
			String(versionId),
			`Created immutable record version ${priorVersions.length + 1} from change request #${change.number}.`,
			now,
		);
		return record._id;
	},
});

async function requiredRules(
	ctx: MutationCtx,
	repositoryId: Id<"repositories">,
) {
	const rules = await ctx.db
		.query("repositoryRules")
		.withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
		.unique();
	if (!rules) throw new Error("Repository protection rules are missing");
	return rules;
}

async function approvalsSatisfyRules(
	ctx: MutationCtx,
	change: Doc<"changeRequests">,
	reviews: Array<
		Pick<
			Doc<"changeReviews">,
			"reviewerMembershipId" | "revisionId" | "decision" | "stale"
		>
	>,
	rules: Doc<"repositoryRules">,
) {
	if (!change.headRevisionId) return false;
	const approvals = reviews.filter(
		(review) =>
			review.decision === "approve" &&
			!review.stale &&
			review.revisionId === change.headRevisionId,
	);
	if (approvals.length < rules.minimumApprovals) return false;
	if (!rules.requiredTeamIds.length) return true;
	const teamMembers = await Promise.all(
		rules.requiredTeamIds.map((teamId) =>
			ctx.db
				.query("teamMembers")
				.withIndex("by_team", (q) => q.eq("teamId", teamId))
				.collect(),
		),
	);
	return teamMembers.every((members) =>
		approvals.some((approval) =>
			members.some(
				(member) => member.membershipId === approval.reviewerMembershipId,
			),
		),
	);
}

function collectionForKind(kind: Doc<"repositories">["kind"]) {
	switch (kind) {
		case "governance":
			return "Board resolutions";
		case "compliance":
			return "Compliance records";
		case "funding":
			return "Financial records";
		case "transparency":
			return "Publications";
		default:
			return "Records";
	}
}

async function recordAudit(
	ctx: MutationCtx,
	session: Awaited<ReturnType<typeof requireRepositoryAccess>>,
	action: string,
	targetType: string,
	targetId: string,
	reason: string,
	createdAt: number,
) {
	await ctx.db.insert("auditEvents", {
		organizationId: session.membership.organizationId,
		actorUserId: session.user._id,
		action,
		targetType,
		targetId,
		reason,
		source: "Repository platform",
		createdAt,
	});
}

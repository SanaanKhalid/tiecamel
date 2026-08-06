import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { requirePlatformSession } from "./lib/platformAuth";

export const overview = query({
	args: {},
	handler: async (ctx) => {
		const session = await requirePlatformSession(ctx);
		const organizationId = session.membership.organizationId;
		const [
			organization,
			repositories,
			issues,
			changes,
			records,
			notifications,
		] = await Promise.all([
			ctx.db.get(organizationId),
			ctx.db
				.query("repositories")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("platformIssues")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("changeRequests")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("platformRecords")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("platformNotifications")
				.withIndex("by_membership_and_time", (q) =>
					q.eq("membershipId", session.membership._id),
				)
				.order("desc")
				.take(50),
		]);
		return {
			organization,
			viewer: {
				membershipId: session.membership._id,
				name: session.user.name,
				role: session.membership.role,
			},
			repositories,
			issues,
			changes,
			records,
			notifications,
		};
	},
});

export const workspace = query({
	args: { demoSessionToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		const organizationId = session.membership.organizationId;
		const organization = await ctx.db.get(organizationId);
		if (!organization) throw new Error("Organization not found");
		const [
			memberships,
			teams,
			teamMembers,
			locations,
			labels,
			repositories,
			issues,
			comments,
			changes,
			revisions,
			files,
			reviews,
			checks,
			findings,
			diffs,
			documentArtifacts,
			records,
			recordVersions,
			repositoryCommits,
			integrityAnchors,
			providerConnections,
			storageConfigs,
			publicationJobs,
			baselineImports,
			activity,
			notifications,
		] = await Promise.all([
			ctx.db
				.query("memberships")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("teams")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("teamMembers")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("locations")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("labels")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("repositories")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("platformIssues")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("platformComments")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("changeRequests")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("changeRevisions")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("changeFiles")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("changeReviews")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("checkRuns")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("diffFindings")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("documentDiffs")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("documentArtifacts")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("platformRecords")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("recordVersions")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("repositoryCommits")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("integrityAnchors")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("providerConnections")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("repositoryStorageConfigs")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("publicationJobs")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("baselineImports")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("auditEvents")
				.withIndex("by_organization_and_time", (q) =>
					q.eq("organizationId", organizationId),
				)
				.order("desc")
				.take(200),
			ctx.db
				.query("platformNotifications")
				.withIndex("by_membership_and_time", (q) =>
					q.eq("membershipId", session.membership._id),
				)
				.order("desc")
				.take(100),
		]);
		const memberUsers = await Promise.all(
			memberships.map(async (membership) => ({
				membership,
				user: await ctx.db.get(membership.userId),
			})),
		);
		const rules = await Promise.all(
			repositories.map((repository) =>
				ctx.db
					.query("repositoryRules")
					.withIndex("by_repository", (q) =>
						q.eq("repositoryId", repository._id),
					)
					.unique(),
			),
		);
		return {
			organization,
			viewerMembershipId: session.membership._id,
			memberUsers,
			teams,
			teamMembers,
			locations,
			labels,
			repositories: repositories.map((repository, index) => ({
				repository,
				rules: rules[index],
			})),
			issues,
			comments,
			changes,
			revisions,
			files,
			reviews,
			checks,
			findings,
			diffs,
			documentArtifacts,
			records,
			recordVersions,
			repositoryCommits,
			integrityAnchors,
			providerConnections,
			storageConfigs,
			publicationJobs,
			baselineImports,
			activity,
			notifications,
		};
	},
});

export const ensureSeeded = mutation({
	args: { demoSessionToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		const organizationId = session.membership.organizationId;
		const existing = await ctx.db
			.query("repositories")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.first();
		if (existing) {
			await ensureExpectedTeamMemberships(ctx, organizationId, Date.now());
			await ensureExpectedRepositoryRoles(ctx, organizationId);
			return { created: false };
		}
		const now = Date.now();
		const teamDefinitions = [
			["board", "Board", "Directors with formal governance authority."],
			[
				"finance",
				"Finance Committee",
				"Treasury, budget, and financial review.",
			],
			[
				"compliance",
				"Compliance",
				"Operational owners for filings and obligations.",
			],
			[
				"independent-reviewers",
				"Independent Reviewers",
				"People who verify evidence independently.",
			],
			[
				"publishers",
				"Authorized Publishers",
				"People who may release approved public records.",
			],
		] as const;
		const teamIds = new Map<string, Id<"teams">>();
		for (const [slug, name, description] of teamDefinitions) {
			const teamId = await ctx.db.insert("teams", {
				organizationId,
				name,
				slug,
				description,
				createdAt: now,
				updatedAt: now,
			});
			teamIds.set(slug, teamId);
		}

		const memberships = await ctx.db
			.query("memberships")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.collect();
		for (const membership of memberships.filter(
			(item) => item.status === "active",
		)) {
			const teamSlugs = teamsForMembershipRole(membership.role);
			for (const slug of teamSlugs) {
				const teamId = teamIds.get(slug);
				if (!teamId) continue;
				await ctx.db.insert("teamMembers", {
					organizationId,
					teamId,
					membershipId: membership._id,
					createdAt: now,
				});
			}
		}

		const repositoryDefinitions = [
			{
				slug: "governance",
				name: "Governance",
				description:
					"Board resolutions, policies, bylaws, minutes, and decisions.",
				prefix: "GOV",
				kind: "governance" as const,
				visibility: "members" as const,
				color: "#8250df",
				minimumApprovals: 3,
				requiredTeamSlugs: ["board"],
				publicIntegrityAnchoring: false,
			},
			{
				slug: "compliance",
				name: "Compliance",
				description:
					"Tax notices, filings, insurance, grants, licenses, and deadlines.",
				prefix: "COMP",
				kind: "compliance" as const,
				visibility: "internal" as const,
				color: "#cf222e",
				minimumApprovals: 2,
				requiredTeamSlugs: ["independent-reviewers", "compliance"],
				publicIntegrityAnchoring: false,
			},
			{
				slug: "funding",
				name: "Funding",
				description: "Budgets, proposals, expenses, and financial reports.",
				prefix: "FUND",
				kind: "funding" as const,
				visibility: "members" as const,
				color: "#1a7f37",
				minimumApprovals: 2,
				requiredTeamSlugs: ["finance", "board"],
				publicIntegrityAnchoring: false,
			},
			{
				slug: "transparency",
				name: "Transparency",
				description:
					"Public disclosures, member reports, and publication history.",
				prefix: "TRANS",
				kind: "transparency" as const,
				visibility: "public" as const,
				color: "#0969da",
				minimumApprovals: 3,
				requiredTeamSlugs: ["independent-reviewers", "board", "publishers"],
				publicIntegrityAnchoring: true,
			},
		];
		const repositoryIds = new Map<string, Id<"repositories">>();
		for (const definition of repositoryDefinitions) {
			const repositoryId = await ctx.db.insert("repositories", {
				organizationId,
				name: definition.name,
				slug: definition.slug,
				description: definition.description,
				prefix: definition.prefix,
				kind: definition.kind,
				visibility: definition.visibility,
				color: definition.color,
				nextIssueNumber: 1,
				nextChangeNumber: 1,
				issueCount: 0,
				changeCount: 0,
				recordCount: 0,
				createdAt: now,
				updatedAt: now,
			});
			repositoryIds.set(definition.slug, repositoryId);
			await ctx.db.insert("repositoryRules", {
				organizationId,
				repositoryId,
				minimumApprovals: definition.minimumApprovals,
				requiredTeamIds: definition.requiredTeamSlugs
					.map((slug) => teamIds.get(slug))
					.filter((teamId): teamId is NonNullable<typeof teamId> =>
						Boolean(teamId),
					),
				dismissApprovalsOnRevision: true,
				prohibitSelfApproval: true,
				requireIssue: false,
				requireResolvedThreads: true,
				memberIssuesEnabled: ["funding", "transparency"].includes(
					definition.slug,
				),
				memberCommentsEnabled: definition.visibility !== "internal",
				publicIntegrityAnchoring: definition.publicIntegrityAnchoring,
				finalizerRoles: [
					"organization-owner",
					"organization-admin",
					"repository-admin",
					"maintainer",
				],
				version: 1,
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("repositoryStorageConfigs", {
				organizationId,
				repositoryId,
				provider: "azure",
				displayPath: "TieCamel managed records",
				version: 1,
				health: "healthy",
				createdBy: session.membership._id,
				createdAt: now,
				updatedAt: now,
			});
			for (const membership of memberships.filter(
				(item) => item.status === "active" && item.role !== "member",
			)) {
				await ctx.db.insert("repositoryMembers", {
					organizationId,
					repositoryId,
					membershipId: membership._id,
					role: repositoryRoleForMembership(membership.role),
					createdAt: now,
				});
			}
		}

		const systemLabels = [
			["Close to breach", "#b45309", false],
			["Breached", "#be123c", false],
			["Processing failed", "#be123c", true],
			["Sensitive", "#6d28d9", false],
			["Do not merge", "#b91c1c", true],
		] as const;
		for (const [name, color, blocksMerge] of systemLabels) {
			await ctx.db.insert("labels", {
				organizationId,
				name,
				color,
				description: `Protected ${name.toLowerCase()} policy label.`,
				system: true,
				blocksMerge,
				createdAt: now,
				updatedAt: now,
			});
		}

		const complianceId = repositoryIds.get("compliance");
		if (complianceId) {
			const issueId = await ctx.db.insert("platformIssues", {
				organizationId,
				repositoryId: complianceId,
				number: 1,
				title: "Review the updated property tax notice",
				description:
					"Confirm the balance, exemption status, and response deadline before accepting the revised notice.",
				template: "obligation",
				state: "open",
				status: "in-review",
				authorMembershipId: session.membership._id,
				assigneeIds: [session.membership._id],
				locationIds: [],
				labelIds: [],
				dueDate: now + 5 * 24 * 60 * 60 * 1000,
				commentCount: 0,
				watcherIds: [session.membership._id],
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.patch(complianceId, {
				nextIssueNumber: 2,
				issueCount: 1,
			});
			await ctx.db.insert("auditEvents", {
				organizationId,
				actorUserId: session.user._id,
				action: "Repository platform initialized",
				targetType: "organization",
				targetId: String(organizationId),
				reason: `Created four governed repositories and seeded issue ${String(issueId)}.`,
				source: "Platform bootstrap",
				createdAt: now,
			});
		}
		await seedGitDemoFixture(ctx, organizationId, session.membership._id, now);
		return { created: true };
	},
});

export const ensureGitFixtures = mutation({
	args: { demoSessionToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		if (!args.demoSessionToken) {
			throw new Error(
				"Git fixtures are available only in development demo mode",
			);
		}
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		return seedGitDemoFixture(
			ctx,
			session.membership.organizationId,
			session.membership._id,
			Date.now(),
		);
	},
});

async function seedGitDemoFixture(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	membershipId: Id<"memberships">,
	now: number,
) {
	const repository = await ctx.db
		.query("repositories")
		.withIndex("by_organization_and_slug", (q) =>
			q.eq("organizationId", organizationId).eq("slug", "compliance"),
		)
		.unique();
	if (!repository) return { created: false };
	const existing = await ctx.db
		.query("platformRecords")
		.withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
		.first();
	if (existing) {
		const demoFile = (
			await ctx.db
				.query("changeFiles")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect()
		).find(
			(file) =>
				file.azureBlobRef ===
				"demo:///demo-documents/2026-property-tax-notice.pdf",
		);
		if (demoFile?.size === 0) await ctx.db.patch(demoFile._id, { size: 2777 });
		return { created: false };
	}
	const changeId = await ctx.db.insert("changeRequests", {
		organizationId,
		repositoryId: repository._id,
		number: repository.nextChangeNumber,
		title: "Accept the 2026 property tax notice",
		summary: "Legacy demo baseline for the current accepted tax notice.",
		status: "merged",
		authorMembershipId: membershipId,
		locationIds: [],
		labelIds: [],
		rulesVersion: 1,
		unresolvedThreads: 0,
		outOfDate: false,
		publicAfterMerge: false,
		mergedAt: now,
		mergedBy: membershipId,
		createdAt: now,
		updatedAt: now,
	});
	const revisionId = await ctx.db.insert("changeRevisions", {
		organizationId,
		repositoryId: repository._id,
		changeRequestId: changeId,
		number: 1,
		authorMembershipId: membershipId,
		message: "Imported accepted baseline.",
		createdAt: now,
	});
	await ctx.db.patch(changeId, { headRevisionId: revisionId });
	await ctx.db.insert("changeFiles", {
		organizationId,
		repositoryId: repository._id,
		changeRequestId: changeId,
		revisionId,
		name: "2026-property-tax-notice.pdf",
		mimeType: "application/pdf",
		size: 2777,
		sha256: "c5e8b00924973685f375b55fddf54b5e91c793cf73170aae1e03bdeb0efdf39c",
		role: "primary",
		objectKey: "demo-documents/2026-property-tax-notice.pdf",
		azureBlobRef: "demo:///demo-documents/2026-property-tax-notice.pdf",
		processingStatus: "ready",
		createdAt: now,
	});
	const recordId = await ctx.db.insert("platformRecords", {
		organizationId,
		repositoryId: repository._id,
		title: "2026 property tax notice",
		collection: "Tax notices",
		locationIds: [],
		visibility: "internal",
		createdAt: now,
		updatedAt: now,
	});
	const versionId = await ctx.db.insert("recordVersions", {
		organizationId,
		repositoryId: repository._id,
		recordId,
		changeRequestId: changeId,
		revisionId,
		version: 1,
		createdBy: membershipId,
		summary: "Imported accepted baseline for local document-diff demos.",
		sha256: "c5e8b00924973685f375b55fddf54b5e91c793cf73170aae1e03bdeb0efdf39c",
		contentSha256:
			"c5e8b00924973685f375b55fddf54b5e91c793cf73170aae1e03bdeb0efdf39c",
		exactBlobRef: "demo:///demo-documents/2026-property-tax-notice.pdf",
		masterProvider: "azure",
		azureEvidenceRef: "demo:///demo-documents/2026-property-tax-notice.pdf",
		publicationManifestRef:
			"demo:///demo-documents/2026-property-tax-notice.manifest.json",
		publishedAt: now,
		legacyBaseline: true,
		createdAt: now,
	});
	await Promise.all([
		ctx.db.patch(recordId, { currentVersionId: versionId }),
		ctx.db.patch(changeId, { targetRecordId: recordId }),
		ctx.db.patch(repository._id, {
			nextChangeNumber: repository.nextChangeNumber + 1,
			changeCount: repository.changeCount + 1,
			recordCount: repository.recordCount + 1,
			updatedAt: now,
		}),
	]);
	return { created: true, recordId };
}

function teamsForMembershipRole(role: string) {
	switch (role) {
		case "administrator":
			return ["board", "finance", "compliance", "publishers"];
		case "owner":
			return ["board", "compliance"];
		case "board":
			return ["board"];
		case "secretary":
			return ["board"];
		case "finance":
			return ["finance", "compliance"];
		case "reviewer":
			return ["independent-reviewers"];
		default:
			return [];
	}
}

async function ensureExpectedTeamMemberships(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	now: number,
) {
	const [teams, memberships, existing] = await Promise.all([
		ctx.db
			.query("teams")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.collect(),
		ctx.db
			.query("memberships")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.collect(),
		ctx.db
			.query("teamMembers")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.collect(),
	]);
	const teamBySlug = new Map(teams.map((team) => [team.slug, team._id]));
	const assigned = new Set(
		existing.map((item) => `${item.teamId}:${item.membershipId}`),
	);
	for (const membership of memberships.filter(
		(item) => item.status === "active",
	)) {
		for (const slug of teamsForMembershipRole(membership.role)) {
			const teamId = teamBySlug.get(slug);
			if (!teamId || assigned.has(`${teamId}:${membership._id}`)) continue;
			await ctx.db.insert("teamMembers", {
				organizationId,
				teamId,
				membershipId: membership._id,
				createdAt: now,
			});
		}
	}
}

async function ensureExpectedRepositoryRoles(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
) {
	const [memberships, assignments] = await Promise.all([
		ctx.db
			.query("memberships")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.collect(),
		ctx.db
			.query("repositoryMembers")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.collect(),
	]);
	const membershipById = new Map(
		memberships.map((membership) => [membership._id, membership]),
	);
	for (const assignment of assignments) {
		const membership = membershipById.get(assignment.membershipId);
		if (!membership) continue;
		const role = repositoryRoleForMembership(membership.role);
		if (assignment.role !== role) await ctx.db.patch(assignment._id, { role });
	}
}

function repositoryRoleForMembership(role: string) {
	switch (role) {
		case "administrator":
			return "repository-admin" as const;
		case "owner":
		case "secretary":
			return "maintainer" as const;
		case "finance":
		case "board":
		case "reviewer":
			return "reviewer" as const;
		default:
			return "contributor" as const;
	}
}

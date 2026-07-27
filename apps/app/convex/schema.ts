import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const riskStatus = v.union(
	v.literal("healthy"),
	v.literal("due-soon"),
	v.literal("at-risk"),
	v.literal("breached"),
	v.literal("disputed"),
	v.literal("resolved"),
);

const workStatus = v.union(
	v.literal("open"),
	v.literal("in-progress"),
	v.literal("in-review"),
	v.literal("complete"),
);

const disclosureVisibility = v.union(
	v.literal("public"),
	v.literal("members"),
	v.literal("private"),
);

const disclosureReviewStatus = v.union(
	v.literal("ready"),
	v.literal("redaction-required"),
	v.literal("legal-review"),
);

const disclosureApprovalStatus = v.union(
	v.literal("pending"),
	v.literal("approved"),
	v.literal("withheld"),
);

const repositoryVisibility = v.union(
	v.literal("restricted"),
	v.literal("internal"),
	v.literal("members"),
	v.literal("public"),
);

const repositoryRole = v.union(
	v.literal("repository-admin"),
	v.literal("maintainer"),
	v.literal("contributor"),
	v.literal("reviewer"),
);

const issueStatus = v.union(
	v.literal("todo"),
	v.literal("in-progress"),
	v.literal("in-review"),
	v.literal("done"),
);

const changeRequestStatus = v.union(
	v.literal("draft"),
	v.literal("open"),
	v.literal("changes-requested"),
	v.literal("approved"),
	v.literal("merged"),
	v.literal("closed"),
);

const reviewDecision = v.union(
	v.literal("comment"),
	v.literal("approve"),
	v.literal("request-changes"),
);

const checkConclusion = v.union(
	v.literal("queued"),
	v.literal("running"),
	v.literal("passed"),
	v.literal("warning"),
	v.literal("failed"),
);

const storageProvider = v.union(
	v.literal("azure"),
	v.literal("google-drive"),
	v.literal("one-drive"),
);

const integrationHealth = v.union(
	v.literal("healthy"),
	v.literal("degraded"),
	v.literal("disconnected"),
);

const publicationStatus = v.union(
	v.literal("queued"),
	v.literal("running"),
	v.literal("succeeded"),
	v.literal("failed"),
);

export default defineSchema({
	organizations: defineTable({
		name: v.string(),
		slug: v.string(),
		publicSlug: v.optional(v.string()),
		boardSize: v.optional(v.number()),
		quorum: v.optional(v.number()),
		mfaRequired: v.optional(v.boolean()),
		status: v.union(
			v.literal("pilot"),
			v.literal("active"),
			v.literal("suspended"),
		),
		createdAt: v.number(),
	})
		.index("by_slug", ["slug"])
		.index("by_public_slug", ["publicSlug"]),
	users: defineTable({
		clerkUserId: v.string(),
		name: v.string(),
		email: v.string(),
		createdAt: v.number(),
	}).index("by_clerk_user", ["clerkUserId"]),
	memberships: defineTable({
		organizationId: v.id("organizations"),
		userId: v.id("users"),
		role: v.union(
			v.literal("administrator"),
			v.literal("board"),
			v.literal("secretary"),
			v.literal("finance"),
			v.literal("owner"),
			v.literal("reviewer"),
			v.literal("member"),
		),
		status: v.union(
			v.literal("invited"),
			v.literal("active"),
			v.literal("revoked"),
		),
		createdAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_user_and_organization", ["userId", "organizationId"]),
	locations: defineTable({
		organizationId: v.id("organizations"),
		name: v.string(),
		status: v.union(v.literal("active"), v.literal("inactive")),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_organization", ["organizationId"]),
	teams: defineTable({
		organizationId: v.id("organizations"),
		name: v.string(),
		slug: v.string(),
		description: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_organization_and_slug", ["organizationId", "slug"]),
	teamMembers: defineTable({
		organizationId: v.id("organizations"),
		teamId: v.id("teams"),
		membershipId: v.id("memberships"),
		createdAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_team", ["teamId"])
		.index("by_team_and_member", ["teamId", "membershipId"]),
	repositories: defineTable({
		organizationId: v.id("organizations"),
		name: v.string(),
		slug: v.string(),
		description: v.string(),
		prefix: v.string(),
		kind: v.union(
			v.literal("governance"),
			v.literal("compliance"),
			v.literal("funding"),
			v.literal("transparency"),
			v.literal("custom"),
		),
		visibility: repositoryVisibility,
		color: v.string(),
		nextIssueNumber: v.number(),
		nextChangeNumber: v.number(),
		issueCount: v.number(),
		changeCount: v.number(),
		recordCount: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_organization_and_slug", ["organizationId", "slug"]),
	repositoryMembers: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		membershipId: v.id("memberships"),
		role: repositoryRole,
		createdAt: v.number(),
	})
		.index("by_repository", ["repositoryId"])
		.index("by_repository_and_member", ["repositoryId", "membershipId"]),
	repositoryRules: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		minimumApprovals: v.number(),
		requiredTeamIds: v.array(v.id("teams")),
		dismissApprovalsOnRevision: v.boolean(),
		prohibitSelfApproval: v.boolean(),
		requireIssue: v.boolean(),
		requireResolvedThreads: v.boolean(),
		memberIssuesEnabled: v.boolean(),
		memberCommentsEnabled: v.boolean(),
		publicIntegrityAnchoring: v.optional(v.boolean()),
		finalizerRoles: v.array(v.string()),
		version: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_repository", ["repositoryId"]),
	labels: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.optional(v.id("repositories")),
		name: v.string(),
		color: v.string(),
		description: v.string(),
		system: v.boolean(),
		blocksMerge: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_repository", ["repositoryId"]),
	platformIssues: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		number: v.number(),
		title: v.string(),
		description: v.string(),
		template: v.union(
			v.literal("obligation"),
			v.literal("incident"),
			v.literal("proposal"),
			v.literal("question"),
			v.literal("general"),
		),
		state: v.union(v.literal("open"), v.literal("closed")),
		status: issueStatus,
		authorMembershipId: v.id("memberships"),
		assigneeIds: v.array(v.id("memberships")),
		locationIds: v.array(v.id("locations")),
		labelIds: v.array(v.id("labels")),
		dueDate: v.optional(v.number()),
		recurrence: v.optional(v.string()),
		commentCount: v.number(),
		watcherIds: v.array(v.id("memberships")),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_repository", ["repositoryId"])
		.index("by_repository_and_number", ["repositoryId", "number"])
		.index("by_organization_and_status", ["organizationId", "status"]),
	platformComments: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		targetType: v.union(v.literal("issue"), v.literal("change")),
		targetId: v.string(),
		authorMembershipId: v.id("memberships"),
		body: v.string(),
		visibility: v.union(v.literal("internal"), v.literal("public")),
		moderationStatus: v.union(
			v.literal("pending"),
			v.literal("approved"),
			v.literal("withheld"),
		),
		createdAt: v.number(),
		editedAt: v.optional(v.number()),
	})
		.index("by_organization", ["organizationId"])
		.index("by_target", ["targetType", "targetId"]),
	changeRequests: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		number: v.number(),
		title: v.string(),
		summary: v.string(),
		status: changeRequestStatus,
		authorMembershipId: v.id("memberships"),
		locationIds: v.array(v.id("locations")),
		labelIds: v.array(v.id("labels")),
		linkedIssueId: v.optional(v.id("platformIssues")),
		targetRecordId: v.optional(v.id("platformRecords")),
		headRevisionId: v.optional(v.id("changeRevisions")),
		baseVersionId: v.optional(v.id("recordVersions")),
		rulesVersion: v.number(),
		unresolvedThreads: v.number(),
		outOfDate: v.boolean(),
		publicAfterMerge: v.boolean(),
		mergedAt: v.optional(v.number()),
		mergedBy: v.optional(v.id("memberships")),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_repository", ["repositoryId"])
		.index("by_repository_and_number", ["repositoryId", "number"]),
	changeRevisions: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		changeRequestId: v.id("changeRequests"),
		number: v.number(),
		authorMembershipId: v.id("memberships"),
		message: v.string(),
		createdAt: v.number(),
	})
		.index("by_change_request", ["changeRequestId"])
		.index("by_organization", ["organizationId"]),
	changeFiles: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		changeRequestId: v.id("changeRequests"),
		revisionId: v.id("changeRevisions"),
		name: v.string(),
		mimeType: v.string(),
		size: v.number(),
		sha256: v.string(),
		role: v.union(v.literal("primary"), v.literal("evidence")),
		objectKey: v.string(),
		azureBlobRef: v.string(),
		processingStatus: v.union(
			v.literal("quarantined"),
			v.literal("processing"),
			v.literal("ready"),
			v.literal("failed"),
		),
		createdAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_revision", ["revisionId"])
		.index("by_change_request", ["changeRequestId"])
		.index("by_sha256", ["sha256"]),
	changeReviews: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		changeRequestId: v.id("changeRequests"),
		revisionId: v.id("changeRevisions"),
		reviewerMembershipId: v.id("memberships"),
		decision: reviewDecision,
		body: v.string(),
		stale: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_change_request", ["changeRequestId"])
		.index("by_change_and_reviewer", [
			"changeRequestId",
			"reviewerMembershipId",
		]),
	checkRuns: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		changeRequestId: v.id("changeRequests"),
		revisionId: v.optional(v.id("changeRevisions")),
		name: v.string(),
		description: v.string(),
		conclusion: checkConclusion,
		required: v.boolean(),
		details: v.optional(v.any()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_change_request", ["changeRequestId"]),
	platformRecords: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		title: v.string(),
		collection: v.string(),
		locationIds: v.array(v.id("locations")),
		visibility: repositoryVisibility,
		currentVersionId: v.optional(v.id("recordVersions")),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_repository", ["repositoryId"])
		.index("by_organization", ["organizationId"]),
	recordVersions: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		recordId: v.id("platformRecords"),
		changeRequestId: v.id("changeRequests"),
		revisionId: v.id("changeRevisions"),
		version: v.number(),
		createdBy: v.id("memberships"),
		summary: v.string(),
		sha256: v.string(),
		manifestSha256: v.optional(v.string()),
		masterProvider: storageProvider,
		azureEvidenceRef: v.string(),
		publicationManifestRef: v.string(),
		externalFileId: v.optional(v.string()),
		externalVersionId: v.optional(v.string()),
		externalUrl: v.optional(v.string()),
		publishedAt: v.number(),
		legacyBaseline: v.boolean(),
		createdAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_record", ["recordId"])
		.index("by_change_request", ["changeRequestId"]),
	extractedFields: defineTable({
		organizationId: v.id("organizations"),
		changeRequestId: v.id("changeRequests"),
		revisionId: v.id("changeRevisions"),
		fileId: v.id("changeFiles"),
		field: v.string(),
		value: v.string(),
		provenance: v.string(),
		confidence: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_revision", ["revisionId"]),
	documentDiffs: defineTable({
		organizationId: v.id("organizations"),
		changeRequestId: v.id("changeRequests"),
		revisionId: v.id("changeRevisions"),
		baseVersionId: v.optional(v.id("recordVersions")),
		structured: v.any(),
		text: v.any(),
		visualManifestKey: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_revision", ["revisionId"]),
	diffFindings: defineTable({
		organizationId: v.id("organizations"),
		changeRequestId: v.id("changeRequests"),
		revisionId: v.id("changeRevisions"),
		field: v.string(),
		before: v.optional(v.string()),
		after: v.optional(v.string()),
		provenance: v.string(),
		severity: v.union(
			v.literal("info"),
			v.literal("warning"),
			v.literal("critical"),
		),
		source: v.union(v.literal("deterministic"), v.literal("advisory-ai")),
		createdAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_revision", ["revisionId"]),
	platformNotifications: defineTable({
		organizationId: v.id("organizations"),
		membershipId: v.id("memberships"),
		repositoryId: v.id("repositories"),
		type: v.union(
			v.literal("assignment"),
			v.literal("mention"),
			v.literal("review"),
			v.literal("deadline"),
			v.literal("merge"),
			v.literal("integrity"),
		),
		title: v.string(),
		body: v.string(),
		targetType: v.union(
			v.literal("issue"),
			v.literal("change"),
			v.literal("record"),
		),
		targetId: v.string(),
		readAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_membership", ["membershipId"])
		.index("by_membership_and_time", ["membershipId", "createdAt"]),
	publicRepositorySnapshots: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		organizationSlug: v.string(),
		repositorySlug: v.string(),
		version: v.number(),
		payload: v.any(),
		sha256: v.string(),
		recordVersionId: v.optional(v.id("recordVersions")),
		integrityAnchorId: v.optional(v.id("integrityAnchors")),
		publishedBy: v.id("memberships"),
		publishedAt: v.number(),
	})
		.index("by_repository", ["repositoryId"])
		.index("by_public_slug", ["organizationSlug", "repositorySlug"]),
	uploadSessions: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		changeRequestId: v.optional(v.id("changeRequests")),
		revisionId: v.optional(v.id("changeRevisions")),
		createdBy: v.id("memberships"),
		fileName: v.string(),
		mimeType: v.string(),
		size: v.number(),
		objectKey: v.string(),
		azureBlobRef: v.string(),
		role: v.optional(v.union(v.literal("primary"), v.literal("evidence"))),
		sha256: v.optional(v.string()),
		status: v.union(
			v.literal("authorized"),
			v.literal("uploaded"),
			v.literal("processing"),
			v.literal("ready"),
			v.literal("failed"),
			v.literal("expired"),
		),
		expiresAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_object_key", ["objectKey"]),
	processingJobs: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		uploadSessionId: v.id("uploadSessions"),
		workflowInstanceId: v.optional(v.string()),
		idempotencyKey: v.optional(v.string()),
		commandId: v.optional(v.string()),
		status: v.union(
			v.literal("queued"),
			v.literal("running"),
			v.literal("succeeded"),
			v.literal("failed"),
		),
		attempt: v.number(),
		error: v.optional(v.string()),
		result: v.optional(v.any()),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_upload_session", ["uploadSessionId"]),
	integrityAnchors: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		recordId: v.id("platformRecords"),
		recordVersionId: v.id("recordVersions"),
		publicSnapshotId: v.optional(v.id("publicRepositorySnapshots")),
		idempotencyKey: v.string(),
		algorithm: v.literal("sha256"),
		commitment: v.string(),
		manifestSha256: v.string(),
		memo: v.string(),
		network: v.union(v.literal("devnet"), v.literal("mainnet-beta")),
		status: v.union(
			v.literal("queued"),
			v.literal("running"),
			v.literal("anchored"),
			v.literal("failed"),
		),
		attempts: v.number(),
		commandId: v.optional(v.string()),
		signature: v.optional(v.string()),
		slot: v.optional(v.number()),
		explorerUrl: v.optional(v.string()),
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
		anchoredAt: v.optional(v.number()),
	})
		.index("by_record_version", ["recordVersionId"])
		.index("by_idempotency_key", ["idempotencyKey"])
		.index("by_repository_and_time", ["repositoryId", "createdAt"]),
	providerConnections: defineTable({
		organizationId: v.id("organizations"),
		provider: v.union(v.literal("google-drive"), v.literal("one-drive")),
		status: integrationHealth,
		displayName: v.string(),
		externalTenant: v.string(),
		serviceIdentity: v.string(),
		keyVaultReference: v.string(),
		capabilities: v.array(v.string()),
		healthMessage: v.optional(v.string()),
		lastVerifiedAt: v.optional(v.number()),
		createdBy: v.id("memberships"),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_organization_and_provider", ["organizationId", "provider"]),
	repositoryStorageConfigs: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		provider: storageProvider,
		connectionId: v.optional(v.id("providerConnections")),
		driveId: v.optional(v.string()),
		folderId: v.optional(v.string()),
		displayPath: v.string(),
		version: v.number(),
		health: integrationHealth,
		createdBy: v.id("memberships"),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_repository", ["repositoryId"]),
	publicationJobs: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		changeRequestId: v.id("changeRequests"),
		revisionId: v.id("changeRevisions"),
		recordId: v.optional(v.id("platformRecords")),
		storageConfigId: v.id("repositoryStorageConfigs"),
		storageConfigVersion: v.number(),
		provider: storageProvider,
		idempotencyKey: v.string(),
		status: publicationStatus,
		attempts: v.number(),
		commandId: v.optional(v.string()),
		errorCode: v.optional(v.string()),
		errorMessage: v.optional(v.string()),
		remoteResult: v.optional(v.any()),
		requestedBy: v.id("memberships"),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_change_request", ["changeRequestId"])
		.index("by_idempotency_key", ["idempotencyKey"])
		.index("by_repository_and_status", ["repositoryId", "status"]),
	externalRecordRefs: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		recordId: v.id("platformRecords"),
		provider: v.union(v.literal("google-drive"), v.literal("one-drive")),
		connectionId: v.id("providerConnections"),
		externalFileId: v.string(),
		externalVersionId: v.string(),
		externalUrl: v.string(),
		etag: v.string(),
		lastVerifiedSha256: v.string(),
		health: integrationHealth,
		lastVerifiedAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_record", ["recordId"])
		.index("by_provider_file", ["provider", "externalFileId"]),
	integrationSubscriptions: defineTable({
		organizationId: v.id("organizations"),
		connectionId: v.id("providerConnections"),
		repositoryId: v.id("repositories"),
		provider: v.union(v.literal("google-drive"), v.literal("one-drive")),
		channelId: v.optional(v.string()),
		resourceId: v.optional(v.string()),
		expiration: v.optional(v.number()),
		cursor: v.optional(v.string()),
		status: integrationHealth,
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_connection", ["connectionId"])
		.index("by_repository", ["repositoryId"]),
	baselineImports: defineTable({
		organizationId: v.id("organizations"),
		repositoryId: v.id("repositories"),
		connectionId: v.id("providerConnections"),
		externalFileId: v.string(),
		fileName: v.string(),
		administratorId: v.id("memberships"),
		attestation: v.string(),
		sha256: v.optional(v.string()),
		azureEvidenceRef: v.optional(v.string()),
		status: v.union(
			v.literal("pending"),
			v.literal("processing"),
			v.literal("succeeded"),
			v.literal("failed"),
		),
		recordId: v.optional(v.id("platformRecords")),
		error: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_repository", ["repositoryId"])
		.index("by_connection", ["connectionId"]),
	assets: defineTable({
		organizationId: v.id("organizations"),
		name: v.string(),
		type: v.string(),
		parcelIdentifier: v.optional(v.string()),
		visibility: v.union(v.literal("board"), v.literal("members")),
		createdAt: v.number(),
	}).index("by_organization", ["organizationId"]),
	obligations: defineTable({
		organizationId: v.id("organizations"),
		assetId: v.optional(v.id("assets")),
		title: v.string(),
		category: v.string(),
		ownerMembershipId: v.id("memberships"),
		backupMembershipId: v.id("memberships"),
		reviewerMembershipId: v.id("memberships"),
		dueDate: v.number(),
		status: riskStatus,
		workStatus: v.optional(workStatus),
		evidenceStatus: v.union(
			v.literal("verified"),
			v.literal("submitted"),
			v.literal("missing"),
		),
		escalationLevel: v.number(),
		visibility: v.union(v.literal("board"), v.literal("members")),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_organization_and_status", ["organizationId", "status"])
		.index("by_organization_and_due_date", ["organizationId", "dueDate"]),
	evidenceSubmissions: defineTable({
		organizationId: v.id("organizations"),
		obligationId: v.id("obligations"),
		submittedBy: v.id("memberships"),
		documentStorageId: v.optional(v.id("_storage")),
		sourceUrl: v.optional(v.string()),
		note: v.optional(v.string()),
		sha256: v.optional(v.string()),
		status: v.union(
			v.literal("submitted"),
			v.literal("verified"),
			v.literal("rejected"),
		),
		reviewedBy: v.optional(v.id("memberships")),
		reviewedAt: v.optional(v.number()),
		reviewNote: v.optional(v.string()),
		createdAt: v.number(),
	})
		.index("by_obligation", ["obligationId"])
		.index("by_organization", ["organizationId"]),
	decisions: defineTable({
		organizationId: v.id("organizations"),
		title: v.string(),
		requestedBy: v.id("memberships"),
		status: v.union(
			v.literal("draft"),
			v.literal("voting"),
			v.literal("approved"),
			v.literal("rejected"),
			v.literal("withdrawn"),
		),
		description: v.optional(v.string()),
		scope: v.optional(
			v.union(v.literal("organization"), v.literal("location")),
		),
		locationId: v.optional(v.id("locations")),
		materialsUrl: v.optional(v.string()),
		eligibleVoterIds: v.optional(v.array(v.id("memberships"))),
		followThroughTitle: v.optional(v.string()),
		followThroughOwnerMembershipId: v.optional(v.id("memberships")),
		followThroughDueDate: v.optional(v.number()),
		workCreatedAt: v.optional(v.number()),
		dueDate: v.number(),
		acknowledged: v.number(),
		totalDirectors: v.number(),
		result: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	}).index("by_organization", ["organizationId"]),
	decisionVotes: defineTable({
		organizationId: v.id("organizations"),
		decisionId: v.id("decisions"),
		membershipId: v.id("memberships"),
		choice: v.union(
			v.literal("approve"),
			v.literal("reject"),
			v.literal("abstain"),
			v.literal("recuse"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_decision", ["decisionId"])
		.index("by_member_and_decision", ["membershipId", "decisionId"]),
	decisionAcknowledgements: defineTable({
		organizationId: v.id("organizations"),
		decisionId: v.id("decisions"),
		membershipId: v.id("memberships"),
		createdAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_decision", ["decisionId"])
		.index("by_member_and_decision", ["membershipId", "decisionId"]),
	actionItems: defineTable({
		organizationId: v.id("organizations"),
		decisionId: v.optional(v.id("decisions")),
		obligationId: v.optional(v.id("obligations")),
		title: v.string(),
		ownerMembershipId: v.id("memberships"),
		dueDate: v.number(),
		status: workStatus,
		createdAt: v.number(),
		updatedAt: v.optional(v.number()),
	}).index("by_organization", ["organizationId"]),
	materialNotices: defineTable({
		organizationId: v.id("organizations"),
		title: v.string(),
		category: v.string(),
		fileName: v.string(),
		fileSizeLabel: v.string(),
		documentStorageId: v.optional(v.id("_storage")),
		sha256: v.optional(v.string()),
		uploadedBy: v.id("memberships"),
		uploadedAt: v.number(),
		comment: v.string(),
		important: v.boolean(),
		status: v.union(
			v.literal("draft"),
			v.literal("review-required"),
			v.literal("acknowledged"),
		),
		reviewDueDate: v.number(),
		requiredReviewerIds: v.array(v.id("memberships")),
		communityVisibility: v.union(v.literal("members"), v.literal("public")),
		communitySummary: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_organization_and_status", ["organizationId", "status"]),
	materialNoticeReviews: defineTable({
		organizationId: v.id("organizations"),
		noticeId: v.id("materialNotices"),
		reviewerMembershipId: v.id("memberships"),
		reviewedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_notice", ["noticeId"])
		.index("by_reviewer_and_notice", ["reviewerMembershipId", "noticeId"]),
	financialPeriods: defineTable({
		organizationId: v.id("organizations"),
		period: v.string(),
		status: v.union(
			v.literal("draft"),
			v.literal("prepared"),
			v.literal("reviewed"),
			v.literal("approved"),
			v.literal("published"),
		),
		metrics: v.array(
			v.object({
				label: v.string(),
				actual: v.number(),
				budget: v.number(),
			}),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_organization", ["organizationId"]),
	fundingPools: defineTable({
		organizationId: v.id("organizations"),
		period: v.string(),
		totalAmount: v.number(),
		allocatedAmount: v.number(),
		emergencyReserve: v.number(),
		visibility: disclosureVisibility,
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_organization", ["organizationId"]),
	fundingProposals: defineTable({
		organizationId: v.id("organizations"),
		title: v.string(),
		summary: v.string(),
		category: v.string(),
		requestedAmount: v.number(),
		allocatedAmount: v.number(),
		proposedBy: v.string(),
		votingDeadline: v.number(),
		status: v.union(
			v.literal("open"),
			v.literal("approved"),
			v.literal("funded"),
			v.literal("closed"),
		),
		visibility: disclosureVisibility,
		emergency: v.boolean(),
		supportVotes: v.number(),
		opposeVotes: v.number(),
		abstainVotes: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_organization_and_status", ["organizationId", "status"]),
	fundingVotes: defineTable({
		organizationId: v.id("organizations"),
		proposalId: v.id("fundingProposals"),
		membershipId: v.id("memberships"),
		choice: v.union(
			v.literal("support"),
			v.literal("oppose"),
			v.literal("abstain"),
		),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_proposal", ["proposalId"])
		.index("by_membership", ["membershipId"])
		.index("by_membership_and_proposal", ["membershipId", "proposalId"]),
	fundingExpenses: defineTable({
		organizationId: v.id("organizations"),
		title: v.string(),
		summary: v.string(),
		category: v.string(),
		amount: v.number(),
		budgetSource: v.string(),
		payee: v.string(),
		status: v.union(v.literal("committed"), v.literal("paid")),
		emergency: v.boolean(),
		visibility: disclosureVisibility,
		incurredAt: v.number(),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_organization_and_time", ["organizationId", "incurredAt"]),
	publications: defineTable({
		organizationId: v.id("organizations"),
		period: v.string(),
		status: v.union(
			v.literal("draft"),
			v.literal("review"),
			v.literal("approved"),
			v.literal("anchored"),
		),
		canonicalSha256: v.optional(v.string()),
		merkleRoot: v.optional(v.string()),
		solanaSignature: v.optional(v.string()),
		solanaNetwork: v.optional(
			v.union(v.literal("devnet"), v.literal("mainnet-beta")),
		),
		schemaVersion: v.string(),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_organization", ["organizationId"]),
	disclosureDocuments: defineTable({
		organizationId: v.id("organizations"),
		publicationId: v.id("publications"),
		title: v.string(),
		category: v.string(),
		version: v.string(),
		visibility: disclosureVisibility,
		reviewStatus: disclosureReviewStatus,
		approvalStatus: disclosureApprovalStatus,
		sha256: v.string(),
		approvedAt: v.optional(v.number()),
		approvedBy: v.optional(v.string()),
		voteResult: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_publication", ["publicationId"]),
	auditEvents: defineTable({
		organizationId: v.id("organizations"),
		actorUserId: v.optional(v.id("users")),
		action: v.string(),
		targetType: v.string(),
		targetId: v.string(),
		reason: v.string(),
		source: v.string(),
		priorEventId: v.optional(v.id("auditEvents")),
		createdAt: v.number(),
	})
		.index("by_organization", ["organizationId"])
		.index("by_organization_and_time", ["organizationId", "createdAt"]),
});

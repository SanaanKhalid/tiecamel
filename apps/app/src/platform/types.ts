export type RepositoryVisibility =
	| "restricted"
	| "internal"
	| "members"
	| "public";

export type RepositoryKind =
	| "governance"
	| "compliance"
	| "funding"
	| "transparency"
	| "custom";

export type IssueState = "open" | "closed";
export type IssueStatus = "todo" | "in-progress" | "in-review" | "done";

export type ChangeRequestStatus =
	| "draft"
	| "open"
	| "changes-requested"
	| "approved"
	| "merged"
	| "closed";

export type ReviewDecision = "comment" | "approve" | "request-changes";
export type CheckConclusion =
	| "queued"
	| "running"
	| "passed"
	| "warning"
	| "failed";

export type StorageProvider = "azure" | "google-drive" | "one-drive";
export type IntegrationHealth = "healthy" | "degraded" | "disconnected";
export type PublicationStatus = "queued" | "running" | "succeeded" | "failed";

export type MemberRole =
	| "organization-owner"
	| "organization-admin"
	| "repository-admin"
	| "maintainer"
	| "contributor"
	| "reviewer"
	| "verified-member";

export type Label = {
	id: string;
	name: string;
	color: string;
	description: string;
	system: boolean;
	blocksMerge?: boolean;
};

export type Member = {
	id: string;
	name: string;
	title: string;
	email: string;
	initials: string;
	role: MemberRole;
	teamIds: string[];
};

export type Team = {
	id: string;
	name: string;
	description: string;
};

export type Location = {
	id: string;
	name: string;
	shortName: string;
};

export type RepositoryRules = {
	minimumApprovals: number;
	requiredTeamIds: string[];
	dismissApprovalsOnRevision: boolean;
	prohibitSelfApproval: boolean;
	requireIssue: boolean;
	requireResolvedThreads: boolean;
	memberIssuesEnabled: boolean;
	memberCommentsEnabled: boolean;
	publicIntegrityAnchoring: boolean;
	finalizerRoles: MemberRole[];
};

export type Repository = {
	id: string;
	slug: string;
	name: string;
	description: string;
	prefix: string;
	kind: RepositoryKind;
	visibility: RepositoryVisibility;
	color: string;
	icon: string;
	rules: RepositoryRules;
	issueCount: number;
	changeCount: number;
	recordCount: number;
	updatedAt: string;
};

export type IssueComment = {
	id: string;
	authorId: string;
	body: string;
	visibility: "internal" | "public";
	createdAt: string;
	editedAt?: string;
};

export type Issue = {
	id: string;
	repositoryId: string;
	number: number;
	title: string;
	description: string;
	template: "obligation" | "incident" | "proposal" | "question" | "general";
	state: IssueState;
	status: IssueStatus;
	authorId: string;
	assigneeIds: string[];
	locationIds: string[];
	labelIds: string[];
	dueDate?: string;
	createdAt: string;
	updatedAt: string;
	commentCount: number;
	comments: IssueComment[];
	linkedChangeIds: string[];
	watcherIds: string[];
	recurrence?: string;
};

export type ChangeFile = {
	id: string;
	name: string;
	mimeType: string;
	sizeLabel: string;
	sha256: string;
	role?: "primary" | "evidence";
	objectKey?: string;
	azureBlobRef?: string;
	processingStatus: "ready" | "processing" | "failed";
};

export type ChangeRevision = {
	id: string;
	number: number;
	authorId: string;
	createdAt: string;
	message: string;
	files: ChangeFile[];
};

export type Review = {
	id: string;
	reviewerId: string;
	revisionId: string;
	decision: ReviewDecision;
	body: string;
	createdAt: string;
	stale: boolean;
};

export type CheckRun = {
	id: string;
	name: string;
	description: string;
	conclusion: CheckConclusion;
	required: boolean;
	updatedAt: string;
};

export type DiffField = {
	id: string;
	field: string;
	before?: string;
	after?: string;
	provenance: string;
	severity: "info" | "warning" | "critical";
};

export type TextDiff = {
	id: string;
	type: "added" | "removed" | "unchanged";
	content: string;
};

export type ChangeRequest = {
	id: string;
	repositoryId: string;
	number: number;
	title: string;
	summary: string;
	status: ChangeRequestStatus;
	authorId: string;
	locationIds: string[];
	labelIds: string[];
	linkedIssueId?: string;
	targetRecordId?: string;
	createdAt: string;
	updatedAt: string;
	revisions: ChangeRevision[];
	reviews: Review[];
	checks: CheckRun[];
	comments: IssueComment[];
	structuredDiff: DiffField[];
	textDiff: TextDiff[];
	unresolvedThreads: number;
	baseVersionId?: string;
	outOfDate: boolean;
	publicAfterMerge: boolean;
	publicationJobId?: string;
};

export type RecordVersion = {
	id: string;
	version: number;
	changeRequestId: string;
	createdAt: string;
	createdBy: string;
	summary: string;
	files: ChangeFile[];
	sha256: string;
	manifestSha256?: string;
	masterProvider?: StorageProvider;
	azureEvidenceRef?: string;
	publicationManifestRef?: string;
	externalFileId?: string;
	externalVersionId?: string;
	externalUrl?: string;
	publishedAt?: string;
	legacyBaseline?: boolean;
	integrity?: {
		status: "queued" | "running" | "anchored" | "failed";
		commitment: string;
		network: "devnet" | "mainnet-beta";
		signature?: string;
		explorerUrl?: string;
	};
};

export type RecordItem = {
	id: string;
	repositoryId: string;
	title: string;
	collection: string;
	locationIds: string[];
	visibility: RepositoryVisibility;
	currentVersionId: string;
	versions: RecordVersion[];
	updatedAt: string;
};

export type ActivityEvent = {
	id: string;
	repositoryId?: string;
	actorId?: string;
	action: string;
	target: string;
	detail: string;
	createdAt: string;
	visibility: "internal" | "public";
};

export type Notification = {
	id: string;
	type:
		| "assignment"
		| "mention"
		| "review"
		| "deadline"
		| "merge"
		| "integrity";
	title: string;
	body: string;
	repositoryId: string;
	targetType: "issue" | "change" | "record";
	targetId: string;
	read: boolean;
	createdAt: string;
};

export type Organization = {
	id: string;
	slug: string;
	name: string;
	shortName: string;
	description: string;
};

export type ProviderConnection = {
	id: string;
	organizationId: string;
	provider: Exclude<StorageProvider, "azure">;
	displayName: string;
	status: IntegrationHealth;
	externalDomain: string;
	serviceIdentity: string;
	keyVaultReference: string;
	capabilities: string[];
	lastVerifiedAt?: string;
	healthMessage?: string;
	simulated: boolean;
};

export type RepositoryStorageConfig = {
	id: string;
	repositoryId: string;
	provider: StorageProvider;
	connectionId?: string;
	driveId?: string;
	folderId?: string;
	displayPath: string;
	version: number;
	health: IntegrationHealth;
	updatedAt: string;
};

export type PublicationJob = {
	id: string;
	organizationId: string;
	repositoryId: string;
	changeRequestId: string;
	revisionId: string;
	storageConfigVersion: number;
	provider: StorageProvider;
	idempotencyKey: string;
	status: PublicationStatus;
	attempts: number;
	error?: string;
	remoteFileId?: string;
	remoteVersionId?: string;
	remoteUrl?: string;
	verifiedSha256?: string;
	createdAt: string;
	updatedAt: string;
};

export type BaselineImport = {
	id: string;
	repositoryId: string;
	connectionId: string;
	externalFileId: string;
	fileName: string;
	attestation: string;
	status: "pending" | "processing" | "succeeded" | "failed";
	legacyBaseline: true;
	createdAt: string;
	updatedAt: string;
};

export type PlatformData = {
	organization: Organization;
	viewerId: string;
	members: Member[];
	teams: Team[];
	locations: Location[];
	labels: Label[];
	repositories: Repository[];
	issues: Issue[];
	changeRequests: ChangeRequest[];
	records: RecordItem[];
	providerConnections: ProviderConnection[];
	repositoryStorageConfigs: RepositoryStorageConfig[];
	publicationJobs: PublicationJob[];
	baselineImports: BaselineImport[];
	activity: ActivityEvent[];
	notifications: Notification[];
};

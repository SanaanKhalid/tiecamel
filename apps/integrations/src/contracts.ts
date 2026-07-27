export type StorageProvider = "azure" | "google-drive" | "one-drive";

export type PublicationCommand = {
	commandId: string;
	publicationJobId: string;
	idempotencyKey: string;
	organizationId: string;
	repositoryId: string;
	changeRequestId: string;
	revisionId: string;
	recordId?: string;
	provider: StorageProvider;
	storageConfigVersion: number;
	objectKey: string;
	azureBlobRef: string;
	expectedSha256: string;
	fileName: string;
	mimeType: string;
	manifest: {
		format: "tiecamel-publication-manifest/v1";
		organizationId: string;
		repositoryId: string;
		changeRequestId: string;
		revisionId: string;
		rulesVersion: number;
		requestedByMembershipId: string;
		approvedAt: string;
		approvals: Array<{
			reviewerMembershipId: string;
			decision: "approve";
			revisionId: string;
			createdAt: string;
		}>;
		checks: Array<{
			name: string;
			conclusion: "passed" | "warning";
			required: boolean;
		}>;
	};
	connection?: {
		keyVaultReference: string;
		driveId: string;
		folderId: string;
		existingFileId?: string;
	};
};

export type PublishedObject = {
	provider: StorageProvider;
	azureEvidenceRef: string;
	publicationManifestRef: string;
	manifestSha256?: string;
	sha256: string;
	externalFileId?: string;
	externalVersionId?: string;
	externalUrl?: string;
	etag?: string;
};

export type ProviderInspection = {
	exists: boolean;
	fileId: string;
	versionId?: string;
	etag?: string;
	sha256?: string;
	parentIds: string[];
	webUrl?: string;
};

export interface MasterProviderAdapter {
	readonly provider: StorageProvider;
	verifyFolder(): Promise<{ displayPath: string; capabilities: string[] }>;
	publish(
		command: PublicationCommand,
		content: Uint8Array,
	): Promise<PublishedObject>;
	inspect(fileId: string): Promise<ProviderInspection>;
	restore(
		command: PublicationCommand,
		content: Uint8Array,
		fileId: string,
	): Promise<PublishedObject>;
}

export type PublicationCallback = {
	publicationJobId: string;
	idempotencyKey: string;
	succeeded: boolean;
	result?: PublishedObject;
	error?: { code: string; message: string; retryable: boolean };
	completedAt: string;
};

export type ExtractedField = {
	field: string;
	value: string;
	provenance: string;
	confidence?: number;
};

export type DiffFinding = {
	field: string;
	before?: string;
	after?: string;
	provenance: string;
	severity: "info" | "warning" | "critical";
	source: "deterministic" | "advisory-ai";
};

export type DocumentProcessingCommand = {
	jobId: string;
	uploadSessionId: string;
	idempotencyKey: string;
	organizationId: string;
	repositoryId: string;
	changeRequestId?: string;
	revisionId?: string;
	objectKey: string;
	azureBlobRef: string;
	fileName: string;
	mimeType: string;
	expectedSize: number;
	expectedSha256: string;
	baseVersionRef?: string;
	baseFields?: ExtractedField[];
};

export type DocumentProcessingResult = {
	sha256: string;
	detectedMimeType: string;
	malwareScan: "clean";
	extracted: ExtractedField[];
	findings: DiffFinding[];
	textDiff: Array<{
		type: "added" | "removed" | "unchanged";
		content: string;
	}>;
	visualManifestKey?: string;
	processorVersion: string;
};

export type DocumentProcessingCallback = {
	uploadSessionId: string;
	idempotencyKey: string;
	succeeded: boolean;
	result?: DocumentProcessingResult;
	error?: { code: string; message: string; retryable: boolean };
	completedAt: string;
};

export type IntegrityAnchorCommand = {
	commandId: string;
	integrityAnchorId: string;
	idempotencyKey: string;
	network: "devnet" | "mainnet-beta";
	commitment: string;
	manifestSha256: string;
	memo: string;
};

export type IntegrityAnchorCallback = {
	integrityAnchorId: string;
	idempotencyKey: string;
	succeeded: boolean;
	result?: {
		signature: string;
		slot: number;
		explorerUrl: string;
	};
	error?: { code: string; message: string; retryable: boolean };
	completedAt: string;
};

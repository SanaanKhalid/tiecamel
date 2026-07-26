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
	publish(command: PublicationCommand, content: Uint8Array): Promise<PublishedObject>;
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

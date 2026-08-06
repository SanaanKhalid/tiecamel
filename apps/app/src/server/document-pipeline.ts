export type DocumentJobMessage = {
	jobId: string;
	uploadSessionId: string;
	organizationId: string;
	repositoryId: string;
	objectKey: string;
	azureBlobRef: string;
	fileName: string;
	mimeType: string;
	expectedSize: number;
	expectedSha256: string;
	baseVersionKey?: string;
};

export type ExtractedValue = {
	field: string;
	value: string;
	provenance: string;
	confidence?: number;
};

export type DocumentFinding = {
	field: string;
	before?: string;
	after?: string;
	provenance: string;
	severity: "info" | "warning" | "critical";
	source: "deterministic" | "advisory-ai";
};

export type DocumentProcessingResult = {
	jobId: string;
	sha256: string;
	detectedMimeType: string;
	malwareScan: "clean";
	extracted: ExtractedValue[];
	findings: DocumentFinding[];
	textDiff: Array<{
		type: "added" | "removed" | "unchanged";
		content: string;
	}>;
	visualManifestKey?: string;
	processorVersion: string;
	completedAt: string;
};

export function validateDocumentJob(job: DocumentJobMessage) {
	if (!job.objectKey.startsWith("quarantine/")) {
		throw new Error("Document jobs must start from the quarantine prefix");
	}
	if (!job.azureBlobRef.startsWith("azure://quarantine/")) {
		throw new Error("Document jobs require a managed quarantine reference");
	}
	if (!/^[a-f0-9]{64}$/i.test(job.expectedSha256)) {
		throw new Error("Document job requires a SHA-256 checksum");
	}
	if (job.expectedSize <= 0 || job.expectedSize > 50 * 1024 * 1024) {
		throw new Error("Document size is outside the supported range");
	}
	return job;
}

import { describe, expect, it } from "vitest";
import { AzureMasterAdapter } from "./azure-master.js";
import type { PublicationCommand } from "./contracts.js";

const command: PublicationCommand = {
	commandId: "command-1",
	publicationJobId: "job-1",
	idempotencyKey: "change-1:revision-1:1",
	organizationId: "org-1",
	repositoryId: "repo-1",
	changeRequestId: "change-1",
	revisionId: "revision-1",
	provider: "azure",
	storageConfigVersion: 1,
	objectKey: "quarantine/org-1/repo-1/upload/document.pdf",
	azureBlobRef: "azure://quarantine/org-1/repo-1/upload/document.pdf",
	expectedSha256: "a".repeat(64),
	fileName: "document.pdf",
	mimeType: "application/pdf",
};

describe("AzureMasterAdapter", () => {
	it("returns immutable provider-neutral evidence references", async () => {
		const result = await new AzureMasterAdapter().publish(
			command,
			new Uint8Array(),
		);
		expect(result.provider).toBe("azure");
		expect(result.azureEvidenceRef).toContain(
			"org-1/repo-1/change-1/revision-1",
		);
		expect(result.sha256).toBe(command.expectedSha256);
	});
});

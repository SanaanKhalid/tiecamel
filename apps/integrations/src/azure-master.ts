import type {
	MasterProviderAdapter,
	ProviderInspection,
	PublicationCommand,
	PublishedObject,
} from "./contracts.js";

export class AzureMasterAdapter implements MasterProviderAdapter {
	readonly provider = "azure" as const;

	async verifyFolder() {
		return {
			displayPath: "TieCamel managed records",
			capabilities: ["immutable-evidence", "stable-record-url"],
		};
	}

	async publish(
		command: PublicationCommand,
		_content: Uint8Array,
	): Promise<PublishedObject> {
		return {
			provider: "azure",
			azureEvidenceRef: evidenceReference(command),
			publicationManifestRef: `${evidenceReference(command)}/publication-manifest.json`,
			sha256: command.expectedSha256,
		};
	}

	async inspect(fileId: string): Promise<ProviderInspection> {
		return { exists: true, fileId, parentIds: [] };
	}

	restore(command: PublicationCommand, content: Uint8Array) {
		return this.publish(command, content);
	}
}

export function evidenceReference(command: PublicationCommand) {
	return `azure://evidence/${command.organizationId}/${command.repositoryId}/${command.changeRequestId}/${command.revisionId}`;
}

import { ClientSecretCredential } from "@azure/identity";
import type {
	MasterProviderAdapter,
	ProviderInspection,
	PublicationCommand,
	PublishedObject,
} from "./contracts.js";

type EntraCredentials = {
	tenantId: string;
	clientId: string;
	clientSecret: string;
};

export class OneDriveBusinessAdapter implements MasterProviderAdapter {
	readonly provider = "one-drive" as const;
	private readonly credential: ClientSecretCredential;

	constructor(
		credentials: EntraCredentials,
		private readonly driveId: string,
		private readonly folderId: string,
	) {
		this.credential = new ClientSecretCredential(
			credentials.tenantId,
			credentials.clientId,
			credentials.clientSecret,
		);
	}

	async verifyFolder() {
		const folder = await this.graph<{
			name: string;
			folder?: object;
			parentReference?: { driveId?: string };
		}>(
			`/drives/${encodeURIComponent(this.driveId)}/items/${encodeURIComponent(this.folderId)}`,
		);
		if (!folder.folder || folder.parentReference?.driveId !== this.driveId) {
			throw new Error(
				"Configured destination is not a folder in the approved OneDrive for Business drive.",
			);
		}
		return {
			displayPath: folder.name,
			capabilities: [
				"business-drive",
				"stable-file-updates",
				"baseline-import",
				"delta-notifications",
			],
		};
	}

	async publish(
		command: PublicationCommand,
		content: Uint8Array,
	): Promise<PublishedObject> {
		const existingFileId = command.connection?.existingFileId;
		const path = existingFileId
			? `/drives/${encodeURIComponent(this.driveId)}/items/${encodeURIComponent(existingFileId)}/content`
			: `/drives/${encodeURIComponent(this.driveId)}/items/${encodeURIComponent(this.folderId)}:/${encodeURIComponent(command.fileName)}:/content`;
		const file = await this.graph<{
			id: string;
			eTag?: string;
			webUrl?: string;
			cTag?: string;
		}>(path, {
			method: "PUT",
			headers: { "Content-Type": command.mimeType },
			body: Buffer.from(content),
		});
		return {
			provider: "one-drive",
			azureEvidenceRef: "",
			publicationManifestRef: "",
			sha256: command.expectedSha256,
			externalFileId: file.id,
			externalVersionId: file.cTag ?? file.eTag,
			externalUrl: file.webUrl,
			etag: file.eTag,
		};
	}

	async inspect(fileId: string): Promise<ProviderInspection> {
		try {
			const file = await this.graph<{
				id: string;
				eTag?: string;
				cTag?: string;
				webUrl?: string;
				parentReference?: { id?: string };
			}>(
				`/drives/${encodeURIComponent(this.driveId)}/items/${encodeURIComponent(fileId)}`,
			);
			return {
				exists: true,
				fileId: file.id,
				versionId: file.cTag ?? file.eTag,
				etag: file.eTag,
				parentIds: file.parentReference?.id
					? [file.parentReference.id]
					: [],
				webUrl: file.webUrl,
			};
		} catch (error) {
			if (error instanceof GraphError && error.status === 404) {
				return { exists: false, fileId, parentIds: [] };
			}
			throw error;
		}
	}

	restore(
		command: PublicationCommand,
		content: Uint8Array,
		fileId: string,
	) {
		return this.publish(
			{
				...command,
				connection: command.connection
					? { ...command.connection, existingFileId: fileId }
					: undefined,
			},
			content,
		);
	}

	private async graph<T>(path: string, init?: RequestInit): Promise<T> {
		const token = await this.credential.getToken(
			"https://graph.microsoft.com/.default",
		);
		const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${token.token}`,
				...init?.headers,
			},
		});
		if (!response.ok) {
			throw new GraphError(response.status, await response.text());
		}
		return response.json() as Promise<T>;
	}
}

class GraphError extends Error {
	constructor(
		readonly status: number,
		body: string,
	) {
		super(`Microsoft Graph returned ${status}: ${body.slice(0, 500)}`);
	}
}

import { JWT } from "google-auth-library";
import type {
	MasterProviderAdapter,
	ProviderInspection,
	PublicationCommand,
	PublishedObject,
} from "./contracts.js";

type GoogleCredentials = {
	client_email: string;
	private_key: string;
};

export class GoogleDriveAdapter implements MasterProviderAdapter {
	readonly provider = "google-drive" as const;
	private readonly auth: JWT;

	constructor(
		credentials: GoogleCredentials,
		private readonly driveId: string,
		private readonly folderId: string,
	) {
		this.auth = new JWT({
			email: credentials.client_email,
			key: credentials.private_key,
			scopes: ["https://www.googleapis.com/auth/drive"],
		});
	}

	async verifyFolder() {
		const token = await this.accessToken();
		const response = await fetch(
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(this.folderId)}?supportsAllDrives=true&fields=id,name,driveId,capabilities(canAddChildren)`,
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		if (!response.ok) throw await driveError(response, "verify folder");
		const folder = (await response.json()) as {
			name: string;
			driveId?: string;
			capabilities?: { canAddChildren?: boolean };
		};
		if (folder.driveId !== this.driveId || !folder.capabilities?.canAddChildren) {
			throw new Error(
				"Configured folder is not writable in the approved Shared Drive.",
			);
		}
		return {
			displayPath: folder.name,
			capabilities: [
				"shared-drive",
				"stable-file-updates",
				"baseline-import",
				"change-notifications",
			],
		};
	}

	async publish(command: PublicationCommand, content: Uint8Array) {
		if (command.connection?.existingFileId) {
			return this.update(command, content, command.connection.existingFileId);
		}
		const alreadyPublished = await this.findByPublicationId(
			command.idempotencyKey,
		);
		if (alreadyPublished) {
			return {
				provider: "google-drive" as const,
				azureEvidenceRef: "",
				publicationManifestRef: "",
				sha256: command.expectedSha256,
				externalFileId: alreadyPublished.id,
				externalVersionId: alreadyPublished.version,
				externalUrl: alreadyPublished.webViewLink,
				etag: alreadyPublished.etag,
			};
		}
		const metadata = {
			name: command.fileName,
			parents: [this.folderId],
			appProperties: tieCamelProperties(command),
		};
		return this.multipartUpload(command, content, metadata);
	}

	async inspect(fileId: string): Promise<ProviderInspection> {
		const token = await this.accessToken();
		const response = await fetch(
			`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,version,etag,md5Checksum,parents,webViewLink,trashed`,
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		if (response.status === 404) {
			return { exists: false, fileId, parentIds: [] };
		}
		if (!response.ok) throw await driveError(response, "inspect file");
		const file = (await response.json()) as {
			id: string;
			version?: string;
			etag?: string;
			parents?: string[];
			webViewLink?: string;
			trashed?: boolean;
		};
		return {
			exists: !file.trashed,
			fileId: file.id,
			versionId: file.version,
			etag: file.etag,
			parentIds: file.parents ?? [],
			webUrl: file.webViewLink,
		};
	}

	restore(
		command: PublicationCommand,
		content: Uint8Array,
		fileId: string,
	) {
		return this.update(command, content, fileId);
	}

	private async update(
		command: PublicationCommand,
		content: Uint8Array,
		fileId: string,
	) {
		return this.multipartUpload(
			command,
			content,
			{ appProperties: tieCamelProperties(command) },
			fileId,
		);
	}

	private async findByPublicationId(publicationId: string) {
		const token = await this.accessToken();
		const escaped = publicationId.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
		const query = encodeURIComponent(
			`appProperties has { key='tiecamelPublicationId' and value='${escaped}' } and trashed=false`,
		);
		const response = await fetch(
			`https://www.googleapis.com/drive/v3/files?q=${query}&corpora=drive&driveId=${encodeURIComponent(this.driveId)}&includeItemsFromAllDrives=true&supportsAllDrives=true&pageSize=2&fields=files(id,version,webViewLink)`,
			{ headers: { Authorization: `Bearer ${token}` } },
		);
		if (!response.ok) {
			throw await driveError(response, "reconcile publication");
		}
		const result = (await response.json()) as {
			files: Array<{
				id: string;
				version?: string;
				webViewLink?: string;
			}>;
		};
		const file = result.files[0];
		return file
			? {
					...file,
					etag: response.headers.get("etag") ?? undefined,
				}
			: undefined;
	}

	private async multipartUpload(
		command: PublicationCommand,
		content: Uint8Array,
		metadata: object,
		fileId?: string,
	): Promise<PublishedObject> {
		const token = await this.accessToken();
		const boundary = `tiecamel-${crypto.randomUUID()}`;
		const prefix = new TextEncoder().encode(
			`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${command.mimeType}\r\n\r\n`,
		);
		const suffix = new TextEncoder().encode(`\r\n--${boundary}--`);
		const body = new Uint8Array(prefix.length + content.length + suffix.length);
		body.set(prefix);
		body.set(content, prefix.length);
		body.set(suffix, prefix.length + content.length);
		const endpoint = fileId
			? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=multipart&supportsAllDrives=true&fields=id,version,webViewLink`
			: "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,version,webViewLink";
		const response = await fetch(endpoint, {
			method: fileId ? "PATCH" : "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": `multipart/related; boundary=${boundary}`,
			},
			body,
		});
		if (!response.ok) throw await driveError(response, "publish document");
		const file = (await response.json()) as {
			id: string;
			version?: string;
			webViewLink?: string;
		};
		return {
			provider: "google-drive",
			azureEvidenceRef: "",
			publicationManifestRef: "",
			sha256: command.expectedSha256,
			externalFileId: file.id,
			externalVersionId: file.version,
			externalUrl: file.webViewLink,
			etag: response.headers.get("etag") ?? undefined,
		};
	}

	private async accessToken() {
		const credentials = await this.auth.getAccessToken();
		if (!credentials.token) throw new Error("Google access token unavailable");
		return credentials.token;
	}
}

function tieCamelProperties(command: PublicationCommand) {
	return {
		tiecamelPublicationId: command.idempotencyKey,
		tiecamelRecordId: command.recordId ?? "new",
		tiecamelRevisionId: command.revisionId,
	};
}

async function driveError(response: Response, action: string) {
	const body = await response.text();
	return new Error(
		`Google Drive could not ${action} (${response.status}): ${body.slice(0, 500)}`,
	);
}

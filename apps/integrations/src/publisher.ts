import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import { createHash } from "node:crypto";
import { AzureMasterAdapter, evidenceReference } from "./azure-master.js";
import type {
	MasterProviderAdapter,
	PublicationCallback,
	PublicationCommand,
} from "./contracts.js";
import { GoogleDriveAdapter } from "./google-drive.js";
import { OneDriveBusinessAdapter } from "./one-drive.js";
import { canonicalJson, sha256Text } from "./canonical-json.js";
import { sendSignedCallback } from "./callbacks.js";

export async function processPublication(command: PublicationCommand) {
	const content = await downloadSource(command);
	const actualSha256 = await sha256(content);
	if (actualSha256 !== command.expectedSha256.toLowerCase()) {
		throw new Error(
			"Approved source checksum does not match Azure Blob content.",
		);
	}
	const evidenceRef = await sealEvidence(command, content);
	const adapter = await adapterFor(command);
	const result = await adapter.publish(command, content);
	const manifest = canonicalJson({
		...command.manifest,
		content: {
			fileName: command.fileName,
			mimeType: command.mimeType,
			sha256: actualSha256,
		},
		destination: {
			provider: command.provider,
			storageConfigVersion: command.storageConfigVersion,
			externalFileId: result.externalFileId,
			externalVersionId: result.externalVersionId,
		},
		publication: {
			idempotencyKey: command.idempotencyKey,
			publicationJobId: command.publicationJobId,
		},
	});
	const manifestSha256 = sha256Text(manifest);
	const publicationManifestRef = await sealManifest(
		evidenceRef,
		manifest,
		manifestSha256,
		command.idempotencyKey,
	);
	return {
		...result,
		azureEvidenceRef: evidenceRef,
		exactBlobRef: `${evidenceRef}/${command.fileName}`,
		publicationManifestRef,
		manifestSha256,
		sha256: actualSha256,
	};
}

export async function sendCallback(callback: PublicationCallback) {
	await sendSignedCallback("CONVEX_PUBLICATION_CALLBACK_URL", callback);
}

async function adapterFor(
	command: PublicationCommand,
): Promise<MasterProviderAdapter> {
	if (command.provider === "azure") return new AzureMasterAdapter();
	if (!command.connection) {
		throw new Error(
			"External publication requires a fixed connection and folder.",
		);
	}
	const keyVaultUrl = requiredEnv("AZURE_KEY_VAULT_URL");
	const vault = new SecretClient(keyVaultUrl, new DefaultAzureCredential());
	const secretName = command.connection.keyVaultReference.replace(
		/^kv:\/\//,
		"",
	);
	const secret = await vault.getSecret(secretName);
	if (!secret.value)
		throw new Error("Google credential was not found in Key Vault.");
	const credentials = JSON.parse(secret.value) as Record<string, string>;
	if (command.provider === "one-drive") {
		if (process.env.ENABLE_ONEDRIVE !== "true") {
			throw new Error("OneDrive for Business adapter is not enabled.");
		}
		return new OneDriveBusinessAdapter(
			{
				tenantId: credentials.tenantId,
				clientId: credentials.clientId,
				clientSecret: credentials.clientSecret,
			},
			command.connection.driveId,
			command.connection.folderId,
		);
	}
	return new GoogleDriveAdapter(
		{
			client_email: credentials.client_email,
			private_key: credentials.private_key,
		},
		command.connection.driveId,
		command.connection.folderId,
	);
}

async function downloadSource(command: PublicationCommand) {
	const service = new BlobServiceClient(
		requiredEnv("AZURE_STORAGE_BLOB_URL"),
		new DefaultAzureCredential(),
	);
	const [container, ...path] = command.objectKey.split("/");
	const response = await service
		.getContainerClient(container)
		.getBlockBlobClient(path.join("/"))
		.download();
	if (!response.readableStreamBody) throw new Error("Azure Blob was empty.");
	const chunks: Buffer[] = [];
	for await (const chunk of response.readableStreamBody) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return new Uint8Array(Buffer.concat(chunks));
}

async function sealEvidence(command: PublicationCommand, content: Uint8Array) {
	const service = new BlobServiceClient(
		requiredEnv("AZURE_STORAGE_BLOB_URL"),
		new DefaultAzureCredential(),
	);
	const ref = evidenceReference(command);
	const path = ref.replace("azure://evidence/", "");
	const blob = service
		.getContainerClient("evidence")
		.getBlockBlobClient(`${path}/${command.fileName}`);
	try {
		await blob.uploadData(content, {
			conditions: { ifNoneMatch: "*" },
			metadata: {
				sha256: command.expectedSha256,
				publicationid: command.idempotencyKey,
			},
		});
	} catch (error) {
		if (
			typeof error !== "object" ||
			error === null ||
			!("statusCode" in error) ||
			error.statusCode !== 412
		) {
			throw error;
		}
		const existing = await blob.getProperties();
		if (existing.metadata?.sha256 !== command.expectedSha256) {
			throw new Error(
				"An immutable evidence object already exists with a different checksum.",
			);
		}
	}
	return ref;
}

async function sealManifest(
	evidenceRef: string,
	manifest: string,
	manifestSha256: string,
	publicationId: string,
) {
	const service = new BlobServiceClient(
		requiredEnv("AZURE_STORAGE_BLOB_URL"),
		new DefaultAzureCredential(),
	);
	const path = evidenceRef.replace("azure://evidence/", "");
	const blob = service
		.getContainerClient("evidence")
		.getBlockBlobClient(`${path}/publication-manifest.json`);
	try {
		await blob.upload(manifest, Buffer.byteLength(manifest), {
			blobHTTPHeaders: { blobContentType: "application/json" },
			conditions: { ifNoneMatch: "*" },
			metadata: {
				sha256: manifestSha256,
				publicationid: publicationId,
			},
		});
	} catch (error) {
		if (
			typeof error !== "object" ||
			error === null ||
			!("statusCode" in error) ||
			error.statusCode !== 412
		) {
			throw error;
		}
		const existing = await blob.getProperties();
		if (existing.metadata?.sha256 !== manifestSha256) {
			throw new Error(
				"An immutable publication manifest already exists with different contents.",
			);
		}
	}
	return `${evidenceRef}/publication-manifest.json`;
}

async function sha256(content: Uint8Array) {
	return createHash("sha256").update(content).digest("hex");
}

function requiredEnv(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

import {
	app,
	type HttpRequest,
	type HttpResponseInit,
	type InvocationContext,
} from "@azure/functions";
import {
	BlobSASPermissions,
	BlobServiceClient,
	generateBlobSASQueryParameters,
	SASProtocol,
} from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";
import { ServiceBusClient } from "@azure/service-bus";
import type {
	DocumentProcessingCommand,
	IntegrityAnchorCallback,
	IntegrityAnchorCommand,
	PublicationCallback,
	PublicationCommand,
} from "./contracts.js";
import { sendSignedCallback } from "./callbacks.js";
import { anchorIntegrity } from "./solana-anchor.js";
import { processPublication, sendCallback } from "./publisher.js";
import { verifyServiceToken } from "./security.js";

app.http("authorizeUpload", {
	methods: ["POST"],
	authLevel: "anonymous",
	route: "uploads",
	handler: async (request) => {
		if (!authorized(request)) return unauthorized();
		const body = (await request.json()) as {
			objectKey: string;
			mimeType: string;
		};
		if (!body.objectKey?.startsWith("quarantine/")) {
			return { status: 400, jsonBody: { error: "Invalid quarantine key" } };
		}
		const service = blobService();
		const now = new Date();
		const expires = new Date(now.getTime() + 15 * 60 * 1000);
		const [container, ...path] = body.objectKey.split("/");
		const delegation = await service.getUserDelegationKey(
			new Date(now.getTime() - 60_000),
			expires,
		);
		const sas = generateBlobSASQueryParameters(
			{
				containerName: container,
				blobName: path.join("/"),
				permissions: BlobSASPermissions.parse("cw"),
				startsOn: now,
				expiresOn: expires,
				contentType: body.mimeType,
				protocol: SASProtocol.Https,
			},
			delegation,
			service.accountName,
		).toString();
		return {
			status: 200,
			jsonBody: {
				url: `${service.url.replace(/\/$/, "")}/${container}/${path.join("/")}?${sas}`,
				method: "PUT",
				headers: {
					"x-ms-blob-type": "BlockBlob",
					"Content-Type": body.mimeType,
				},
				expiresAt: expires.toISOString(),
			},
		};
	},
});

app.http("authorizeDocumentRead", {
	methods: ["POST"],
	authLevel: "anonymous",
	route: "documents/read",
	handler: async (request) => {
		if (!authorized(request)) return unauthorized();
		const body = (await request.json()) as { objectRef?: string };
		const match = /^azure:\/\/(quarantine|processed|evidence)\/(.+)$/.exec(
			body.objectRef ?? "",
		);
		if (!match || match[2].includes("..")) {
			return { status: 400, jsonBody: { error: "Invalid document reference" } };
		}
		const [, container, blobName] = match;
		const service = blobService();
		const blob = service.getContainerClient(container).getBlobClient(blobName);
		if (!(await blob.exists())) {
			return { status: 404, jsonBody: { error: "Document not found" } };
		}
		const now = new Date();
		const expires = new Date(now.getTime() + 10 * 60 * 1000);
		const delegation = await service.getUserDelegationKey(
			new Date(now.getTime() - 60_000),
			expires,
		);
		const sas = generateBlobSASQueryParameters(
			{
				containerName: container,
				blobName,
				permissions: BlobSASPermissions.parse("r"),
				startsOn: now,
				expiresOn: expires,
				protocol: SASProtocol.Https,
			},
			delegation,
			service.accountName,
		).toString();
		return {
			status: 200,
			jsonBody: {
				url: `${service.url.replace(/\/$/, "")}/${container}/${blobName}?${sas}`,
				expiresAt: expires.toISOString(),
			},
		};
	},
});

app.http("enqueuePublication", {
	methods: ["POST"],
	authLevel: "anonymous",
	route: "publications",
	handler: async (request) => {
		if (!authorized(request)) return unauthorized();
		const command = (await request.json()) as PublicationCommand;
		if (!command.idempotencyKey || !command.publicationJobId) {
			return {
				status: 400,
				jsonBody: { error: "Invalid publication command" },
			};
		}
		const client = new ServiceBusClient(
			requiredEnv("AZURE_SERVICE_BUS_NAMESPACE"),
			new DefaultAzureCredential(),
		);
		const sender = client.createSender("publications");
		try {
			await sender.sendMessages({
				messageId: command.idempotencyKey,
				correlationId: command.publicationJobId,
				subject: command.provider,
				body: command,
			});
		} finally {
			await sender.close();
			await client.close();
		}
		return {
			status: 202,
			jsonBody: { commandId: command.commandId, duplicate: false },
		};
	},
});

app.http("enqueueProcessing", {
	methods: ["POST"],
	authLevel: "anonymous",
	route: "processing",
	handler: async (request) => {
		if (!authorized(request)) return unauthorized();
		const command = (await request.json()) as DocumentProcessingCommand;
		if (!command.idempotencyKey || !command.jobId || !command.uploadSessionId) {
			return { status: 400, jsonBody: { error: "Invalid processing command" } };
		}
		await enqueue("processing", command.idempotencyKey, command.jobId, command);
		return {
			status: 202,
			jsonBody: { commandId: command.jobId, duplicate: false },
		};
	},
});

app.http("enqueueIntegrityAnchor", {
	methods: ["POST"],
	authLevel: "anonymous",
	route: "anchors",
	handler: async (request) => {
		if (!authorized(request)) return unauthorized();
		const command = (await request.json()) as IntegrityAnchorCommand;
		if (
			!command.idempotencyKey ||
			!command.integrityAnchorId ||
			!command.commitment
		) {
			return { status: 400, jsonBody: { error: "Invalid anchor command" } };
		}
		await enqueue(
			"anchors",
			command.idempotencyKey,
			command.integrityAnchorId,
			command,
		);
		return {
			status: 202,
			jsonBody: { commandId: command.commandId, duplicate: false },
		};
	},
});

app.serviceBusQueue("processPublication", {
	connection: "AZURE_SERVICE_BUS_CONNECTION",
	queueName: "publications",
	handler: async (command: PublicationCommand, context: InvocationContext) => {
		let callback: PublicationCallback;
		try {
			const result = await processPublication(command);
			callback = {
				publicationJobId: command.publicationJobId,
				idempotencyKey: command.idempotencyKey,
				succeeded: true,
				result,
				completedAt: new Date().toISOString(),
			};
		} catch (error) {
			context.error(error);
			callback = {
				publicationJobId: command.publicationJobId,
				idempotencyKey: command.idempotencyKey,
				succeeded: false,
				error: {
					code: "PUBLICATION_FAILED",
					message:
						error instanceof Error ? error.message : "Publication failed",
					retryable: true,
				},
				completedAt: new Date().toISOString(),
			};
		}
		await sendCallback(callback);
	},
});

app.serviceBusQueue("anchorIntegrity", {
	connection: "AZURE_SERVICE_BUS_CONNECTION",
	queueName: "anchors",
	handler: async (
		command: IntegrityAnchorCommand,
		context: InvocationContext,
	) => {
		let callback: IntegrityAnchorCallback;
		try {
			const result = await anchorIntegrity(command);
			callback = {
				integrityAnchorId: command.integrityAnchorId,
				idempotencyKey: command.idempotencyKey,
				succeeded: true,
				result,
				completedAt: new Date().toISOString(),
			};
		} catch (error) {
			context.error(error);
			callback = {
				integrityAnchorId: command.integrityAnchorId,
				idempotencyKey: command.idempotencyKey,
				succeeded: false,
				error: {
					code: "ANCHOR_FAILED",
					message:
						error instanceof Error ? error.message : "Solana anchoring failed",
					retryable: true,
				},
				completedAt: new Date().toISOString(),
			};
		}
		await sendSignedCallback("CONVEX_INTEGRITY_CALLBACK_URL", callback);
	},
});

app.http("health", {
	methods: ["GET"],
	authLevel: "anonymous",
	route: "health",
	handler: async () => ({
		status: 200,
		jsonBody: { status: "ok", service: "tiecamel-integrations" },
	}),
});

function authorized(request: HttpRequest) {
	return verifyServiceToken(
		request.headers.get("authorization"),
		requiredEnv("TIECAMEL_SERVICE_TOKEN"),
	);
}

function unauthorized(): HttpResponseInit {
	return { status: 401, jsonBody: { error: "Unauthorized" } };
}

function blobService() {
	return new BlobServiceClient(
		requiredEnv("AZURE_STORAGE_BLOB_URL"),
		new DefaultAzureCredential(),
	);
}

function requiredEnv(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

async function enqueue(
	queue: string,
	messageId: string,
	correlationId: string,
	body: unknown,
) {
	const client = new ServiceBusClient(
		requiredEnv("AZURE_SERVICE_BUS_NAMESPACE"),
		new DefaultAzureCredential(),
	);
	const sender = client.createSender(queue);
	try {
		await sender.sendMessages({
			messageId,
			correlationId,
			body,
		});
	} finally {
		await sender.close();
		await client.close();
	}
}

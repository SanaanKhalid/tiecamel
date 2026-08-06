export type AzureIntegrationConfig = {
	baseUrl: string;
	serviceToken: string;
};

export type AzureUploadRequest = {
	uploadSessionId: string;
	organizationId: string;
	repositoryId: string;
	objectKey: string;
	azureBlobRef: string;
	fileName: string;
	mimeType: string;
	size: number;
};

export type AzureUploadAuthorization = {
	url: string;
	method: "PUT";
	headers: Record<string, string>;
	expiresAt: string;
};

/**
 * Calls the Azure Function command boundary. Azure credentials and provider
 * secrets stay behind managed identity and Key Vault; the browser receives
 * only a short-lived, single-blob SAS URL.
 */
export async function requestAzureUploadUrl(
	config: AzureIntegrationConfig,
	request: AzureUploadRequest,
): Promise<AzureUploadAuthorization> {
	const response = await fetch(
		`${stripTrailingSlash(config.baseUrl)}/uploads`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.serviceToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(request),
		},
	);
	if (!response.ok) {
		throw new Error(await actionableAzureError(response, "authorize upload"));
	}
	return response.json() as Promise<AzureUploadAuthorization>;
}

export async function enqueuePublication(
	config: AzureIntegrationConfig,
	command: unknown,
) {
	const response = await fetch(
		`${stripTrailingSlash(config.baseUrl)}/publications`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.serviceToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(command),
		},
	);
	if (!response.ok) {
		throw new Error(await actionableAzureError(response, "queue publication"));
	}
	return response.json() as Promise<{ commandId: string; duplicate: boolean }>;
}

function stripTrailingSlash(value: string) {
	return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function actionableAzureError(response: Response, action: string) {
	const requestId = response.headers.get("x-ms-request-id");
	return `The document service could not ${action} (${response.status})${requestId ? ` · request ${requestId}` : ""}`;
}

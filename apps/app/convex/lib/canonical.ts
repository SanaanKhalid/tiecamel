/** Canonical JSON used for repository objects and public verification. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortValue(value));
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
	const bytes =
		typeof value === "string" ? new TextEncoder().encode(value) : value;
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new Uint8Array(bytes).buffer,
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function sortValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortValue);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, child]) => child !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, sortValue(child)]),
		);
	}
	return value;
}

export type RepositoryTreeEntry = {
	recordId: string;
	recordVersionId: string;
	contentSha256: string;
};

export function repositoryTreeManifest(
	repositoryId: string,
	entries: RepositoryTreeEntry[],
) {
	return canonicalJson({
		format: "tiecamel-repository-tree/v1",
		repositoryId,
		records: [...entries].sort((left, right) =>
			left.recordId.localeCompare(right.recordId),
		),
	});
}

export function repositoryCommitManifest(input: {
	repositoryId: string;
	sequence: number;
	parentCommitSha256?: string;
	treeSha256: string;
	changeRequestId: string;
	recordVersionId: string;
	publicationManifestSha256: string;
	createdBy: string;
	createdAt: number;
}) {
	return canonicalJson({
		format: "tiecamel-repository-commit/v2",
		...input,
	});
}

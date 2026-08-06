import { describe, expect, it } from "vitest";
import {
	canonicalJson,
	repositoryCommitManifest,
	repositoryTreeManifest,
	sha256Hex,
} from "../../convex/lib/canonical";

describe("canonical repository objects", () => {
	it("hashes a repository tree independently of record input order", async () => {
		const left = repositoryTreeManifest("repo-1", [
			{
				recordId: "record-b",
				recordVersionId: "version-2",
				contentSha256: "b".repeat(64),
			},
			{
				recordId: "record-a",
				recordVersionId: "version-1",
				contentSha256: "a".repeat(64),
			},
		]);
		const right = repositoryTreeManifest("repo-1", [
			{
				recordId: "record-a",
				recordVersionId: "version-1",
				contentSha256: "a".repeat(64),
			},
			{
				recordId: "record-b",
				recordVersionId: "version-2",
				contentSha256: "b".repeat(64),
			},
		]);
		expect(left).toBe(right);
		expect(await sha256Hex(left)).toBe(await sha256Hex(right));
	});

	it("binds each commit hash to its parent and tree", async () => {
		const base = {
			repositoryId: "repo-1",
			sequence: 2,
			parentCommitSha256: "1".repeat(64),
			treeSha256: "2".repeat(64),
			changeRequestId: "change-2",
			recordVersionId: "version-2",
			publicationManifestSha256: "3".repeat(64),
			createdBy: "member-1",
			createdAt: 1_785_698_400_000,
		};
		const commit = repositoryCommitManifest(base);
		const changedParent = repositoryCommitManifest({
			...base,
			parentCommitSha256: "4".repeat(64),
		});
		expect(await sha256Hex(commit)).not.toBe(await sha256Hex(changedParent));
		expect(JSON.parse(commit).format).toBe("tiecamel-repository-commit/v2");
	});

	it("sorts object keys and omits undefined fields", () => {
		expect(canonicalJson({ z: 1, a: { y: undefined, b: 2 } })).toBe(
			'{"a":{"b":2},"z":1}',
		);
	});
});

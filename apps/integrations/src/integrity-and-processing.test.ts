import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Text } from "./canonical-json.js";
import {
	compareTaxNoticeFields,
	extractTaxNoticeFields,
} from "./document-processor.js";
import { integrityMemo } from "./solana-anchor.js";

describe("publication integrity", () => {
	it("produces stable manifest hashes regardless of object key order", () => {
		const left = canonicalJson({
			format: "tiecamel-publication-manifest/v1",
			content: { sha256: "b".repeat(64), fileName: "notice.pdf" },
		});
		const right = canonicalJson({
			content: { fileName: "notice.pdf", sha256: "b".repeat(64) },
			format: "tiecamel-publication-manifest/v1",
		});
		expect(left).toBe(right);
		expect(sha256Text(left)).toMatch(/^[a-f0-9]{64}$/);
	});

	it("places only the manifest commitment in the Solana memo", () => {
		const commitment = "a".repeat(64);
		expect(integrityMemo(commitment)).toBe(`tiecamel:v1:${commitment}`);
		expect(() => integrityMemo("not-a-hash")).toThrow(/SHA-256/);
	});
});

describe("tax notice processing", () => {
	it("extracts authoritative fields and warns about a shortened deadline", () => {
		const fields = extractTaxNoticeFields(`
Notice Date: July 1, 2026
Parcel Number: 07-12-345-678
Balance Due: $12,450.00
Penalties: $450.00
Exemption Status: Removed
Respond by August 10, 2026
`);
		expect(fields).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					field: "parcel-or-account-number",
					value: "07-12-345-678",
				}),
				expect.objectContaining({ field: "balance", value: "12450.00" }),
				expect.objectContaining({
					field: "response-deadline",
					value: "2026-08-10",
				}),
			]),
		);
		const findings = compareTaxNoticeFields(
			[
				{
					field: "response-deadline",
					value: "2026-09-30",
					provenance: "Accepted version",
				},
			],
			fields,
			Date.parse("2026-07-26T00:00:00Z"),
		);
		expect(findings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					field: "response-deadline",
					severity: "critical",
				}),
				expect.objectContaining({
					field: "deadline-risk",
					severity: "warning",
				}),
			]),
		);
	});
});

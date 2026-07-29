import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { createHash } from "node:crypto";
import type {
	DiffFinding,
	DocumentProcessingCommand,
	DocumentProcessingResult,
	ExtractedField,
} from "./contracts.js";

const PROCESSOR_VERSION = "tiecamel-document-processor/1";

export async function processDocument(
	command: DocumentProcessingCommand,
): Promise<DocumentProcessingResult> {
	const content = await downloadSource(command.objectKey);
	if (content.byteLength !== command.expectedSize) {
		throw new Error(
			`Uploaded size ${content.byteLength} does not match the authorized size ${command.expectedSize}.`,
		);
	}
	const actualSha256 = sha256(content);
	if (actualSha256 !== command.expectedSha256.toLowerCase()) {
		throw new Error("Uploaded content does not match its SHA-256 checksum.");
	}
	const detectedMimeType = detectMimeType(content, command.mimeType);
	if (!mimeTypesCompatible(command.mimeType, detectedMimeType)) {
		throw new Error(
			`File content is ${detectedMimeType}, not the authorized ${command.mimeType}.`,
		);
	}
	await assertMalwareFree(content, command.fileName, detectedMimeType);
	const text = await extractText(content, detectedMimeType);
	const extracted = extractTaxNoticeFields(text);
	const findings = compareTaxNoticeFields(
		command.baseFields ?? [],
		extracted,
		Date.now(),
	);
	return {
		sha256: actualSha256,
		detectedMimeType,
		malwareScan: "clean",
		extracted,
		findings,
		textDiff: text.trim()
			? [{ type: "added", content: text.trim().slice(0, 100_000) }]
			: [],
		processorVersion: PROCESSOR_VERSION,
	};
}

export function extractTaxNoticeFields(text: string): ExtractedField[] {
	const patterns: Array<{
		field: string;
		patterns: RegExp[];
		normalize?: (value: string) => string;
	}> = [
		{
			field: "parcel-or-account-number",
			patterns: [
				/(?:parcel|property|account)(?:\s+(?:id|number|no\.?))?\s*[:#-]\s*([A-Z0-9-]{4,})/i,
			],
		},
		{
			field: "notice-date",
			patterns: [/(?:notice|issued)\s+date\s*[:#-]\s*([A-Za-z0-9, /-]{6,24})/i],
			normalize: normalizeDate,
		},
		{
			field: "balance",
			patterns: [
				/(?:total\s+)?(?:amount|balance)(?:\s+due)?\s*[:$-]\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
			],
			normalize: normalizeMoney,
		},
		{
			field: "penalties",
			patterns: [
				/(?:penalty|penalties)(?:\s+due)?\s*[:$-]\s*\$?\s*([\d,]+(?:\.\d{2})?)/i,
			],
			normalize: normalizeMoney,
		},
		{
			field: "exemption-status",
			patterns: [/exemption\s+status\s*[:#-]\s*([A-Za-z][A-Za-z -]{2,32})/i],
			normalize: (value) => value.trim().replace(/\s+/g, " "),
		},
		{
			field: "response-deadline",
			patterns: [
				/(?:response|appeal|redemption|payment|filing)\s+(?:due|deadline|date)\s*[:#-]\s*([A-Za-z0-9, /-]{6,24})/i,
				/(?:respond|appeal|redeem|pay|file)\s+by\s+([A-Za-z0-9, /-]{6,24})/i,
			],
			normalize: normalizeDate,
		},
	];
	const fields: ExtractedField[] = [];
	for (const definition of patterns) {
		for (const pattern of definition.patterns) {
			const match = text.match(pattern);
			if (!match?.[1]) continue;
			const value = definition.normalize
				? definition.normalize(match[1])
				: match[1].trim();
			if (!value) continue;
			const line = text.slice(0, match.index ?? 0).split(/\r?\n/).length || 1;
			fields.push({
				field: definition.field,
				value,
				provenance: `Extracted text, line ${line}`,
				confidence: 0.98,
			});
			break;
		}
	}
	return fields;
}

export function compareTaxNoticeFields(
	before: ExtractedField[],
	after: ExtractedField[],
	now: number,
): DiffFinding[] {
	const oldValues = new Map(before.map((field) => [field.field, field.value]));
	const findings: DiffFinding[] = [];
	for (const field of after) {
		const prior = oldValues.get(field.field);
		if (prior !== undefined && prior !== field.value) {
			findings.push({
				field: field.field,
				before: prior,
				after: field.value,
				provenance: field.provenance,
				severity: comparisonSeverity(field.field, prior, field.value),
				source: "deterministic",
			});
		}
	}
	const deadline = after.find(
		(field) => field.field === "response-deadline",
	)?.value;
	if (deadline) {
		const deadlineTime = Date.parse(`${deadline}T23:59:59Z`);
		if (Number.isFinite(deadlineTime)) {
			const daysRemaining = Math.ceil((deadlineTime - now) / 86_400_000);
			if (daysRemaining < 0) {
				findings.push({
					field: "deadline-risk",
					after: `Breached ${Math.abs(daysRemaining)} day(s) ago`,
					provenance: "Deterministic deadline calculation",
					severity: "critical",
					source: "deterministic",
				});
			} else if (daysRemaining <= 30) {
				findings.push({
					field: "deadline-risk",
					after: `${daysRemaining} day(s) remaining`,
					provenance: "Deterministic deadline calculation",
					severity: "warning",
					source: "deterministic",
				});
			}
		}
	}
	return findings;
}

async function downloadSource(objectKey: string) {
	const service = new BlobServiceClient(
		requiredEnv("AZURE_STORAGE_BLOB_URL"),
		new DefaultAzureCredential(),
	);
	const [container, ...path] = objectKey.split("/");
	const response = await service
		.getContainerClient(container)
		.getBlockBlobClient(path.join("/"))
		.download();
	if (!response.readableStreamBody) throw new Error("Uploaded blob is empty.");
	const chunks: Buffer[] = [];
	for await (const chunk of response.readableStreamBody) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return new Uint8Array(Buffer.concat(chunks));
}

async function assertMalwareFree(
	content: Uint8Array,
	fileName: string,
	mimeType: string,
) {
	const scannerUrl = process.env.MALWARE_SCANNER_URL;
	if (!scannerUrl) {
		if (process.env.REQUIRE_MALWARE_SCANNER === "true") {
			throw new Error("The required malware scanner is unavailable.");
		}
		return;
	}
	const response = await fetch(`${scannerUrl.replace(/\/$/, "")}/scan`, {
		method: "POST",
		headers: {
			"Content-Type": mimeType,
			"X-TieCamel-File-Name": encodeURIComponent(fileName),
		},
		body: Buffer.from(content),
	});
	if (!response.ok) {
		throw new Error(`Malware scanner returned ${response.status}.`);
	}
	const result = (await response.json()) as {
		clean?: boolean;
		signature?: string;
	};
	if (!result.clean) {
		throw new Error(
			result.signature
				? `Malware detected: ${result.signature}`
				: "Malware scan failed.",
		);
	}
}

async function extractText(content: Uint8Array, mimeType: string) {
	if (mimeType === "text/csv") return new TextDecoder().decode(content);
	const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
	if (!endpoint) {
		const rawText = new TextDecoder("utf-8", { fatal: false }).decode(content);
		if (mimeType === "application/pdf" && !rawText.includes("PDF")) {
			throw new Error(
				"Azure Document Intelligence is required to extract this document.",
			);
		}
		return rawText.replaceAll(/[^\x09\x0A\x0D\x20-\x7E]/g, " ");
	}
	const credential = new DefaultAzureCredential();
	const token = await credential.getToken(
		"https://cognitiveservices.azure.com/.default",
	);
	if (!token) throw new Error("Could not authorize document extraction.");
	const apiVersion =
		process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? "2024-11-30";
	const analyze = await fetch(
		`${endpoint.replace(/\/$/, "")}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=${apiVersion}`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token.token}`,
				"Content-Type": mimeType,
			},
			body: Buffer.from(content),
		},
	);
	if (analyze.status !== 202) {
		throw new Error(
			`Document extraction was rejected (${analyze.status}): ${await analyze.text()}`,
		);
	}
	const operation = analyze.headers.get("operation-location");
	if (!operation) throw new Error("Document extraction returned no operation.");
	for (let attempt = 0; attempt < 45; attempt += 1) {
		await delay(2_000);
		const response = await fetch(operation, {
			headers: { Authorization: `Bearer ${token.token}` },
		});
		if (!response.ok) {
			throw new Error(
				`Document extraction polling failed (${response.status}).`,
			);
		}
		const result = (await response.json()) as {
			status?: string;
			analyzeResult?: { content?: string };
			error?: { message?: string };
		};
		if (result.status === "succeeded") {
			return result.analyzeResult?.content ?? "";
		}
		if (result.status === "failed") {
			throw new Error(result.error?.message ?? "Document extraction failed.");
		}
	}
	throw new Error("Document extraction timed out.");
}

function detectMimeType(content: Uint8Array, fallback: string) {
	const header = Buffer.from(content.slice(0, 8));
	if (header.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
	if (
		header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
	) {
		return "image/png";
	}
	if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
		return "image/jpeg";
	}
	if (
		(header[0] === 0x49 &&
			header[1] === 0x49 &&
			header[2] === 0x2a &&
			header[3] === 0x00) ||
		(header[0] === 0x4d &&
			header[1] === 0x4d &&
			header[2] === 0x00 &&
			header[3] === 0x2a)
	) {
		return "image/tiff";
	}
	if (header[0] === 0x50 && header[1] === 0x4b) {
		return fallback;
	}
	return fallback === "text/csv" ? fallback : "application/octet-stream";
}

function mimeTypesCompatible(expected: string, detected: string) {
	return expected === detected;
}

function normalizeMoney(value: string) {
	const amount = Number(value.replaceAll(",", ""));
	return Number.isFinite(amount) ? amount.toFixed(2) : "";
}

function normalizeDate(value: string) {
	const cleaned = value.trim().replace(/[.;]+$/, "");
	const parsed = Date.parse(cleaned);
	if (!Number.isFinite(parsed)) return "";
	return new Date(parsed).toISOString().slice(0, 10);
}

function comparisonSeverity(field: string, before: string, after: string) {
	if (field === "response-deadline") {
		return Date.parse(after) < Date.parse(before) ? "critical" : "warning";
	}
	if (field === "balance" || field === "penalties") {
		return Number(after) > Number(before) ? "warning" : "info";
	}
	if (field === "exemption-status") return "critical";
	return "warning";
}

function sha256(content: Uint8Array) {
	return createHash("sha256").update(content).digest("hex");
}

function delay(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requiredEnv(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

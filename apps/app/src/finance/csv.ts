import { decimalToBaseUnits } from "./model";
import type { FinancialCsvRow } from "./types";

const HEADERS = [
	"transaction_id",
	"account",
	"date",
	"direction",
	"amount",
	"currency",
	"description",
	"category",
	"fund",
	"status",
] as const;

export type ParsedFinancialCsv = {
	rows: FinancialCsvRow[];
	errors: Array<{ row: number; message: string }>;
};

export function parseFinancialCsv(text: string): ParsedFinancialCsv {
	let records: string[][];
	try {
		records = parseCsvRecords(text.replace(/^\uFEFF/, ""));
	} catch (error) {
		return {
			rows: [],
			errors: [
				{
					row: 1,
					message: error instanceof Error ? error.message : "Invalid CSV",
				},
			],
		};
	}
	if (!records.length)
		return { rows: [], errors: [{ row: 1, message: "CSV is empty" }] };
	const headers = records[0].map((value) => value.trim().toLowerCase());
	const missing = HEADERS.filter((header) => !headers.includes(header));
	if (missing.length) {
		return {
			rows: [],
			errors: [
				{ row: 1, message: `Missing required columns: ${missing.join(", ")}` },
			],
		};
	}
	const rows: FinancialCsvRow[] = [];
	const errors: ParsedFinancialCsv["errors"] = [];
	for (let index = 1; index < records.length; index += 1) {
		const record = records[index];
		if (record.every((value) => !value.trim())) continue;
		const value = Object.fromEntries(
			headers.map((header, column) => [header, record[column]?.trim() ?? ""]),
		) as Record<string, string>;
		try {
			if (
				!value.transaction_id ||
				!value.account ||
				!value.description ||
				!value.category ||
				!value.fund
			) {
				throw new Error(
					"Transaction ID, account, description, category, and fund are required",
				);
			}
			if (!validIsoDate(value.date)) {
				throw new Error("Date must be a valid ISO date");
			}
			if (!(["inbound", "outbound"] as string[]).includes(value.direction)) {
				throw new Error("Direction must be inbound or outbound");
			}
			if (
				!(["USD", "USDC"] as string[]).includes(value.currency.toUpperCase())
			) {
				throw new Error("Currency must be USD or USDC");
			}
			if (
				!(["pending", "posted", "removed"] as string[]).includes(value.status)
			) {
				throw new Error("Status must be pending, posted, or removed");
			}
			decimalToBaseUnits(
				value.amount,
				value.currency.toUpperCase() === "USDC" ? 6 : 2,
			);
			rows.push({
				transaction_id: value.transaction_id,
				account: value.account,
				date: new Date(value.date).toISOString(),
				direction: value.direction as FinancialCsvRow["direction"],
				amount: value.amount,
				currency: value.currency.toUpperCase() as FinancialCsvRow["currency"],
				description: value.description,
				category: value.category,
				fund: value.fund,
				status: value.status as FinancialCsvRow["status"],
			});
		} catch (error) {
			errors.push({
				row: index + 1,
				message: error instanceof Error ? error.message : "Invalid row",
			});
		}
	}
	if (rows.length > 500) {
		errors.unshift({
			row: 1,
			message: "A CSV import may contain at most 500 transaction rows",
		});
	}
	return { rows, errors };
}

function validIsoDate(value: string) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return (
		!Number.isNaN(parsed.getTime()) &&
		parsed.toISOString().slice(0, 10) === value
	);
}

function parseCsvRecords(text: string) {
	const records: string[][] = [];
	let record: string[] = [];
	let value = "";
	let quoted = false;
	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];
		if (quoted) {
			if (character === '"' && text[index + 1] === '"') {
				value += '"';
				index += 1;
			} else if (character === '"') {
				quoted = false;
			} else {
				value += character;
			}
			continue;
		}
		if (character === '"') quoted = true;
		else if (character === ",") {
			record.push(value);
			value = "";
		} else if (character === "\n") {
			record.push(value.replace(/\r$/, ""));
			records.push(record);
			record = [];
			value = "";
		} else value += character;
	}
	if (quoted) throw new Error("CSV contains an unterminated quoted value");
	if (value || record.length) {
		record.push(value.replace(/\r$/, ""));
		records.push(record);
	}
	return records;
}

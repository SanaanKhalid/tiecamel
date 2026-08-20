import { canonicalJson, sha256Hex } from "../../convex/lib/canonical";
import {
	buildFinancialSnapshot,
	decimalToBaseUnits,
	snapshotReadiness,
} from "./model";
import { financialSeed } from "./seed";
import type {
	DisclosureTreatment,
	FinancialCsvRow,
	FinancialSensitivity,
	FinancialWorkspace,
} from "./types";

const STORAGE_KEY = "tiecamel.financial-preview.v1";

export function loadLocalFinancialWorkspace(): FinancialWorkspace {
	if (typeof window === "undefined") return structuredClone(financialSeed);
	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (stored) return JSON.parse(stored) as FinancialWorkspace;
	} catch {
		window.localStorage.removeItem(STORAGE_KEY);
	}
	return structuredClone(financialSeed);
}

export function saveLocalFinancialWorkspace(workspace: FinancialWorkspace) {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export function importLocalCsv(
	workspace: FinancialWorkspace,
	rows: FinancialCsvRow[],
) {
	const next = structuredClone(workspace);
	let inserted = 0;
	let updated = 0;
	let duplicates = 0;
	const errors: Array<{ row: number; message: string }> = [];
	const refreshedAccountIds = new Set<string>();
	rows.forEach((row, index) => {
		try {
			const account = next.accounts.find((item) => item.name === row.account);
			const fund = next.funds.find((item) => item.name === row.fund);
			if (!account) throw new Error(`Unknown account: ${row.account}`);
			if (!fund) throw new Error(`Unknown fund: ${row.fund}`);
			if (account.currency !== row.currency)
				throw new Error("Currency does not match the account");
			const amount = decimalToBaseUnits(row.amount, account.decimals);
			const existing = next.transactions.find(
				(item) =>
					item.accountId === account.id &&
					item.externalId === row.transaction_id,
			);
			const comparable = {
				accountId: account.id,
				externalId: row.transaction_id,
				source: "csv" as const,
				postedAt: row.date,
				direction: row.direction,
				amountBaseUnits: amount,
				currency: row.currency,
				decimals: account.decimals,
				reportingAmountMinor: row.currency === "USD" ? amount : undefined,
				state: row.status,
				rawDescription: row.description,
				privateCounterparty: row.description,
				publicDescription:
					row.direction === "inbound"
						? "Anonymous donation"
						: "Operating expense",
				category: row.category,
				fundId: fund.id,
				sensitivity: inferSensitivity(
					row.category,
					row.description,
					row.direction,
				),
			};
			const value = {
				id: existing?.id ?? crypto.randomUUID(),
				...comparable,
				updatedAt: new Date().toISOString(),
			};
			if (!existing) {
				next.transactions.unshift(value);
				inserted += 1;
				refreshedAccountIds.add(account.id);
			} else if (
				canonicalJson({ ...existing, id: undefined, updatedAt: undefined }) ===
				canonicalJson(comparable)
			) {
				duplicates += 1;
				refreshedAccountIds.add(account.id);
			} else {
				Object.assign(existing, value);
				updated += 1;
				refreshedAccountIds.add(account.id);
			}
		} catch (error) {
			errors.push({
				row: index + 2,
				message: error instanceof Error ? error.message : "Invalid row",
			});
		}
	});
	const refreshedAt = new Date().toISOString();
	for (const account of next.accounts) {
		if (refreshedAccountIds.has(account.id)) {
			account.lastSuccessfulSyncAt = refreshedAt;
			account.health = "healthy";
			account.healthMessage = undefined;
		}
	}
	return { workspace: next, inserted, updated, duplicates, errors };
}

export function updateLocalPolicy(
	workspace: FinancialWorkspace,
	treatments: Record<FinancialSensitivity, DisclosureTreatment>,
) {
	return {
		...workspace,
		policy: {
			id: crypto.randomUUID(),
			version: workspace.policy.version + 1,
			treatments,
			createdAt: new Date().toISOString(),
		},
	};
}

export async function publishLocalPeriod(
	workspace: FinancialWorkspace,
	periodId: string,
	publisher: string,
	publicLimitation?: string,
) {
	const next = structuredClone(workspace);
	const period = next.periods.find((item) => item.id === periodId);
	if (!period) throw new Error("Reporting period not found");
	period.publicLimitation = publicLimitation?.trim() || undefined;
	const readiness = snapshotReadiness({
		period,
		accounts: next.accounts,
		transactions: next.transactions,
		reconciliations: next.reconciliations,
		policy: next.policy,
	});
	if (readiness.errors.length) throw new Error(readiness.errors.join(" "));
	const prior = next.snapshots
		.filter((snapshot) => snapshot.payload.period.id === periodId)
		.sort((left, right) => right.version - left.version)[0];
	const sourceStateSha256 = await sha256Hex(
		canonicalJson({
			period: {
				id: period.id,
				label: period.label,
				startAt: period.startAt,
				endAt: period.endAt,
				publicLimitation: period.publicLimitation,
			},
			accounts: next.accounts,
			funds: next.funds,
			transactions: next.transactions,
			reconciliations: next.reconciliations,
			policy: next.policy,
		}),
	);
	if (prior?.sourceStateSha256 === sourceStateSha256) return next;
	const payload = buildFinancialSnapshot({
		organization: { slug: "icn", name: "Islamic Center of Naperville" },
		period,
		accounts: next.accounts,
		funds: next.funds,
		transactions: next.transactions,
		reconciliations: next.reconciliations,
		policy: next.policy,
		publishedAt: new Date().toISOString(),
		publishedBy: publisher,
		previousSnapshotSha256: prior?.sha256,
	});
	const sha256 = await sha256Hex(canonicalJson(payload));
	if (prior?.sha256 === sha256) return next;
	next.snapshots.unshift({
		id: crypto.randomUUID(),
		version: (prior?.version ?? 0) + 1,
		sha256,
		sourceStateSha256,
		payload,
		verification: "local",
	});
	period.status = "published";
	return next;
}

function inferSensitivity(
	category: string,
	description: string,
	direction: "inbound" | "outbound",
): FinancialSensitivity {
	if (direction === "inbound") return "donation";
	const text = `${category} ${description}`.toLowerCase();
	if (/payroll|salary|wage/.test(text)) return "payroll";
	if (/aid|assistance|beneficiary|relief/.test(text)) return "beneficiary";
	if (/legal|counsel|attorney/.test(text)) return "legal";
	if (/security|alarm|camera/.test(text)) return "security";
	return "ordinary";
}

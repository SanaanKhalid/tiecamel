import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "../../convex/lib/canonical";
import {
	financialAccessForRole,
	financialRecordBelongsToOrganization,
	financialTransactionEventKind,
	hashFinancialSnapshot,
	prepareFinancialSnapshot,
} from "../../convex/lib/financial";
import { parseFinancialCsv } from "../finance/csv";
import { importLocalCsv, publishLocalPeriod } from "../finance/local-store";
import {
	buildFinancialSnapshot,
	decimalToBaseUnits,
	reconciliationForPeriod,
	snapshotReadiness,
} from "../finance/model";
import { financialSeed } from "../finance/seed";
import type { DisclosureTreatment } from "../finance/types";

describe("financial values and ingestion", () => {
	it("isolates management, reviewer, member, and organization access", () => {
		expect(financialAccessForRole("owner")).toEqual({
			read: true,
			manage: true,
			publish: true,
		});
		expect(financialAccessForRole("reviewer")).toEqual({
			read: true,
			manage: false,
			publish: false,
		});
		expect(financialAccessForRole("member")).toEqual({
			read: false,
			manage: false,
			publish: false,
		});
		expect(financialRecordBelongsToOrganization("org-a", "org-a")).toBe(true);
		expect(financialRecordBelongsToOrganization("org-a", "org-b")).toBe(false);
	});

	it("converts decimal USD and USDC amounts to safe integer base units", () => {
		expect(decimalToBaseUnits("1,234.50", 2)).toBe(123_450);
		expect(decimalToBaseUnits("0.000001", 6)).toBe(1);
		expect(() => decimalToBaseUnits("1.001", 2)).toThrow(/at most 2/);
		expect(() => decimalToBaseUnits("-1", 2)).toThrow(/non-negative/);
	});

	it("validates required CSV fields before returning importable rows", () => {
		const missing = parseFinancialCsv("transaction_id,amount\nabc,12.00");
		expect(missing.errors[0]?.message).toMatch(/Missing required columns/);

		const parsed = parseFinancialCsv(
			"transaction_id,account,date,direction,amount,currency,description,category,fund,status\n" +
				'csv-1,Operating checking ··1842,2026-08-08,inbound,25.00,USD,"Anonymous, online donation",Contributions,General fund,posted',
		);
		expect(parsed.errors).toEqual([]);
		expect(parsed.rows[0]).toMatchObject({
			transaction_id: "csv-1",
			amount: "25.00",
			description: "Anonymous, online donation",
		});
		expect(
			parseFinancialCsv(
				"transaction_id,account,date,direction,amount,currency,description,category,fund,status\nbad,Account,2026-02-31,inbound,10,USD,Donation,Contributions,General fund,posted",
			).errors[0]?.message,
		).toMatch(/valid ISO date/);
		expect(
			parseFinancialCsv('transaction_id,account\n"unterminated').errors,
		).toEqual([
			expect.objectContaining({
				message: expect.stringMatching(/unterminated/),
			}),
		]);
	});

	it("deduplicates on account plus external transaction id", () => {
		const row = parseFinancialCsv(
			"transaction_id,account,date,direction,amount,currency,description,category,fund,status\n" +
				"csv-2,Operating checking ··1842,2026-08-08,inbound,25.00,USD,Anonymous donation,Contributions,General fund,posted",
		).rows;
		const first = importLocalCsv(structuredClone(financialSeed), row);
		const second = importLocalCsv(first.workspace, row);
		expect(first).toMatchObject({ inserted: 1, updated: 0, duplicates: 0 });
		expect(second).toMatchObject({ inserted: 0, updated: 0, duplicates: 1 });
	});

	it("classifies immutable import events by projection transition", () => {
		expect(financialTransactionEventKind(undefined, "posted")).toBe("added");
		expect(financialTransactionEventKind("pending", "posted")).toBe("posted");
		expect(financialTransactionEventKind("posted", "removed")).toBe("removed");
		expect(financialTransactionEventKind("posted", "posted")).toBe("modified");
	});
});

describe("financial reconciliation and publication", () => {
	const period = financialSeed.periods[0];

	it("calculates account closing balances and publication gates", () => {
		const reconciliations = reconciliationForPeriod(
			period,
			financialSeed.accounts,
			financialSeed.transactions,
			financialSeed.reconciliations,
		);
		expect(reconciliations.every((item) => item.differenceMinor === 0)).toBe(
			true,
		);
		expect(
			snapshotReadiness({
				period,
				accounts: financialSeed.accounts,
				transactions: financialSeed.transactions,
				reconciliations: financialSeed.reconciliations,
				policy: financialSeed.policy,
			}).errors,
		).toEqual([]);

		const unreviewed = structuredClone(financialSeed.transactions);
		unreviewed[0].state = "review-required";
		unreviewed[0].reportingAmountMinor = undefined;
		unreviewed[1].reportingAmountMinor = undefined;
		const blocked = snapshotReadiness({
			period,
			accounts: financialSeed.accounts,
			transactions: unreviewed,
			reconciliations: financialSeed.reconciliations,
			policy: financialSeed.policy,
		});
		expect(blocked.errors.join(" ")).toMatch(/reviewed/);
		expect(blocked.errors.join(" ")).toMatch(/confirmed USD/);

		const discrepant = structuredClone(financialSeed.reconciliations);
		discrepant[0].closingBalanceMinor =
			(discrepant[0].closingBalanceMinor ?? 0) + 1;
		const unexplained = snapshotReadiness({
			period,
			accounts: financialSeed.accounts,
			transactions: financialSeed.transactions,
			reconciliations: discrepant,
			policy: financialSeed.policy,
		});
		expect(unexplained.errors.join(" ")).toMatch(/public explanation/);
		discrepant[0].publicExplanation = "One-cent processor rounding difference.";
		expect(
			snapshotReadiness({
				period,
				accounts: financialSeed.accounts,
				transactions: financialSeed.transactions,
				reconciliations: discrepant,
				policy: financialSeed.policy,
			}).errors,
		).toEqual([]);
	});

	it.each([
		"individual-redacted",
		"period-aggregate",
		"confidential-total",
	] as DisclosureTreatment[])("sanitizes every sensitivity under %s", (treatment) => {
		const payload = buildFinancialSnapshot({
			organization: { slug: "icn", name: "Islamic Center of Naperville" },
			period,
			accounts: financialSeed.accounts,
			funds: financialSeed.funds,
			transactions: financialSeed.transactions,
			reconciliations: financialSeed.reconciliations,
			policy: {
				...financialSeed.policy,
				treatments: {
					ordinary: treatment,
					donation: treatment,
					payroll: treatment,
					beneficiary: treatment,
					legal: treatment,
					security: treatment,
				},
			},
			publishedAt: "2026-07-15T16:00:00.000Z",
			publishedBy: "Amina Razzak",
		});
		const serialized = JSON.stringify(payload);
		for (const protectedText of [
			"private employee roster",
			"private recipient",
			"privileged matter",
			"statement 8841",
			"··1842",
			"Demo111",
		]) {
			expect(serialized).not.toContain(protectedText);
		}
		expect(payload.totals).toEqual({
			inboundMinor: 906_400,
			outboundMinor: 1_423_250,
			netMinor: -516_850,
		});
		expect(
			payload.entries.every((entry) => entry.kind === treatmentKind(treatment)),
		).toBe(true);
	});

	it("orders snapshot collections canonically and chains corrections to the prior hash", async () => {
		const input = serverSnapshotInput();
		const left = prepareFinancialSnapshot(input);
		const right = prepareFinancialSnapshot({
			...input,
			accounts: [...input.accounts].reverse(),
			funds: [...input.funds].reverse(),
			transactions: [...input.transactions].reverse(),
		});
		expect(left.errors).toEqual([]);
		expect(right.errors).toEqual([]);
		if (!left.payload || !right.payload)
			throw new Error("Expected publishable snapshots");
		const leftHash = await hashFinancialSnapshot(left.payload);
		const rightHash = await hashFinancialSnapshot(right.payload);
		expect(leftHash).toEqual(rightHash);

		const corrected = prepareFinancialSnapshot({
			...input,
			previousSnapshotSha256: leftHash.sha256,
		});
		if (!corrected.payload) throw new Error("Expected corrected snapshot");
		expect(corrected.payload.previousSnapshotSha256).toBe(leftHash.sha256);
		expect((await hashFinancialSnapshot(corrected.payload)).sha256).not.toBe(
			leftHash.sha256,
		);
	});

	it("ships a demo snapshot whose displayed hash matches its canonical payload", async () => {
		const snapshot = financialSeed.snapshots[0];
		expect(await sha256Hex(canonicalJson(snapshot.payload))).toBe(
			snapshot.sha256,
		);
	});

	it("publishes corrections once and returns the existing snapshot for identical source state", async () => {
		const corrected = await publishLocalPeriod(
			structuredClone(financialSeed),
			period.id,
			"Amina Razzak",
			"Corrected reporting limitation.",
		);
		expect(corrected.snapshots).toHaveLength(2);
		expect(corrected.snapshots[0].payload.previousSnapshotSha256).toBe(
			financialSeed.snapshots[0].sha256,
		);
		const repeated = await publishLocalPeriod(
			corrected,
			period.id,
			"Amina Razzak",
			"Corrected reporting limitation.",
		);
		expect(repeated.snapshots).toHaveLength(2);
		expect(repeated.snapshots[0].sha256).toBe(corrected.snapshots[0].sha256);
	});
});

function treatmentKind(treatment: DisclosureTreatment) {
	if (treatment === "individual-redacted") return "individual";
	if (treatment === "period-aggregate") return "aggregate";
	return "confidential";
}

function serverSnapshotInput() {
	return {
		organization: { slug: "icn", name: "Islamic Center of Naperville" },
		period: {
			id: financialSeed.periods[0].id,
			label: financialSeed.periods[0].label,
			startAt: Date.parse(financialSeed.periods[0].startAt),
			endAt: Date.parse(financialSeed.periods[0].endAt),
		},
		accounts: financialSeed.accounts.map((account) => ({
			id: account.id,
			publicLabel: account.publicLabel,
			kind: account.kind,
			source: account.source,
			included: account.included,
			lastSuccessfulSyncAt: account.lastSuccessfulSyncAt
				? Date.parse(account.lastSuccessfulSyncAt)
				: undefined,
		})),
		funds: financialSeed.funds.map((fund) => ({
			id: fund.id,
			name: fund.name,
			restricted: fund.restricted,
		})),
		transactions: financialSeed.transactions.map((transaction) => ({
			id: transaction.id,
			accountId: transaction.accountId,
			fundId: transaction.fundId,
			postedAt: Date.parse(transaction.postedAt),
			direction: transaction.direction,
			reportingAmountMinor: transaction.reportingAmountMinor,
			state: transaction.state,
			publicDescription: transaction.publicDescription,
			publicCounterparty: transaction.publicCounterparty,
			category: transaction.category,
			sensitivity: transaction.sensitivity,
		})),
		reconciliations: financialSeed.reconciliations.map((reconciliation) => ({
			accountId: reconciliation.accountId,
			openingBalanceMinor: reconciliation.openingBalanceMinor,
			closingBalanceMinor: reconciliation.closingBalanceMinor,
			publicExplanation: reconciliation.publicExplanation,
		})),
		policy: {
			version: financialSeed.policy.version,
			treatments: financialSeed.policy.treatments,
		},
		publishedAt: Date.parse("2026-07-15T16:00:00.000Z"),
		publishedBy: "Amina Razzak",
	};
}

import type {
	FinancialAccount,
	FinancialDisclosurePolicy,
	FinancialFund,
	FinancialPeriod,
	FinancialReconciliation,
	FinancialTransaction,
	PublicFinancialEntry,
	PublicFinancialSnapshotPayload,
} from "./types";

const SENSITIVE_LABELS: Record<FinancialTransaction["sensitivity"], string> = {
	ordinary: "Operating activity",
	donation: "Anonymous donation",
	payroll: "Payroll",
	beneficiary: "Community assistance",
	legal: "Legal services",
	security: "Security services",
};

export function formatReportingMoney(amountMinor: number) {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
	}).format(amountMinor / 100);
}

export function decimalToBaseUnits(value: string, decimals: number) {
	const normalized = value.trim().replace(/,/g, "");
	if (!/^\d+(\.\d+)?$/.test(normalized)) {
		throw new Error("Amount must be a non-negative decimal number");
	}
	const [whole, fraction = ""] = normalized.split(".");
	if (fraction.length > decimals) {
		throw new Error(`Amount supports at most ${decimals} decimal places`);
	}
	const units = `${whole}${fraction.padEnd(decimals, "0")}`.replace(
		/^0+(?=\d)/,
		"",
	);
	const parsed = Number(units || "0");
	if (!Number.isSafeInteger(parsed)) throw new Error("Amount is too large");
	return parsed;
}

export function reconciliationForPeriod(
	period: FinancialPeriod,
	accounts: FinancialAccount[],
	transactions: FinancialTransaction[],
	reconciliations: FinancialReconciliation[],
) {
	return accounts
		.filter((account) => account.included)
		.map((account) => {
			const existing = reconciliations.find(
				(item) => item.periodId === period.id && item.accountId === account.id,
			);
			const flow = transactions
				.filter(
					(transaction) =>
						transaction.accountId === account.id &&
						transaction.state === "posted" &&
						transaction.postedAt >= period.startAt &&
						transaction.postedAt <= period.endAt &&
						transaction.reportingAmountMinor !== undefined,
				)
				.reduce(
					(total, transaction) =>
						total +
						(transaction.direction === "inbound" ? 1 : -1) *
							(transaction.reportingAmountMinor ?? 0),
					0,
				);
			const calculated =
				existing?.openingBalanceMinor === undefined
					? undefined
					: existing.openingBalanceMinor + flow;
			const difference =
				calculated === undefined || existing?.closingBalanceMinor === undefined
					? undefined
					: existing.closingBalanceMinor - calculated;
			return {
				...existing,
				id: existing?.id ?? `${period.id}:${account.id}`,
				periodId: period.id,
				accountId: account.id,
				calculatedClosingMinor: calculated,
				differenceMinor: difference,
				status:
					difference === undefined
						? ("incomplete" as const)
						: difference === 0
							? ("reconciled" as const)
							: ("exception" as const),
			};
		});
}

export function snapshotReadiness(input: {
	period: FinancialPeriod;
	accounts: FinancialAccount[];
	transactions: FinancialTransaction[];
	reconciliations: FinancialReconciliation[];
	policy?: FinancialDisclosurePolicy;
}) {
	const errors: string[] = [];
	const included = input.accounts.filter((account) => account.included);
	if (!included.length)
		errors.push("At least one declared account must be included.");
	if (!input.policy) errors.push("A disclosure policy is required.");
	const periodTransactions = transactionsForPeriod(
		input.period,
		input.transactions,
		new Set(included.map((account) => account.id)),
	);
	if (periodTransactions.some((item) => item.state === "review-required")) {
		errors.push("All synchronized USDC transactions must be reviewed.");
	}
	if (
		periodTransactions.some(
			(item) =>
				item.state === "posted" && item.reportingAmountMinor === undefined,
		)
	) {
		errors.push(
			"Every posted transaction needs a confirmed USD reporting value.",
		);
	}
	const reconciled = reconciliationForPeriod(
		input.period,
		input.accounts,
		input.transactions,
		input.reconciliations,
	);
	if (reconciled.some((item) => item.status === "incomplete")) {
		errors.push(
			"Opening and closing balances are required for every included account.",
		);
	}
	if (
		reconciled.some(
			(item) => item.status === "exception" && !item.publicExplanation?.trim(),
		)
	) {
		errors.push("Every reconciliation discrepancy needs a public explanation.");
	}
	return { errors, reconciliations: reconciled };
}

export function buildFinancialSnapshot(input: {
	organization: { slug: string; name: string };
	period: FinancialPeriod;
	accounts: FinancialAccount[];
	funds: FinancialFund[];
	transactions: FinancialTransaction[];
	reconciliations: FinancialReconciliation[];
	policy: FinancialDisclosurePolicy;
	publishedAt: string;
	publishedBy: string;
	previousSnapshotSha256?: string;
}): PublicFinancialSnapshotPayload {
	const includedIds = new Set(
		input.accounts
			.filter((account) => account.included)
			.map((account) => account.id),
	);
	const transactions = transactionsForPeriod(
		input.period,
		input.transactions,
		includedIds,
	).filter(
		(transaction) =>
			transaction.state === "posted" &&
			transaction.reportingAmountMinor !== undefined,
	);
	const reconciliations = reconciliationForPeriod(
		input.period,
		input.accounts,
		input.transactions,
		input.reconciliations,
	);
	const entries = sanitizeTransactions(transactions, input.funds, input.policy);
	const inboundMinor = totalDirection(transactions, "inbound");
	const outboundMinor = totalDirection(transactions, "outbound");
	const limitations = [
		...reconciliations
			.filter((item) => item.status === "exception")
			.map((item) => item.publicExplanation?.trim())
			.filter((item): item is string => Boolean(item)),
		...(input.period.publicLimitation?.trim()
			? [input.period.publicLimitation.trim()]
			: []),
	];
	return {
		format: "tiecamel-financial-snapshot/v1",
		organization: input.organization,
		period: {
			id: input.period.id,
			label: input.period.label,
			startAt: input.period.startAt,
			endAt: input.period.endAt,
		},
		reportingCurrency: "USD",
		publishedAt: input.publishedAt,
		publishedBy: input.publishedBy,
		policyVersion: input.policy.version,
		previousSnapshotSha256: input.previousSnapshotSha256,
		coverage: {
			declaredAccounts: input.accounts.length,
			includedAccounts: includedIds.size,
			accounts: [...input.accounts]
				.sort((left, right) =>
					left.publicLabel.localeCompare(right.publicLabel),
				)
				.map((account) => {
					const reconciliation = reconciliations.find(
						(item) => item.accountId === account.id,
					);
					return {
						label: account.publicLabel,
						kind: account.kind,
						source: account.source,
						included: account.included,
						freshness: account.lastSuccessfulSyncAt,
						openingBalanceMinor: reconciliation?.openingBalanceMinor,
						closingBalanceMinor: reconciliation?.closingBalanceMinor,
						differenceMinor: reconciliation?.differenceMinor,
					};
				}),
		},
		reconciliation: {
			status: reconciliations.some((item) => item.status === "exception")
				? "exception"
				: "reconciled",
			openingBalanceMinor: reconciliations.reduce(
				(total, item) => total + (item.openingBalanceMinor ?? 0),
				0,
			),
			closingBalanceMinor: reconciliations.reduce(
				(total, item) => total + (item.closingBalanceMinor ?? 0),
				0,
			),
			differenceMinor: reconciliations.reduce(
				(total, item) => total + (item.differenceMinor ?? 0),
				0,
			),
			limitations,
		},
		totals: {
			inboundMinor,
			outboundMinor,
			netMinor: inboundMinor - outboundMinor,
		},
		funds: [...input.funds]
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((fund) => {
				const fundTransactions = transactions.filter(
					(transaction) => transaction.fundId === fund.id,
				);
				const inbound = totalDirection(fundTransactions, "inbound");
				const outbound = totalDirection(fundTransactions, "outbound");
				return {
					name: fund.name,
					restricted: fund.restricted,
					inboundMinor: inbound,
					outboundMinor: outbound,
					netMinor: inbound - outbound,
				};
			}),
		entries,
	};
}

function transactionsForPeriod(
	period: FinancialPeriod,
	transactions: FinancialTransaction[],
	includedAccountIds: Set<string>,
) {
	return transactions.filter(
		(transaction) =>
			includedAccountIds.has(transaction.accountId) &&
			transaction.postedAt >= period.startAt &&
			transaction.postedAt <= period.endAt &&
			transaction.state !== "removed",
	);
}

function sanitizeTransactions(
	transactions: FinancialTransaction[],
	funds: FinancialFund[],
	policy: FinancialDisclosurePolicy,
) {
	const entries: PublicFinancialEntry[] = [];
	const groups = new Map<string, PublicFinancialEntry>();
	for (const transaction of transactions) {
		const amountMinor = transaction.reportingAmountMinor ?? 0;
		const fund =
			funds.find((item) => item.id === transaction.fundId)?.name ?? "General";
		const treatment = policy.treatments[transaction.sensitivity];
		if (treatment === "individual-redacted") {
			const ordinary = transaction.sensitivity === "ordinary";
			entries.push({
				id: transaction.id,
				kind: "individual",
				date: transaction.postedAt.slice(0, 10),
				direction: transaction.direction,
				amountMinor,
				category: transaction.category,
				fund,
				description:
					transaction.publicDescription.trim() ||
					SENSITIVE_LABELS[transaction.sensitivity],
				counterparty: ordinary
					? transaction.publicCounterparty?.trim() || undefined
					: undefined,
				transactionCount: 1,
			});
			continue;
		}
		const confidential = treatment === "confidential-total";
		const key = confidential
			? `${transaction.direction}:confidential:${fund}`
			: `${transaction.direction}:${transaction.sensitivity}:${transaction.category}:${fund}`;
		const existing = groups.get(key);
		if (existing) {
			existing.amountMinor += amountMinor;
			existing.transactionCount += 1;
			continue;
		}
		groups.set(key, {
			id: `group:${key}`,
			kind: confidential ? "confidential" : "aggregate",
			direction: transaction.direction,
			amountMinor,
			category: confidential ? "Protected activity" : transaction.category,
			fund,
			description: confidential
				? "Details protected by the organization’s disclosure policy"
				: SENSITIVE_LABELS[transaction.sensitivity],
			transactionCount: 1,
		});
	}
	return [...entries, ...groups.values()].sort((left, right) => {
		if (left.date && right.date) return right.date.localeCompare(left.date);
		if (left.date) return -1;
		if (right.date) return 1;
		return left.id.localeCompare(right.id);
	});
}

function totalDirection(
	transactions: FinancialTransaction[],
	direction: FinancialTransaction["direction"],
) {
	return transactions
		.filter((transaction) => transaction.direction === direction)
		.reduce(
			(total, transaction) => total + (transaction.reportingAmountMinor ?? 0),
			0,
		);
}

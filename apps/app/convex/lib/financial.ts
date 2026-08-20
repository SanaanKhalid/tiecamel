import { canonicalJson, sha256Hex } from "./canonical";

export type SnapshotAccount = {
	id: string;
	publicLabel: string;
	kind: "bank" | "card" | "cash" | "wallet";
	source: "demo" | "csv" | "solana";
	included: boolean;
	lastSuccessfulSyncAt?: number;
};

export type SnapshotFund = {
	id: string;
	name: string;
	restricted: boolean;
};

export type SnapshotTransaction = {
	id: string;
	accountId: string;
	fundId: string;
	postedAt: number;
	direction: "inbound" | "outbound";
	reportingAmountMinor?: number;
	state: "pending" | "posted" | "removed" | "review-required";
	publicDescription: string;
	publicCounterparty?: string;
	category: string;
	sensitivity:
		| "ordinary"
		| "donation"
		| "payroll"
		| "beneficiary"
		| "legal"
		| "security";
};

export type SnapshotReconciliation = {
	accountId: string;
	openingBalanceMinor?: number;
	closingBalanceMinor?: number;
	publicExplanation?: string;
};

export type SnapshotPolicy = {
	version: number;
	treatments: Record<
		SnapshotTransaction["sensitivity"],
		"individual-redacted" | "period-aggregate" | "confidential-total"
	>;
};

const labels: Record<SnapshotTransaction["sensitivity"], string> = {
	ordinary: "Operating activity",
	donation: "Anonymous donation",
	payroll: "Payroll",
	beneficiary: "Community assistance",
	legal: "Legal services",
	security: "Security services",
};

export type FinancialMembershipRole =
	| "administrator"
	| "board"
	| "secretary"
	| "finance"
	| "owner"
	| "reviewer"
	| "member";

export function financialAccessForRole(role: FinancialMembershipRole) {
	const manage = ["owner", "administrator", "finance"].includes(role);
	return {
		read: manage || role === "board" || role === "reviewer",
		manage,
		publish: manage,
	};
}

export function financialRecordBelongsToOrganization(
	recordOrganizationId: string,
	viewerOrganizationId: string,
) {
	return recordOrganizationId === viewerOrganizationId;
}

export function financialTransactionEventKind(
	priorState: SnapshotTransaction["state"] | undefined,
	nextState: SnapshotTransaction["state"],
) {
	if (nextState === "removed") return "removed" as const;
	if (!priorState) return "added" as const;
	if (priorState === "pending" && nextState === "posted") {
		return "posted" as const;
	}
	return "modified" as const;
}

export function prepareFinancialSnapshot(input: {
	organization: { slug: string; name: string };
	period: {
		id: string;
		label: string;
		startAt: number;
		endAt: number;
		publicLimitation?: string;
	};
	accounts: SnapshotAccount[];
	funds: SnapshotFund[];
	transactions: SnapshotTransaction[];
	reconciliations: SnapshotReconciliation[];
	policy: SnapshotPolicy;
	publishedAt: number;
	publishedBy: string;
	previousSnapshotSha256?: string;
}) {
	const includedIds = new Set(
		input.accounts
			.filter((account) => account.included)
			.map((account) => account.id),
	);
	const periodTransactions = input.transactions.filter(
		(transaction) =>
			includedIds.has(transaction.accountId) &&
			transaction.postedAt >= input.period.startAt &&
			transaction.postedAt <= input.period.endAt &&
			transaction.state !== "removed",
	);
	const errors: string[] = [];
	if (!includedIds.size) errors.push("At least one account must be included.");
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
	const accountReconciliations = input.accounts
		.filter((account) => account.included)
		.map((account) => {
			const reconciliation = input.reconciliations.find(
				(item) => item.accountId === account.id,
			);
			if (
				reconciliation?.openingBalanceMinor === undefined ||
				reconciliation.closingBalanceMinor === undefined
			) {
				errors.push(
					`${account.publicLabel} needs opening and closing balances.`,
				);
			}
			const flow = periodTransactions
				.filter(
					(transaction) =>
						transaction.accountId === account.id &&
						transaction.state === "posted" &&
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
				reconciliation?.openingBalanceMinor === undefined
					? undefined
					: reconciliation.openingBalanceMinor + flow;
			const difference =
				calculated === undefined ||
				reconciliation?.closingBalanceMinor === undefined
					? undefined
					: reconciliation.closingBalanceMinor - calculated;
			if (difference && !reconciliation?.publicExplanation?.trim()) {
				errors.push(
					`${account.publicLabel} has an unexplained reconciliation difference.`,
				);
			}
			return { reconciliation, calculated, difference };
		});
	if (errors.length) return { errors } as const;

	const posted = periodTransactions.filter(
		(transaction) =>
			transaction.state === "posted" &&
			transaction.reportingAmountMinor !== undefined,
	);
	const entries = sanitize(posted, input.funds, input.policy);
	const inboundMinor = total(posted, "inbound");
	const outboundMinor = total(posted, "outbound");
	const limitations = [
		...accountReconciliations
			.map((item) => item.reconciliation?.publicExplanation?.trim())
			.filter((item): item is string => Boolean(item)),
		...(input.period.publicLimitation?.trim()
			? [input.period.publicLimitation.trim()]
			: []),
	];
	const payload = {
		format: "tiecamel-financial-snapshot/v1" as const,
		organization: input.organization,
		period: {
			id: input.period.id,
			label: input.period.label,
			startAt: new Date(input.period.startAt).toISOString(),
			endAt: new Date(input.period.endAt).toISOString(),
		},
		reportingCurrency: "USD" as const,
		publishedAt: new Date(input.publishedAt).toISOString(),
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
					const state = accountReconciliations.find(
						(item) => item.reconciliation?.accountId === account.id,
					);
					return {
						label: account.publicLabel,
						kind: account.kind,
						source: account.source,
						included: account.included,
						freshness: account.lastSuccessfulSyncAt
							? new Date(account.lastSuccessfulSyncAt).toISOString()
							: undefined,
						openingBalanceMinor: state?.reconciliation?.openingBalanceMinor,
						closingBalanceMinor: state?.reconciliation?.closingBalanceMinor,
						differenceMinor: state?.difference,
					};
				}),
		},
		reconciliation: {
			status: accountReconciliations.some((item) => item.difference)
				? ("exception" as const)
				: ("reconciled" as const),
			openingBalanceMinor: accountReconciliations.reduce(
				(sum, item) => sum + (item.reconciliation?.openingBalanceMinor ?? 0),
				0,
			),
			closingBalanceMinor: accountReconciliations.reduce(
				(sum, item) => sum + (item.reconciliation?.closingBalanceMinor ?? 0),
				0,
			),
			differenceMinor: accountReconciliations.reduce(
				(sum, item) => sum + (item.difference ?? 0),
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
				const transactions = posted.filter(
					(transaction) => transaction.fundId === fund.id,
				);
				const inbound = total(transactions, "inbound");
				const outbound = total(transactions, "outbound");
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
	return { errors: [], payload } as const;
}

export async function hashFinancialSnapshot(payload: unknown) {
	const serialized = canonicalJson(payload);
	return { canonicalJson: serialized, sha256: await sha256Hex(serialized) };
}

function sanitize(
	transactions: SnapshotTransaction[],
	funds: SnapshotFund[],
	policy: SnapshotPolicy,
) {
	const entries: Array<
		Record<string, unknown> & {
			id: string;
			amountMinor: number;
			transactionCount: number;
		}
	> = [];
	const groups = new Map<string, (typeof entries)[number]>();
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
				date: new Date(transaction.postedAt).toISOString().slice(0, 10),
				direction: transaction.direction,
				amountMinor,
				category: transaction.category,
				fund,
				description:
					transaction.publicDescription.trim() ||
					labels[transaction.sensitivity],
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
				: labels[transaction.sensitivity],
			transactionCount: 1,
		});
	}
	return [...entries, ...groups.values()].sort((left, right) => {
		const byDate = String(right.date ?? "").localeCompare(
			String(left.date ?? ""),
		);
		return byDate || left.id.localeCompare(right.id);
	});
}

function total(
	transactions: SnapshotTransaction[],
	direction: SnapshotTransaction["direction"],
) {
	return transactions
		.filter((transaction) => transaction.direction === direction)
		.reduce(
			(sum, transaction) => sum + (transaction.reportingAmountMinor ?? 0),
			0,
		);
}

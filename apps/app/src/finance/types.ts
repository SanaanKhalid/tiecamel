export type FinancialSource = "demo" | "csv" | "solana";
export type FinancialAccountKind = "bank" | "card" | "cash" | "wallet";
export type FinancialTransactionState =
	| "pending"
	| "posted"
	| "removed"
	| "review-required";
export type FinancialSensitivity =
	| "ordinary"
	| "donation"
	| "payroll"
	| "beneficiary"
	| "legal"
	| "security";
export type DisclosureTreatment =
	| "individual-redacted"
	| "period-aggregate"
	| "confidential-total";
export type SnapshotVerification =
	| "local"
	| "anchor-queued"
	| "anchor-running"
	| "anchored"
	| "anchor-failed";

export type FinancialAccount = {
	id: string;
	name: string;
	publicLabel: string;
	kind: FinancialAccountKind;
	source: FinancialSource;
	currency: "USD" | "USDC";
	decimals: number;
	included: boolean;
	lastFour?: string;
	network?: "devnet" | "mainnet-beta";
	ownerAddress?: string;
	mintAddress?: string;
	lastSuccessfulSyncAt?: string;
	health: "healthy" | "degraded" | "disconnected";
	healthMessage?: string;
	simulated?: boolean;
};

export type FinancialFund = {
	id: string;
	name: string;
	restricted: boolean;
	publicDescription: string;
};

export type FinancialTransaction = {
	id: string;
	accountId: string;
	externalId: string;
	source: FinancialSource;
	postedAt: string;
	direction: "inbound" | "outbound";
	amountBaseUnits: number;
	currency: "USD" | "USDC";
	decimals: number;
	reportingAmountMinor?: number;
	state: FinancialTransactionState;
	rawDescription: string;
	privateCounterparty?: string;
	publicDescription: string;
	publicCounterparty?: string;
	category: string;
	fundId: string;
	sensitivity: FinancialSensitivity;
	updatedAt: string;
};

export type FinancialPeriod = {
	id: string;
	label: string;
	startAt: string;
	endAt: string;
	status: "draft" | "prepared" | "published";
	publicLimitation?: string;
};

export type FinancialReconciliation = {
	id: string;
	periodId: string;
	accountId: string;
	openingBalanceMinor?: number;
	closingBalanceMinor?: number;
	calculatedClosingMinor?: number;
	differenceMinor?: number;
	status: "incomplete" | "reconciled" | "exception";
	publicExplanation?: string;
};

export type FinancialDisclosurePolicy = {
	id: string;
	version: number;
	treatments: Record<FinancialSensitivity, DisclosureTreatment>;
	createdAt: string;
};

export type PublicFinancialEntry = {
	id: string;
	kind: "individual" | "aggregate" | "confidential";
	date?: string;
	direction: "inbound" | "outbound";
	amountMinor: number;
	category: string;
	fund: string;
	description: string;
	counterparty?: string;
	transactionCount: number;
};

export type PublicFinancialSnapshotPayload = {
	format: "tiecamel-financial-snapshot/v1";
	organization: { slug: string; name: string };
	period: { id: string; label: string; startAt: string; endAt: string };
	reportingCurrency: "USD";
	publishedAt: string;
	publishedBy: string;
	policyVersion: number;
	previousSnapshotSha256?: string;
	coverage: {
		declaredAccounts: number;
		includedAccounts: number;
		accounts: Array<{
			label: string;
			kind: FinancialAccountKind;
			source: FinancialSource;
			included: boolean;
			freshness?: string;
			openingBalanceMinor?: number;
			closingBalanceMinor?: number;
			differenceMinor?: number;
		}>;
	};
	reconciliation: {
		status: "reconciled" | "exception";
		openingBalanceMinor: number;
		closingBalanceMinor: number;
		differenceMinor: number;
		limitations: string[];
	};
	totals: {
		inboundMinor: number;
		outboundMinor: number;
		netMinor: number;
	};
	funds: Array<{
		name: string;
		restricted: boolean;
		inboundMinor: number;
		outboundMinor: number;
		netMinor: number;
	}>;
	entries: PublicFinancialEntry[];
};

export type PublicFinancialSnapshot = {
	id: string;
	version: number;
	sha256: string;
	sourceStateSha256?: string;
	payload: PublicFinancialSnapshotPayload;
	verification: SnapshotVerification;
	anchor?: {
		network: "devnet" | "mainnet-beta";
		signature?: string;
		explorerUrl?: string;
		error?: string;
	};
};

export type FinancialWorkspace = {
	accounts: FinancialAccount[];
	funds: FinancialFund[];
	transactions: FinancialTransaction[];
	periods: FinancialPeriod[];
	reconciliations: FinancialReconciliation[];
	policy: FinancialDisclosurePolicy;
	snapshots: PublicFinancialSnapshot[];
	anchoringEnabled: boolean;
	anchoringNetwork: "devnet" | "mainnet-beta";
	canManage: boolean;
	canPublish: boolean;
};

export type FinancialCsvRow = {
	transaction_id: string;
	account: string;
	date: string;
	direction: "inbound" | "outbound";
	amount: string;
	currency: "USD" | "USDC";
	description: string;
	category: string;
	fund: string;
	status: "pending" | "posted" | "removed";
};

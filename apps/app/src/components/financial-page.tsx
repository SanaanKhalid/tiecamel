import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
	AlertTriangle,
	ArrowDownLeft,
	ArrowUpRight,
	Banknote,
	CheckCircle2,
	FileUp,
	Globe2,
	Landmark,
	RefreshCw,
	ShieldCheck,
	WalletCards,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { clientConfig } from "../config/client";
import { parseFinancialCsv } from "../finance/csv";
import {
	importLocalCsv,
	loadLocalFinancialWorkspace,
	publishLocalPeriod,
	saveLocalFinancialWorkspace,
	updateLocalPolicy,
} from "../finance/local-store";
import {
	formatReportingMoney,
	reconciliationForPeriod,
	snapshotReadiness,
} from "../finance/model";
import type {
	DisclosureTreatment,
	FinancialAccount,
	FinancialAccountKind,
	FinancialCsvRow,
	FinancialDisclosurePolicy,
	FinancialPeriod,
	FinancialSensitivity,
	FinancialTransaction,
	FinancialWorkspace,
	PublicFinancialSnapshot,
} from "../finance/types";
import { usePlatform } from "../platform/store";
import { PublicFinancialPage } from "./public-financial-page";

type Tab =
	| "overview"
	| "transactions"
	| "accounts"
	| "disclosure"
	| "publications";

type FinancialActions = {
	createAccount: (input: {
		name: string;
		publicLabel: string;
		kind: Exclude<FinancialAccountKind, "wallet">;
		lastFour?: string;
	}) => Promise<void>;
	importCsv: (
		fileName: string,
		fileSha256: string,
		rows: FinancialCsvRow[],
	) => Promise<string>;
	updatePolicy: (
		policy: FinancialDisclosurePolicy["treatments"],
	) => Promise<void>;
	updateTransaction: (transaction: FinancialTransaction) => Promise<void>;
	setAccountIncluded: (accountId: string, included: boolean) => Promise<void>;
	saveReconciliation: (input: {
		periodId: string;
		accountId: string;
		openingBalanceMinor: number;
		closingBalanceMinor: number;
		publicExplanation?: string;
	}) => Promise<void>;
	publish: (periodId: string, limitation?: string) => Promise<void>;
	configureWallet: (input: {
		displayName: string;
		publicLabel: string;
		network: "devnet" | "mainnet-beta";
		ownerAddress: string;
		mintAddress: string;
	}) => Promise<void>;
	syncWallet: (connectionId: string) => Promise<void>;
	updateSettings: (
		enabled: boolean,
		network: "devnet" | "mainnet-beta",
	) => Promise<void>;
};

export function FinancialPage() {
	const platform = usePlatform();
	const viewer = platform.members.find(
		(member) => member.id === platform.viewerId,
	);
	if (viewer?.role === "verified-member") {
		return (
			<PublicFinancialPage organizationSlug={platform.organization.slug} />
		);
	}
	if (clientConfig.convexConfigured && import.meta.env.MODE !== "test") {
		return <LiveFinancialPage />;
	}
	return <PreviewFinancialPage />;
}

function LiveFinancialPage() {
	const platform = usePlatform();
	const demoSessionToken = platform.demoSessionToken;
	const raw = useQuery(api.finance.workspace, { demoSessionToken });
	const ensureSeeded = useMutation(api.finance.ensureDemoSeeded);
	const seeded = useRef(false);
	const createAccount = useMutation(api.finance.createAccount);
	const importCsv = useMutation(api.finance.importCsv);
	const updatePolicy = useMutation(api.finance.updatePolicy);
	const updateTransaction = useMutation(api.finance.updateTransaction);
	const setAccountIncluded = useMutation(api.finance.setAccountIncluded);
	const saveReconciliation = useMutation(api.finance.saveReconciliation);
	const publish = useMutation(api.finance.publishPeriod);
	const configureWallet = useMutation(api.finance.configureWallet);
	const syncWallet = useAction(api.finance.syncSolana);
	const updateSettings = useMutation(api.finance.updateSettings);

	useEffect(() => {
		if (!raw || raw.accounts.length || seeded.current) return;
		seeded.current = true;
		void ensureSeeded({ demoSessionToken });
	}, [demoSessionToken, ensureSeeded, raw]);

	if (!raw || !raw.policy || !raw.organization) {
		return <FinancialLoading />;
	}
	const workspace = mapLiveWorkspace(raw);
	const actions: FinancialActions = {
		createAccount: async (input) => {
			await createAccount({ ...input, included: true, demoSessionToken });
		},
		importCsv: async (fileName, fileSha256, rows) => {
			const result = await importCsv({
				demoSessionToken,
				fileName,
				fileSha256,
				rows: rows.map((row, index) => ({
					row: index + 2,
					transactionId: row.transaction_id,
					account: row.account,
					postedAt: Date.parse(row.date),
					direction: row.direction,
					amount: row.amount,
					currency: row.currency,
					description: row.description,
					category: row.category,
					fund: row.fund,
					state: row.status,
				})),
			});
			return `${result.inserted} inserted · ${result.updated} updated · ${result.duplicates} duplicate · ${result.errors.length} errors`;
		},
		updatePolicy: async (treatments) => {
			await updatePolicy({ demoSessionToken, treatments });
		},
		updateTransaction: async (transaction) => {
			await updateTransaction({
				demoSessionToken,
				transactionId: transaction.id as Id<"financialTransactions">,
				fundId: transaction.fundId as Id<"financialFunds">,
				category: transaction.category,
				sensitivity: transaction.sensitivity,
				reportingAmountMinor: transaction.reportingAmountMinor ?? 0,
				publicDescription: transaction.publicDescription,
				publicCounterparty: transaction.publicCounterparty,
			});
		},
		setAccountIncluded: async (accountId, included) => {
			await setAccountIncluded({
				demoSessionToken,
				accountId: accountId as Id<"financialAccounts">,
				included,
			});
		},
		saveReconciliation: async (input) => {
			await saveReconciliation({
				demoSessionToken,
				periodId: input.periodId as Id<"financialPeriods">,
				accountId: input.accountId as Id<"financialAccounts">,
				openingBalanceMinor: input.openingBalanceMinor,
				closingBalanceMinor: input.closingBalanceMinor,
				publicExplanation: input.publicExplanation,
			});
		},
		publish: async (periodId, publicLimitation) => {
			await publish({
				demoSessionToken,
				periodId: periodId as Id<"financialPeriods">,
				publicLimitation,
			});
		},
		configureWallet: async (input) => {
			await configureWallet({ ...input, included: true, demoSessionToken });
		},
		syncWallet: async (connectionId) => {
			await syncWallet({
				demoSessionToken,
				connectionId: connectionId as Id<"financialConnections">,
			});
		},
		updateSettings: async (anchoringEnabled, anchoringNetwork) => {
			await updateSettings({
				demoSessionToken,
				anchoringEnabled,
				anchoringNetwork,
			});
		},
	};
	return (
		<FinancialWorkspaceView
			workspace={workspace}
			actions={actions}
			organizationSlug={raw.organization.slug}
			publisherName={
				platform.members.find((member) => member.id === platform.viewerId)
					?.name ?? "Publisher"
			}
		/>
	);
}

function PreviewFinancialPage() {
	const platform = usePlatform();
	const [workspace, setWorkspace] = useState(loadLocalFinancialWorkspace);
	const update = (next: FinancialWorkspace) => {
		setWorkspace(next);
		saveLocalFinancialWorkspace(next);
	};
	const actions: FinancialActions = {
		createAccount: async (input) => {
			if (
				workspace.accounts.some((account) => account.name === input.name.trim())
			) {
				throw new Error("An account with this name already exists");
			}
			update({
				...workspace,
				accounts: [
					...workspace.accounts,
					{
						id: crypto.randomUUID(),
						name: input.name.trim(),
						publicLabel: input.publicLabel.trim(),
						kind: input.kind,
						source: input.kind === "cash" ? "demo" : "csv",
						currency: "USD",
						decimals: 2,
						included: true,
						lastFour: input.lastFour,
						health: "healthy",
					},
				],
			});
		},
		importCsv: async (_fileName, _fileSha256, rows) => {
			const result = importLocalCsv(workspace, rows);
			update(result.workspace);
			return `${result.inserted} inserted · ${result.updated} updated · ${result.duplicates} duplicate · ${result.errors.length} errors`;
		},
		updatePolicy: async (treatments) =>
			update(updateLocalPolicy(workspace, treatments)),
		updateTransaction: async (transaction) =>
			update({
				...workspace,
				transactions: workspace.transactions.map((item) =>
					item.id === transaction.id
						? {
								...transaction,
								state:
									transaction.state === "review-required"
										? "posted"
										: transaction.state,
							}
						: item,
				),
			}),
		setAccountIncluded: async (accountId, included) =>
			update({
				...workspace,
				accounts: workspace.accounts.map((account) =>
					account.id === accountId ? { ...account, included } : account,
				),
			}),
		saveReconciliation: async (input) => {
			const current = workspace.reconciliations.find(
				(item) =>
					item.periodId === input.periodId &&
					item.accountId === input.accountId,
			);
			const next = {
				id: current?.id ?? crypto.randomUUID(),
				...input,
				status: "incomplete" as const,
			};
			update({
				...workspace,
				reconciliations: [
					...workspace.reconciliations.filter(
						(item) =>
							!(
								item.periodId === input.periodId &&
								item.accountId === input.accountId
							),
					),
					next,
				],
			});
		},
		publish: async (periodId, limitation) =>
			update(
				await publishLocalPeriod(
					workspace,
					periodId,
					platform.members.find((member) => member.id === platform.viewerId)
						?.name ?? "Publisher",
					limitation,
				),
			),
		configureWallet: async (input) => {
			const id = crypto.randomUUID();
			update({
				...workspace,
				accounts: [
					...workspace.accounts,
					{
						id,
						name: input.displayName,
						publicLabel: input.publicLabel,
						kind: "wallet",
						source: "solana",
						currency: "USDC",
						decimals: 6,
						included: true,
						network: input.network,
						ownerAddress: input.ownerAddress,
						mintAddress: input.mintAddress,
						health: "healthy",
						simulated: true,
					},
				],
			});
		},
		syncWallet: async () => {
			throw new Error("Live Solana sync requires the integrations service");
		},
		updateSettings: async (anchoringEnabled, anchoringNetwork) =>
			update({ ...workspace, anchoringEnabled, anchoringNetwork }),
	};
	return (
		<FinancialWorkspaceView
			workspace={workspace}
			actions={actions}
			organizationSlug={platform.organization.slug}
			publisherName={
				platform.members.find((member) => member.id === platform.viewerId)
					?.name ?? "Publisher"
			}
		/>
	);
}

function FinancialWorkspaceView({
	workspace,
	actions,
	organizationSlug,
	publisherName,
}: {
	workspace: FinancialWorkspace;
	actions: FinancialActions;
	organizationSlug: string;
	publisherName: string;
}) {
	const [tab, setTab] = useState<Tab>("overview");
	const [notice, setNotice] = useState("");
	const [error, setError] = useState("");
	const currentPeriod =
		workspace.periods.find((period) => period.status !== "published") ??
		workspace.periods[0];
	const periodTransactions = currentPeriod
		? workspace.transactions.filter(
				(transaction) =>
					transaction.postedAt >= currentPeriod.startAt &&
					transaction.postedAt <= currentPeriod.endAt &&
					transaction.state !== "removed",
			)
		: [];
	const inbound = total(periodTransactions, "inbound");
	const outbound = total(periodTransactions, "outbound");
	const reconciled = currentPeriod
		? reconciliationForPeriod(
				currentPeriod,
				workspace.accounts,
				workspace.transactions,
				workspace.reconciliations,
			)
		: [];

	async function run(operation: () => Promise<void>, success: string) {
		setError("");
		setNotice("");
		try {
			await operation();
			setNotice(success);
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "The operation failed",
			);
		}
	}

	async function runWithMessage(operation: () => Promise<string>) {
		setError("");
		setNotice("");
		try {
			setNotice(await operation());
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "The operation failed",
			);
		}
	}

	return (
		<div className="dashboard-page mx-auto w-full max-w-[2200px] px-4 py-8 sm:px-6 lg:px-8">
			<header className="flex flex-col gap-5 border-b border-[#d0d7de] pb-6 lg:flex-row lg:items-end lg:justify-between">
				<div>
					<p className="text-sm font-semibold text-[#1a7f37]">
						Financial transparency
					</p>
					<h1 className="mt-1 text-3xl font-semibold tracking-[-0.025em]">
						Glass ledger
					</h1>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-[#656d76]">
						Reconcile every declared account, choose safe disclosure boundaries,
						and publish a verifiable view of money in and money out.
					</p>
				</div>
				<a
					href={`/public/${organizationSlug}/financials`}
					target="_blank"
					rel="noreferrer"
					className="secondary-button inline-flex items-center gap-2 rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold shadow-sm"
				>
					<Globe2 className="size-4" /> View public financials
				</a>
			</header>

			<nav
				className="mt-5 flex gap-1 overflow-x-auto border-b border-[#d0d7de]"
				aria-label="Financial sections"
			>
				{(
					[
						"overview",
						"transactions",
						"accounts",
						"disclosure",
						"publications",
					] as Tab[]
				).map((item) => (
					<button
						key={item}
						type="button"
						onClick={() => setTab(item)}
						className={`border-b-2 px-4 py-3 text-sm font-semibold capitalize ${tab === item ? "border-[#fd8c73] text-[#1f2328]" : "border-transparent text-[#656d76]"}`}
					>
						{item === "accounts" ? "Accounts & imports" : item}
					</button>
				))}
			</nav>
			{notice && (
				<p className="mt-4 rounded-md border border-[#1a7f37]/30 bg-[#dafbe1] px-4 py-3 text-sm text-[#116329]">
					{notice}
				</p>
			)}
			{error && (
				<p className="mt-4 rounded-md border border-[#cf222e]/30 bg-[#ffebe9] px-4 py-3 text-sm text-[#cf222e]">
					{error}
				</p>
			)}

			{tab === "overview" && (
				<OverviewTab
					workspace={workspace}
					period={currentPeriod}
					transactions={periodTransactions}
					inbound={inbound}
					outbound={outbound}
					reconciliations={reconciled}
				/>
			)}
			{tab === "transactions" && (
				<TransactionsTab
					workspace={workspace}
					onSave={(transaction) =>
						run(
							() => actions.updateTransaction(transaction),
							"Transaction review saved.",
						)
					}
				/>
			)}
			{tab === "accounts" && (
				<AccountsTab
					workspace={workspace}
					onCreate={(input) =>
						run(
							() => actions.createAccount(input),
							"Account added to declared coverage.",
						)
					}
					onImport={(fileName, hash, rows) =>
						runWithMessage(() => actions.importCsv(fileName, hash, rows))
					}
					onToggle={(id, included) =>
						run(
							() => actions.setAccountIncluded(id, included),
							"Account coverage updated.",
						)
					}
					onWallet={(input) =>
						run(
							() => actions.configureWallet(input),
							"Read-only wallet connected.",
						)
					}
					onSync={(connectionId) =>
						run(() => actions.syncWallet(connectionId), "Wallet synchronized.")
					}
				/>
			)}
			{tab === "disclosure" && (
				<DisclosureTab
					policy={workspace.policy}
					onSave={(policy) =>
						run(
							() => actions.updatePolicy(policy),
							"Disclosure policy version saved.",
						)
					}
				/>
			)}
			{tab === "publications" && currentPeriod && (
				<PublicationsTab
					workspace={workspace}
					period={currentPeriod}
					publisherName={publisherName}
					onReconcile={(input) =>
						run(
							() => actions.saveReconciliation(input),
							"Reconciliation saved.",
						)
					}
					onPublish={(periodId, limitation) =>
						run(
							() => actions.publish(periodId, limitation),
							"Financial snapshot published.",
						)
					}
					onSettings={(enabled, network) =>
						run(
							() => actions.updateSettings(enabled, network),
							"Verification settings saved.",
						)
					}
				/>
			)}
		</div>
	);
}

function OverviewTab({
	workspace,
	period,
	transactions,
	inbound,
	outbound,
	reconciliations,
}: {
	workspace: FinancialWorkspace;
	period?: FinancialPeriod;
	transactions: FinancialTransaction[];
	inbound: number;
	outbound: number;
	reconciliations: ReturnType<typeof reconciliationForPeriod>;
}) {
	const reviewCount = transactions.filter(
		(transaction) => transaction.state === "review-required",
	).length;
	return (
		<div className="mt-6">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="text-lg font-semibold">
					{period?.label ?? "Current period"}
				</h2>
				<span className="text-xs text-[#656d76]">USD reporting basis</span>
			</div>
			<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<FinanceMetric
					icon={ArrowDownLeft}
					label="Inbound"
					value={formatReportingMoney(inbound)}
					detail={`${transactions.filter((item) => item.direction === "inbound").length} transactions`}
				/>
				<FinanceMetric
					icon={ArrowUpRight}
					label="Expenditure"
					value={formatReportingMoney(outbound)}
					detail={`${transactions.filter((item) => item.direction === "outbound").length} transactions`}
				/>
				<FinanceMetric
					icon={Banknote}
					label="Net movement"
					value={formatReportingMoney(inbound - outbound)}
					detail="Across included accounts"
				/>
				<FinanceMetric
					icon={ShieldCheck}
					label="Coverage"
					value={`${workspace.accounts.filter((account) => account.included).length}/${workspace.accounts.length}`}
					detail="Declared accounts included"
				/>
			</section>
			<div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<section className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
					<div className="border-b border-[#d8dee4] px-4 py-3">
						<h3 className="font-semibold">
							Account coverage and reconciliation
						</h3>
					</div>
					{workspace.accounts.map((account) => {
						const reconciliation = reconciliations.find(
							(item) => item.accountId === account.id,
						);
						return (
							<div
								key={account.id}
								className="flex items-center gap-3 border-b border-[#d8dee4] p-4 last:border-0"
							>
								<span className="grid size-9 place-items-center rounded-md bg-[#ddf4ff] text-[#0969da]">
									<Landmark className="size-4" />
								</span>
								<div className="min-w-0 flex-1">
									<p className="font-semibold">{account.publicLabel}</p>
									<p className="text-xs text-[#656d76]">
										{account.source} · {account.health}
										{account.lastSuccessfulSyncAt
											? ` · fresh ${new Date(account.lastSuccessfulSyncAt).toLocaleDateString()}`
											: ""}
									</p>
								</div>
								<span
									className={`text-xs font-semibold ${!account.included ? "text-[#656d76]" : reconciliation?.status === "reconciled" ? "text-[#1a7f37]" : "text-[#9a6700]"}`}
								>
									{!account.included
										? "Excluded"
										: (reconciliation?.status ?? "Incomplete")}
								</span>
							</div>
						);
					})}
				</section>
				<aside className="space-y-4">
					<div
						className={`rounded-md border p-4 ${reviewCount ? "border-[#d4a72c] bg-[#fff8c5]" : "border-[#1a7f37]/30 bg-[#dafbe1]"}`}
					>
						<div className="flex items-center gap-2">
							{reviewCount ? (
								<AlertTriangle className="size-5 text-[#9a6700]" />
							) : (
								<CheckCircle2 className="size-5 text-[#1a7f37]" />
							)}
							<strong>
								{reviewCount
									? `${reviewCount} need review`
									: "Transactions reviewed"}
							</strong>
						</div>
						<p className="mt-2 text-sm text-[#656d76]">
							USDC entries require a category, fund, sensitivity, and confirmed
							USD value before publication.
						</p>
					</div>
					<div className="rounded-md border border-[#d0d7de] bg-white p-4">
						<strong>Public snapshots</strong>
						<p className="mt-2 text-3xl font-semibold">
							{workspace.snapshots.length}
						</p>
						<p className="text-sm text-[#656d76]">
							Append-only published versions
						</p>
					</div>
				</aside>
			</div>
		</div>
	);
}

function TransactionsTab({
	workspace,
	onSave,
}: {
	workspace: FinancialWorkspace;
	onSave: (transaction: FinancialTransaction) => void;
}) {
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<FinancialTransaction>();
	const filtered = workspace.transactions.filter((transaction) =>
		`${transaction.rawDescription} ${transaction.category}`
			.toLowerCase()
			.includes(query.toLowerCase()),
	);
	return (
		<div className="mt-6">
			<div className="mb-3 flex items-center justify-between gap-3">
				<h2 className="text-lg font-semibold">Private transaction workspace</h2>
				<input
					aria-label="Filter transactions"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					className="w-72 rounded-md border border-[#d0d7de] px-3 py-2 text-sm"
					placeholder="Filter transactions"
				/>
			</div>
			<div className="overflow-x-auto rounded-md border border-[#d0d7de] bg-white">
				<table className="w-full min-w-[850px] text-left text-sm">
					<thead className="bg-[#f6f8fa] text-xs text-[#656d76]">
						<tr>
							<th className="px-4 py-3">Date</th>
							<th>Description</th>
							<th>Category / fund</th>
							<th>Source</th>
							<th>Status</th>
							<th className="px-4 text-right">Amount</th>
						</tr>
					</thead>
					<tbody>
						{filtered.map((transaction) => {
							const fund = workspace.funds.find(
								(item) => item.id === transaction.fundId,
							);
							return (
								<tr
									key={transaction.id}
									className="cursor-pointer border-t border-[#d8dee4] hover:bg-[#f6f8fa]"
									onClick={() => setSelected({ ...transaction })}
								>
									<td className="px-4 py-3 text-[#656d76]">
										{new Date(transaction.postedAt).toLocaleDateString()}
									</td>
									<td>
										<strong>{transaction.rawDescription}</strong>
										<small className="block text-[#656d76]">
											Public: {transaction.publicDescription || "Not set"}
										</small>
									</td>
									<td>
										{transaction.category}
										<small className="block text-[#656d76]">{fund?.name}</small>
									</td>
									<td>{transaction.source}</td>
									<td>
										<span
											className={
												transaction.state === "review-required"
													? "font-semibold text-[#9a6700]"
													: "text-[#656d76]"
											}
										>
											{transaction.state}
										</span>
									</td>
									<td
										className={`px-4 text-right font-mono font-semibold ${transaction.direction === "inbound" ? "text-[#1a7f37]" : ""}`}
									>
										{transaction.direction === "inbound" ? "+" : "−"}
										{transaction.reportingAmountMinor === undefined
											? `${transaction.amountBaseUnits / 10 ** transaction.decimals} ${transaction.currency}`
											: formatReportingMoney(transaction.reportingAmountMinor)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
			{selected && (
				<TransactionDialog
					transaction={selected}
					funds={workspace.funds}
					onClose={() => setSelected(undefined)}
					onSave={(transaction) => {
						onSave(transaction);
						setSelected(undefined);
					}}
				/>
			)}
		</div>
	);
}

function TransactionDialog({
	transaction,
	funds,
	onClose,
	onSave,
}: {
	transaction: FinancialTransaction;
	funds: FinancialWorkspace["funds"];
	onClose: () => void;
	onSave: (value: FinancialTransaction) => void;
}) {
	const [value, setValue] = useState(transaction);
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-[#1f2328]/45 p-4">
			<button
				className="absolute inset-0"
				type="button"
				onClick={onClose}
				aria-label="Close transaction review"
			/>
			<form
				className="relative w-full max-w-xl rounded-lg bg-white shadow-2xl"
				onSubmit={(event) => {
					event.preventDefault();
					onSave(value);
				}}
			>
				<div className="border-b border-[#d8dee4] p-5">
					<h2 className="text-lg font-semibold">Review transaction</h2>
					<p className="mt-1 text-sm text-[#656d76]">
						Private source: {value.rawDescription}
					</p>
				</div>
				<div className="grid gap-4 p-5 sm:grid-cols-2">
					<label className="grid gap-1 text-sm font-semibold">
						Category
						<input
							value={value.category}
							onChange={(event) =>
								setValue({ ...value, category: event.target.value })
							}
							className="rounded-md border px-3 py-2 font-normal"
						/>
					</label>
					<label className="grid gap-1 text-sm font-semibold">
						Fund
						<select
							value={value.fundId}
							onChange={(event) =>
								setValue({ ...value, fundId: event.target.value })
							}
							className="rounded-md border px-3 py-2 font-normal"
						>
							{funds.map((fund) => (
								<option key={fund.id} value={fund.id}>
									{fund.name}
								</option>
							))}
						</select>
					</label>
					<label className="grid gap-1 text-sm font-semibold">
						Sensitivity
						<select
							value={value.sensitivity}
							onChange={(event) =>
								setValue({
									...value,
									sensitivity: event.target.value as FinancialSensitivity,
								})
							}
							className="rounded-md border px-3 py-2 font-normal"
						>
							{SENSITIVITIES.map((item) => (
								<option key={item} value={item}>
									{item}
								</option>
							))}
						</select>
					</label>
					<label className="grid gap-1 text-sm font-semibold">
						USD reporting value
						<input
							type="number"
							min="0"
							step="0.01"
							value={(value.reportingAmountMinor ?? 0) / 100}
							onChange={(event) =>
								setValue({
									...value,
									reportingAmountMinor: Math.round(
										Number(event.target.value) * 100,
									),
								})
							}
							className="rounded-md border px-3 py-2 font-normal"
						/>
					</label>
					<label className="grid gap-1 text-sm font-semibold sm:col-span-2">
						Public description
						<input
							value={value.publicDescription}
							onChange={(event) =>
								setValue({ ...value, publicDescription: event.target.value })
							}
							className="rounded-md border px-3 py-2 font-normal"
						/>
					</label>
					<label className="grid gap-1 text-sm font-semibold sm:col-span-2">
						Public counterparty (ordinary activity only)
						<input
							value={value.publicCounterparty ?? ""}
							onChange={(event) =>
								setValue({
									...value,
									publicCounterparty: event.target.value || undefined,
								})
							}
							className="rounded-md border px-3 py-2 font-normal"
						/>
					</label>
				</div>
				<div className="flex justify-end gap-2 border-t border-[#d8dee4] p-4">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border px-3 py-2 text-sm font-semibold"
					>
						Cancel
					</button>
					<button
						type="submit"
						className="rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white"
					>
						Save review
					</button>
				</div>
			</form>
		</div>
	);
}

function AccountsTab({
	workspace,
	onCreate,
	onImport,
	onToggle,
	onWallet,
	onSync,
}: {
	workspace: FinancialWorkspace;
	onCreate: FinancialActions["createAccount"];
	onImport: (fileName: string, hash: string, rows: FinancialCsvRow[]) => void;
	onToggle: (id: string, included: boolean) => void;
	onWallet: (input: {
		displayName: string;
		publicLabel: string;
		network: "devnet" | "mainnet-beta";
		ownerAddress: string;
		mintAddress: string;
	}) => void;
	onSync: (connectionId: string) => void;
}) {
	const [preview, setPreview] = useState<{
		file: File;
		rows: FinancialCsvRow[];
		errors: Array<{ row: number; message: string }>;
	}>();
	const [walletOpen, setWalletOpen] = useState(false);
	const [accountOpen, setAccountOpen] = useState(false);
	return (
		<div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
			<section>
				<div className="mb-3 flex items-center justify-between">
					<h2 className="text-lg font-semibold">Declared accounts</h2>
					<button
						type="button"
						onClick={() => setAccountOpen(true)}
						className="rounded-md border px-3 py-2 text-sm font-semibold"
					>
						Add account
					</button>
				</div>
				<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
					{workspace.accounts.map((account) => (
						<div
							key={account.id}
							className="flex items-center gap-3 border-b border-[#d8dee4] p-4 last:border-0"
						>
							<WalletCards className="size-5 text-[#0969da]" />
							<div className="min-w-0 flex-1">
								<strong>{account.name}</strong>
								<p className="text-xs text-[#656d76]">
									Public as “{account.publicLabel}” · {account.currency} ·{" "}
									{account.source}
								</p>
								{account.ownerAddress && (
									<p className="mt-1 truncate font-mono text-[10px] text-[#8c959f]">
										{account.ownerAddress}
									</p>
								)}
							</div>
							{account.source === "solana" &&
								!account.simulated &&
								account.id.includes(":") && (
									<button
										type="button"
										onClick={() => onSync(account.id.split(":")[1])}
										className="rounded-md border p-2"
										aria-label={`Sync ${account.name}`}
									>
										<RefreshCw className="size-4" />
									</button>
								)}
							<label className="flex items-center gap-2 text-xs font-semibold">
								<input
									type="checkbox"
									checked={account.included}
									onChange={(event) =>
										onToggle(account.id.split(":")[0], event.target.checked)
									}
								/>{" "}
								In public scope
							</label>
						</div>
					))}
				</div>
			</section>
			<aside className="space-y-4">
				<section className="rounded-md border border-[#d0d7de] bg-white p-4">
					<div className="flex items-center gap-2">
						<FileUp className="size-5 text-[#0969da]" />
						<h2 className="font-semibold">Import CSV</h2>
					</div>
					<p className="mt-2 text-sm text-[#656d76]">
						Preview and validate up to 500 transactions before importing.
					</p>
					<input
						className="mt-4 block w-full text-sm"
						aria-label="Financial CSV"
						type="file"
						accept=".csv,text/csv"
						onChange={async (event) => {
							const file = event.target.files?.[0];
							if (!file) return;
							const parsed = parseFinancialCsv(await file.text());
							setPreview({ file, ...parsed });
						}}
					/>
					{preview && (
						<div className="mt-3 rounded-md bg-[#f6f8fa] p-3 text-xs">
							<p>
								<strong>{preview.rows.length}</strong> valid rows ·{" "}
								<strong>{preview.errors.length}</strong> errors
							</p>
							{preview.errors.slice(0, 3).map((error) => (
								<p
									key={`${error.row}:${error.message}`}
									className="mt-1 text-[#cf222e]"
								>
									Row {error.row}: {error.message}
								</p>
							))}
							<button
								disabled={
									!preview.rows.length || Boolean(preview.errors.length)
								}
								type="button"
								onClick={async () =>
									onImport(
										preview.file.name,
										await fileSha256(preview.file),
										preview.rows,
									)
								}
								className="mt-3 rounded-md bg-[#1f883d] px-3 py-2 font-semibold text-white disabled:opacity-50"
							>
								Import valid rows
							</button>
						</div>
					)}
				</section>
				<section className="rounded-md border border-[#d0d7de] bg-white p-4">
					<div className="flex items-center gap-2">
						<WalletCards className="size-5 text-[#7c3aed]" />
						<h2 className="font-semibold">Read-only USDC wallet</h2>
					</div>
					<p className="mt-2 text-sm text-[#656d76]">
						TieCamel indexes native USDC. It never receives a private key or
						signs transfers.
					</p>
					<button
						type="button"
						onClick={() => setWalletOpen(true)}
						className="mt-3 rounded-md border px-3 py-2 text-sm font-semibold"
					>
						Connect wallet
					</button>
				</section>
			</aside>
			{accountOpen && (
				<AccountDialog
					onClose={() => setAccountOpen(false)}
					onSave={(input) => {
						void onCreate(input);
						setAccountOpen(false);
					}}
				/>
			)}
			{walletOpen && (
				<WalletDialog
					onClose={() => setWalletOpen(false)}
					onSave={(input) => {
						onWallet(input);
						setWalletOpen(false);
					}}
				/>
			)}
		</div>
	);
}

function AccountDialog({
	onClose,
	onSave,
}: {
	onClose: () => void;
	onSave: (input: Parameters<FinancialActions["createAccount"]>[0]) => void;
}) {
	const [name, setName] = useState("");
	const [label, setLabel] = useState("");
	const [kind, setKind] =
		useState<Exclude<FinancialAccountKind, "wallet">>("bank");
	const [lastFour, setLastFour] = useState("");
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-[#1f2328]/45 p-4">
			<button
				className="absolute inset-0"
				type="button"
				onClick={onClose}
				aria-label="Close account dialog"
			/>
			<form
				className="relative w-full max-w-lg rounded-lg bg-white shadow-2xl"
				onSubmit={(event) => {
					event.preventDefault();
					void onSave({
						name,
						publicLabel: label,
						kind,
						lastFour: lastFour || undefined,
					});
				}}
			>
				<div className="border-b p-5">
					<h2 className="text-lg font-semibold">Declare a financial account</h2>
					<p className="mt-1 text-sm text-[#656d76]">
						Bank and card activity can be added through validated CSV imports.
					</p>
				</div>
				<div className="grid gap-4 p-5">
					<label className="grid gap-1 text-sm font-semibold">
						Internal name
						<input
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
							className="rounded-md border px-3 py-2 font-normal"
						/>
					</label>
					<label className="grid gap-1 text-sm font-semibold">
						Public label
						<input
							required
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							className="rounded-md border px-3 py-2 font-normal"
						/>
					</label>
					<label className="grid gap-1 text-sm font-semibold">
						Account kind
						<select
							value={kind}
							onChange={(event) => setKind(event.target.value as typeof kind)}
							className="rounded-md border px-3 py-2 font-normal"
						>
							<option value="bank">Bank</option>
							<option value="card">Card</option>
							<option value="cash">Cash</option>
						</select>
					</label>
					{kind !== "cash" && (
						<label className="grid gap-1 text-sm font-semibold">
							Last four digits
							<input
								required
								pattern="[0-9]{4}"
								inputMode="numeric"
								value={lastFour}
								onChange={(event) => setLastFour(event.target.value)}
								className="rounded-md border px-3 py-2 font-normal"
							/>
						</label>
					)}
				</div>
				<div className="flex justify-end gap-2 border-t p-4">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border px-3 py-2 text-sm font-semibold"
					>
						Cancel
					</button>
					<button
						type="submit"
						className="rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white"
					>
						Add account
					</button>
				</div>
			</form>
		</div>
	);
}

function WalletDialog({
	onClose,
	onSave,
}: {
	onClose: () => void;
	onSave: (input: {
		displayName: string;
		publicLabel: string;
		network: "devnet" | "mainnet-beta";
		ownerAddress: string;
		mintAddress: string;
	}) => void;
}) {
	const [network, setNetwork] = useState<"devnet" | "mainnet-beta">("devnet");
	const [name, setName] = useState("");
	const [label, setLabel] = useState("");
	const [owner, setOwner] = useState("");
	const mint =
		network === "devnet"
			? "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
			: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-[#1f2328]/45 p-4">
			<button
				className="absolute inset-0"
				type="button"
				onClick={onClose}
				aria-label="Close wallet dialog"
			/>
			<form
				className="relative w-full max-w-lg rounded-lg bg-white shadow-2xl"
				onSubmit={(event) => {
					event.preventDefault();
					onSave({
						displayName: name,
						publicLabel: label,
						network,
						ownerAddress: owner,
						mintAddress: mint,
					});
				}}
			>
				<div className="border-b p-5">
					<h2 className="text-lg font-semibold">
						Connect read-only USDC wallet
					</h2>
				</div>
				<div className="grid gap-4 p-5">
					<label className="grid gap-1 text-sm font-semibold">
						Internal name
						<input
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
							className="rounded-md border px-3 py-2 font-normal"
						/>
					</label>
					<label className="grid gap-1 text-sm font-semibold">
						Public label
						<input
							required
							value={label}
							onChange={(event) => setLabel(event.target.value)}
							className="rounded-md border px-3 py-2 font-normal"
						/>
					</label>
					<label className="grid gap-1 text-sm font-semibold">
						Network
						<select
							value={network}
							onChange={(event) =>
								setNetwork(event.target.value as typeof network)
							}
							className="rounded-md border px-3 py-2 font-normal"
						>
							<option value="devnet">Devnet</option>
							<option value="mainnet-beta">Mainnet beta</option>
						</select>
					</label>
					<label className="grid gap-1 text-sm font-semibold">
						Owner address
						<input
							required
							value={owner}
							onChange={(event) => setOwner(event.target.value)}
							className="rounded-md border px-3 py-2 font-mono text-xs font-normal"
						/>
					</label>
					<p className="break-all rounded-md bg-[#f6f8fa] p-3 font-mono text-[10px]">
						Native USDC mint: {mint}
					</p>
				</div>
				<div className="flex justify-end gap-2 border-t p-4">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border px-3 py-2 text-sm font-semibold"
					>
						Cancel
					</button>
					<button
						type="submit"
						className="rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white"
					>
						Connect
					</button>
				</div>
			</form>
		</div>
	);
}

function DisclosureTab({
	policy,
	onSave,
}: {
	policy: FinancialDisclosurePolicy;
	onSave: (policy: FinancialDisclosurePolicy["treatments"]) => void;
}) {
	const [treatments, setTreatments] = useState(policy.treatments);
	useEffect(() => setTreatments(policy.treatments), [policy]);
	return (
		<div className="mt-6 max-w-4xl">
			<div className="mb-4">
				<h2 className="text-lg font-semibold">
					Disclosure policy v{policy.version}
				</h2>
				<p className="mt-1 text-sm text-[#656d76]">
					Granularity can change. Protected identities and raw source
					descriptions can never enter a public snapshot.
				</p>
			</div>
			<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
				{SENSITIVITIES.map((sensitivity) => (
					<label
						key={sensitivity}
						className="grid gap-3 border-b border-[#d8dee4] p-4 last:border-0 sm:grid-cols-[12rem_1fr] sm:items-center"
					>
						<span>
							<strong className="capitalize">
								{sensitivity === "beneficiary"
									? "Beneficiary aid"
									: sensitivity}
							</strong>
							<small className="block text-[#656d76]">
								Names always protected
							</small>
						</span>
						<select
							value={treatments[sensitivity]}
							onChange={(event) =>
								setTreatments({
									...treatments,
									[sensitivity]: event.target.value as DisclosureTreatment,
								})
							}
							className="rounded-md border px-3 py-2 text-sm"
						>
							<option value="individual-redacted">
								Individual redacted rows
							</option>
							<option value="period-aggregate">Period aggregate</option>
							<option value="confidential-total">Confidential total</option>
						</select>
					</label>
				))}
			</div>
			<button
				type="button"
				onClick={() => onSave(treatments)}
				className="mt-4 rounded-md bg-[#1f883d] px-4 py-2 text-sm font-semibold text-white"
			>
				Adopt new policy version
			</button>
		</div>
	);
}

function PublicationsTab({
	workspace,
	period,
	publisherName,
	onReconcile,
	onPublish,
	onSettings,
}: {
	workspace: FinancialWorkspace;
	period: FinancialPeriod;
	publisherName: string;
	onReconcile: FinancialActions["saveReconciliation"];
	onPublish: FinancialActions["publish"];
	onSettings: FinancialActions["updateSettings"];
}) {
	const [limitation, setLimitation] = useState(period.publicLimitation ?? "");
	const readiness = snapshotReadiness({
		period,
		accounts: workspace.accounts,
		transactions: workspace.transactions,
		reconciliations: workspace.reconciliations,
		policy: workspace.policy,
	});
	return (
		<div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
			<section>
				<h2 className="mb-3 text-lg font-semibold">Close {period.label}</h2>
				<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
					{workspace.accounts
						.filter((account) => account.included)
						.map((account) => (
							<ReconciliationRow
								key={account.id}
								account={account}
								period={period}
								reconciliation={readiness.reconciliations.find(
									(item) => item.accountId === account.id,
								)}
								onSave={onReconcile}
							/>
						))}
				</div>
				<label className="mt-4 grid gap-1 text-sm font-semibold">
					Public reporting limitation
					<textarea
						value={limitation}
						onChange={(event) => setLimitation(event.target.value)}
						className="min-h-24 rounded-md border px-3 py-2 font-normal"
						placeholder="Optional scope or methodology limitation"
					/>
				</label>
			</section>
			<aside className="space-y-4">
				<div
					className={`rounded-md border p-4 ${readiness.errors.length ? "border-[#d4a72c] bg-[#fff8c5]" : "border-[#1a7f37]/30 bg-[#dafbe1]"}`}
				>
					<strong>
						{readiness.errors.length
							? "Publication checks"
							: "Ready to publish"}
					</strong>
					{readiness.errors.map((error) => (
						<p key={error} className="mt-2 text-sm text-[#9a6700]">
							• {error}
						</p>
					))}
					<p className="mt-3 text-xs text-[#656d76]">
						Publisher: {publisherName}. No second approval is required.
					</p>
					<button
						disabled={Boolean(readiness.errors.length) || !workspace.canPublish}
						type="button"
						onClick={() => onPublish(period.id, limitation)}
						className="mt-4 w-full rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
					>
						Publish immutable snapshot
					</button>
				</div>
				<div className="rounded-md border border-[#d0d7de] bg-white p-4">
					<strong>Independent verification</strong>
					<label className="mt-3 flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={workspace.anchoringEnabled}
							onChange={(event) =>
								onSettings(event.target.checked, workspace.anchoringNetwork)
							}
						/>{" "}
						Anchor future snapshots
					</label>
					<p className="mt-2 text-xs text-[#656d76]">
						{workspace.anchoringNetwork}. A public Memo contains only the
						snapshot hash.
					</p>
				</div>
				<div className="rounded-md border border-[#d0d7de] bg-white p-4">
					<strong>Publication history</strong>
					{workspace.snapshots.map((snapshot) => (
						<div key={snapshot.id} className="mt-3 border-t pt-3 text-sm">
							<span className="font-semibold">
								{snapshot.payload.period.label} · v{snapshot.version}
							</span>
							<code className="mt-1 block truncate text-[10px] text-[#656d76]">
								{snapshot.sha256}
							</code>
							<small className="text-[#1a7f37]">{snapshot.verification}</small>
						</div>
					))}
				</div>
			</aside>
		</div>
	);
}

function ReconciliationRow({
	account,
	period,
	reconciliation,
	onSave,
}: {
	account: FinancialAccount;
	period: FinancialPeriod;
	reconciliation?: ReturnType<typeof reconciliationForPeriod>[number];
	onSave: FinancialActions["saveReconciliation"];
}) {
	const [opening, setOpening] = useState(
		(reconciliation?.openingBalanceMinor ?? 0) / 100,
	);
	const [closing, setClosing] = useState(
		(reconciliation?.closingBalanceMinor ?? 0) / 100,
	);
	const [explanation, setExplanation] = useState(
		reconciliation?.publicExplanation ?? "",
	);
	return (
		<form
			className="grid gap-3 border-b border-[#d8dee4] p-4 last:border-0 lg:grid-cols-[minmax(12rem,1fr)_9rem_9rem_minmax(12rem,1fr)_auto] lg:items-end"
			onSubmit={(event) => {
				event.preventDefault();
				void onSave({
					periodId: period.id,
					accountId: account.id.split(":")[0],
					openingBalanceMinor: Math.round(opening * 100),
					closingBalanceMinor: Math.round(closing * 100),
					publicExplanation: explanation || undefined,
				});
			}}
		>
			<div>
				<strong>{account.publicLabel}</strong>
				<small className="block text-[#656d76]">
					{reconciliation?.status ?? "incomplete"}
					{reconciliation?.differenceMinor
						? ` · ${formatReportingMoney(reconciliation.differenceMinor)} difference`
						: ""}
				</small>
			</div>
			<label className="grid gap-1 text-xs font-semibold">
				Opening
				<input
					type="number"
					step="0.01"
					value={opening}
					onChange={(event) => setOpening(Number(event.target.value))}
					className="rounded-md border px-2 py-2 font-normal"
				/>
			</label>
			<label className="grid gap-1 text-xs font-semibold">
				Statement close
				<input
					type="number"
					step="0.01"
					value={closing}
					onChange={(event) => setClosing(Number(event.target.value))}
					className="rounded-md border px-2 py-2 font-normal"
				/>
			</label>
			<label className="grid gap-1 text-xs font-semibold">
				Public exception explanation
				<input
					value={explanation}
					onChange={(event) => setExplanation(event.target.value)}
					className="rounded-md border px-2 py-2 font-normal"
				/>
			</label>
			<button
				type="submit"
				className="rounded-md border px-3 py-2 text-sm font-semibold"
			>
				Save
			</button>
		</form>
	);
}

function FinanceMetric({
	icon: Icon,
	label,
	value,
	detail,
}: {
	icon: typeof Banknote;
	label: string;
	value: string;
	detail: string;
}) {
	return (
		<article className="rounded-md border border-[#d0d7de] bg-white p-4 shadow-sm">
			<div className="flex items-center gap-2 text-sm font-semibold text-[#656d76]">
				<Icon className="size-4" />
				{label}
			</div>
			<p className="mt-3 text-2xl font-semibold">{value}</p>
			<p className="mt-1 text-xs text-[#656d76]">{detail}</p>
		</article>
	);
}

function FinancialLoading() {
	return (
		<main
			className="grid min-h-[60vh] place-items-center text-sm text-[#656d76]"
			aria-busy="true"
		>
			Preparing financial workspace…
		</main>
	);
}

function total(
	transactions: FinancialTransaction[],
	direction: FinancialTransaction["direction"],
) {
	return transactions
		.filter(
			(transaction) =>
				transaction.direction === direction && transaction.state === "posted",
		)
		.reduce(
			(sum, transaction) => sum + (transaction.reportingAmountMinor ?? 0),
			0,
		);
}

async function fileSha256(file: File) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		await file.arrayBuffer(),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

const SENSITIVITIES: FinancialSensitivity[] = [
	"ordinary",
	"donation",
	"payroll",
	"beneficiary",
	"legal",
	"security",
];

type LiveFinanceWorkspace = FunctionReturnType<typeof api.finance.workspace>;

function mapLiveWorkspace(raw: LiveFinanceWorkspace): FinancialWorkspace {
	const policy = raw.policy;
	if (!policy) throw new Error("A financial disclosure policy is required");
	const connectionById = new Map(
		raw.connections.map((connection) => [String(connection._id), connection]),
	);
	return {
		accounts: raw.accounts.map((account) => {
			const connection = account.connectionId
				? connectionById.get(String(account.connectionId))
				: undefined;
			return {
				id: connection
					? `${account._id}:${connection._id}`
					: String(account._id),
				name: account.name,
				publicLabel: account.publicLabel,
				kind: account.kind,
				source: account.source,
				currency: account.currency,
				decimals: account.decimals,
				included: account.included,
				lastFour: account.lastFour,
				network: connection?.network,
				ownerAddress: connection?.ownerAddress,
				mintAddress: connection?.mintAddress,
				lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt
					? new Date(connection.lastSuccessfulSyncAt).toISOString()
					: account.lastSuccessfulRefreshAt
						? new Date(account.lastSuccessfulRefreshAt).toISOString()
						: undefined,
				health: account.health,
				healthMessage: account.healthMessage ?? connection?.healthMessage,
				simulated: account.simulated,
			};
		}),
		funds: raw.funds.map((fund) => ({
			id: String(fund._id),
			name: fund.name,
			restricted: fund.restricted,
			publicDescription: fund.publicDescription,
		})),
		transactions: raw.transactions.map((transaction) => ({
			id: String(transaction._id),
			accountId: raw.accounts.find(
				(account) => account._id === transaction.accountId,
			)?.connectionId
				? `${transaction.accountId}:${raw.accounts.find((account) => account._id === transaction.accountId)?.connectionId}`
				: String(transaction.accountId),
			externalId: transaction.externalId,
			source: transaction.source,
			postedAt: new Date(transaction.postedAt).toISOString(),
			direction: transaction.direction,
			amountBaseUnits: transaction.amountBaseUnits,
			currency: transaction.currency,
			decimals: transaction.decimals,
			reportingAmountMinor: transaction.reportingAmountMinor,
			state: transaction.state,
			rawDescription: transaction.rawDescription,
			privateCounterparty: transaction.privateCounterparty,
			publicDescription: transaction.publicDescription,
			publicCounterparty: transaction.publicCounterparty,
			category: transaction.category,
			fundId: String(transaction.fundId),
			sensitivity: transaction.sensitivity,
			updatedAt: new Date(transaction.updatedAt).toISOString(),
		})),
		periods: raw.periods.flatMap((period) => {
			if (period.startAt === undefined || period.endAt === undefined) return [];
			return [
				{
					id: String(period._id),
					label: period.period,
					startAt: new Date(period.startAt).toISOString(),
					endAt: new Date(period.endAt).toISOString(),
					status:
						period.status === "published"
							? "published"
							: period.status === "prepared"
								? "prepared"
								: "draft",
					publicLimitation: period.publicLimitation,
				},
			];
		}),
		reconciliations: raw.reconciliations.map((item) => ({
			id: String(item._id),
			periodId: String(item.periodId),
			accountId: raw.accounts.find((account) => account._id === item.accountId)
				?.connectionId
				? `${item.accountId}:${raw.accounts.find((account) => account._id === item.accountId)?.connectionId}`
				: String(item.accountId),
			openingBalanceMinor: item.openingBalanceMinor,
			closingBalanceMinor: item.closingBalanceMinor,
			calculatedClosingMinor: item.calculatedClosingMinor,
			differenceMinor: item.differenceMinor,
			status: item.status,
			publicExplanation: item.publicExplanation,
		})),
		policy: {
			id: String(policy._id),
			version: policy.version,
			treatments: policy.treatments,
			createdAt: new Date(policy.createdAt).toISOString(),
		},
		snapshots: raw.snapshots.map((snapshot) => ({
			id: String(snapshot._id),
			version: snapshot.version,
			sha256: snapshot.sha256,
			payload: snapshot.payload as PublicFinancialSnapshot["payload"],
			verification: snapshot.anchor?.status ?? "local",
			anchor: snapshot.anchor
				? {
						network: snapshot.anchor.network,
						signature: snapshot.anchor.signature,
						explorerUrl: snapshot.anchor.explorerUrl,
						error: snapshot.anchor.error,
					}
				: undefined,
		})),
		anchoringEnabled: raw.settings?.anchoringEnabled ?? false,
		anchoringNetwork: raw.settings?.anchoringNetwork ?? "devnet",
		canManage: raw.canManage,
		canPublish: raw.canPublish,
	};
}

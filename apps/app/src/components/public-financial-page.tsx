import { useQuery } from "convex/react";
import {
	ArrowDownLeft,
	ArrowUpRight,
	CheckCircle2,
	CircleAlert,
	Clock3,
	ExternalLink,
	Landmark,
	LockKeyhole,
	ShieldCheck,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { clientConfig } from "../config/client";
import { loadLocalFinancialWorkspace } from "../finance/local-store";
import { formatReportingMoney } from "../finance/model";
import type { PublicFinancialSnapshot } from "../finance/types";

export function PublicFinancialPage({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	if (clientConfig.convexConfigured && import.meta.env.MODE !== "test") {
		return <LivePublicFinancialPage organizationSlug={organizationSlug} />;
	}
	const workspace = loadLocalFinancialWorkspace();
	const snapshot = workspace.snapshots[0];
	return snapshot ? (
		<PublicSnapshotView
			snapshot={snapshot}
			versions={workspace.snapshots.map((item) => ({
				id: item.id,
				version: item.version,
				sha256: item.sha256,
				publishedAt: item.payload.publishedAt,
			}))}
		/>
	) : (
		<PublicFinancialNotFound />
	);
}

function LivePublicFinancialPage({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const result = useQuery(api.finance.publicLatest, { organizationSlug });
	if (result === undefined) {
		return (
			<main className="grid min-h-screen place-items-center bg-[#f6f8fa] text-sm text-[#656d76]">
				Loading approved financial snapshot…
			</main>
		);
	}
	if (!result) return <PublicFinancialNotFound />;
	const verification = result.verification;
	const snapshot: PublicFinancialSnapshot = {
		id: String(result.id),
		version: result.version,
		sha256: result.sha256,
		payload: result.payload as PublicFinancialSnapshot["payload"],
		verification: verification.status,
		anchor:
			verification.status === "local"
				? undefined
				: {
						network: verification.network,
						signature: verification.signature,
						explorerUrl: verification.explorerUrl,
						error: verification.error,
					},
	};
	return (
		<PublicSnapshotView
			snapshot={snapshot}
			versions={result.versions.map((version) => ({
				...version,
				id: String(version.id),
			}))}
		/>
	);
}

function PublicSnapshotView({
	snapshot,
	versions,
}: {
	snapshot: PublicFinancialSnapshot;
	versions: Array<{
		id: string;
		version: number;
		sha256: string;
		publishedAt: number | string;
	}>;
}) {
	const { payload } = snapshot;
	const confidentialEntries = payload.entries.filter(
		(entry) => entry.kind === "confidential",
	);
	const confidentialInbound = confidentialEntries
		.filter((entry) => entry.direction === "inbound")
		.reduce((sum, entry) => sum + entry.amountMinor, 0);
	const confidentialOutbound = confidentialEntries
		.filter((entry) => entry.direction === "outbound")
		.reduce((sum, entry) => sum + entry.amountMinor, 0);
	return (
		<div className="min-h-screen bg-[#f6f8fa] text-[#1f2328]">
			<header className="border-b border-[#d0d7de] bg-[#24292f] text-white">
				<div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
					<span className="grid size-9 place-items-center">
						<img
							src="/tiecamel-logo.png"
							alt=""
							className="size-9 object-contain"
						/>
					</span>
					<strong>TieCamel</strong>
					<span className="text-white/40">/</span>
					<span>{payload.organization.name}</span>
				</div>
			</header>
			<main className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6">
				<section className="border-b border-[#d0d7de] pb-6">
					<div className="flex flex-wrap items-center gap-2">
						<span className="rounded-full bg-[#dafbe1] px-2.5 py-1 text-xs font-semibold text-[#116329]">
							Approved public snapshot
						</span>
						<span className="text-xs text-[#656d76]">
							Version {snapshot.version} of {versions.length}
						</span>
					</div>
					<h1 className="mt-3 text-3xl font-semibold tracking-[-0.025em]">
						Financial transparency · {payload.period.label}
					</h1>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-[#656d76]">
						Every declared account is named in scope, protected activity remains
						in the totals, and this page is generated only from an immutable
						sanitized snapshot.
					</p>
					<div className="mt-4 flex flex-wrap gap-4 text-xs text-[#656d76]">
						<span>
							Published {formatPublicDateTime(payload.publishedAt)} UTC
						</span>
						<span>Policy v{payload.policyVersion}</span>
						<span>
							{payload.coverage.includedAccounts}/
							{payload.coverage.declaredAccounts} accounts included
						</span>
					</div>
				</section>

				<section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<PublicMetric
						icon={ArrowDownLeft}
						label="Inbound"
						value={formatReportingMoney(payload.totals.inboundMinor)}
					/>
					<PublicMetric
						icon={ArrowUpRight}
						label="Expenditure"
						value={formatReportingMoney(payload.totals.outboundMinor)}
					/>
					<PublicMetric
						icon={Landmark}
						label="Closing balance"
						value={formatReportingMoney(
							payload.reconciliation.closingBalanceMinor,
						)}
					/>
					<PublicMetric
						icon={ShieldCheck}
						label="Reconciliation"
						value={payload.reconciliation.status}
					/>
				</section>

				<div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_21rem]">
					<section>
						<div className="mb-3 flex items-center justify-between">
							<h2 className="font-semibold">Published ledger</h2>
							<span className="text-xs text-[#656d76]">
								{payload.entries.length} disclosed rows
							</span>
						</div>
						<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
							{payload.entries.map((entry) => (
								<article
									key={entry.id}
									className="grid gap-3 border-b border-[#d8dee4] p-4 last:border-0 sm:grid-cols-[6rem_minmax(0,1fr)_8rem] sm:items-center"
								>
									<div className="text-xs text-[#656d76]">
										{entry.date ? (
											formatPublicDate(`${entry.date}T12:00:00.000Z`)
										) : entry.kind === "confidential" ? (
											<span className="inline-flex items-center gap-1">
												<LockKeyhole className="size-3" /> Protected
											</span>
										) : (
											"Period total"
										)}
									</div>
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<strong>{entry.description}</strong>
											{entry.transactionCount > 1 && (
												<span className="rounded-full bg-[#ddf4ff] px-2 py-0.5 text-[10px] font-semibold text-[#0969da]">
													{entry.transactionCount} transactions
												</span>
											)}
										</div>
										<p className="mt-1 text-xs text-[#656d76]">
											{entry.category} · {entry.fund}
											{entry.counterparty ? ` · ${entry.counterparty}` : ""}
										</p>
									</div>
									<div
										className={`text-right font-mono font-semibold ${entry.direction === "inbound" ? "text-[#1a7f37]" : ""}`}
									>
										{entry.direction === "inbound" ? "+" : "−"}
										{formatReportingMoney(entry.amountMinor)}
									</div>
								</article>
							))}
						</div>
					</section>

					<aside className="space-y-4">
						<section className="rounded-md border border-[#d0d7de] bg-white p-4">
							<h2 className="font-semibold">Account coverage</h2>
							{payload.coverage.accounts.map((account) => (
								<div key={account.label} className="mt-3 border-t pt-3">
									<div className="flex items-center justify-between gap-2 text-sm">
										<strong>{account.label}</strong>
										<span
											className={
												account.included ? "text-[#1a7f37]" : "text-[#656d76]"
											}
										>
											{account.included ? "Included" : "Excluded"}
										</span>
									</div>
									<p className="mt-1 text-xs text-[#656d76]">
										{account.kind} · {account.source}
										{account.freshness
											? ` · fresh ${formatPublicDate(account.freshness)}`
											: ""}
									</p>
									{account.closingBalanceMinor !== undefined && (
										<p className="mt-1 text-xs font-semibold">
											Closing{" "}
											{formatReportingMoney(account.closingBalanceMinor)}
										</p>
									)}
								</div>
							))}
						</section>
						{confidentialEntries.length > 0 && (
							<section className="rounded-md border border-[#d0d7de] bg-white p-4">
								<div className="flex items-center gap-2">
									<LockKeyhole className="size-4 text-[#656d76]" />
									<h2 className="font-semibold">Withheld-detail totals</h2>
								</div>
								<p className="mt-2 text-sm text-[#656d76]">
									{confidentialEntries.reduce(
										(sum, entry) => sum + entry.transactionCount,
										0,
									)}{" "}
									protected transactions remain included in the financial
									totals.
								</p>
								<p className="mt-2 text-xs font-semibold">
									{formatReportingMoney(confidentialInbound)} inbound ·{" "}
									{formatReportingMoney(confidentialOutbound)} outbound
								</p>
							</section>
						)}
						<section className="rounded-md border border-[#d0d7de] bg-white p-4">
							<h2 className="font-semibold">Fund movement</h2>
							{payload.funds.map((fund) => (
								<div key={fund.name} className="mt-3 border-t pt-3">
									<div className="flex justify-between gap-2 text-sm">
										<strong>{fund.name}</strong>
										<span>{formatReportingMoney(fund.netMinor)}</span>
									</div>
									<p className="mt-1 text-xs text-[#656d76]">
										{fund.restricted ? "Restricted" : "Unrestricted"} ·{" "}
										{formatReportingMoney(fund.inboundMinor)} in ·{" "}
										{formatReportingMoney(fund.outboundMinor)} out
									</p>
								</div>
							))}
						</section>
						{payload.reconciliation.limitations.length > 0 && (
							<section className="rounded-md border border-[#d4a72c] bg-[#fff8c5] p-4">
								<div className="flex items-center gap-2">
									<CircleAlert className="size-4 text-[#9a6700]" />
									<h2 className="font-semibold">Published limitations</h2>
								</div>
								{payload.reconciliation.limitations.map((limitation) => (
									<p key={limitation} className="mt-2 text-sm text-[#656d76]">
										{limitation}
									</p>
								))}
							</section>
						)}
						<VerificationCard snapshot={snapshot} />
						<section className="rounded-md border border-[#d0d7de] bg-white p-4">
							<h2 className="font-semibold">Snapshot history</h2>
							{versions.map((version) => (
								<div key={version.id} className="mt-3 border-t pt-3 text-xs">
									<div className="flex justify-between gap-2">
										<strong>Version {version.version}</strong>
										<span className="text-[#656d76]">
											{formatPublicDate(version.publishedAt)}
										</span>
									</div>
									<code className="mt-1 block truncate text-[10px] text-[#656d76]">
										{version.sha256}
									</code>
								</div>
							))}
						</section>
					</aside>
				</div>
			</main>
		</div>
	);
}

function VerificationCard({ snapshot }: { snapshot: PublicFinancialSnapshot }) {
	return (
		<section className="rounded-md border border-[#d0d7de] bg-white p-4">
			<div className="flex items-center gap-2">
				{snapshot.verification === "anchored" ? (
					<CheckCircle2 className="size-5 text-[#1a7f37]" />
				) : snapshot.verification === "anchor-failed" ? (
					<CircleAlert className="size-5 text-[#cf222e]" />
				) : snapshot.verification === "local" ? (
					<ShieldCheck className="size-5 text-[#0969da]" />
				) : (
					<Clock3 className="size-5 text-[#9a6700]" />
				)}
				<h2 className="font-semibold">
					{snapshot.verification === "anchored"
						? "Verified on Solana"
						: snapshot.verification === "local"
							? "Locally verified hash"
							: snapshot.verification === "anchor-failed"
								? "Anchor needs attention"
								: "Solana verification pending"}
				</h2>
			</div>
			<p className="mt-2 break-all font-mono text-[10px] text-[#656d76]">
				SHA-256 {snapshot.sha256}
			</p>
			{snapshot.anchor?.explorerUrl && (
				<a
					href={snapshot.anchor.explorerUrl}
					target="_blank"
					rel="noreferrer"
					className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#0969da]"
				>
					Open transaction <ExternalLink className="size-3" />
				</a>
			)}
			{snapshot.anchor?.error && (
				<p className="mt-2 text-xs text-[#cf222e]">{snapshot.anchor.error}</p>
			)}
		</section>
	);
}

function PublicMetric({
	icon: Icon,
	label,
	value,
}: {
	icon: typeof Landmark;
	label: string;
	value: string;
}) {
	return (
		<article className="rounded-md border border-[#d0d7de] bg-white p-4">
			<div className="flex items-center gap-2 text-sm font-semibold text-[#656d76]">
				<Icon className="size-4" />
				{label}
			</div>
			<p className="mt-3 text-xl font-semibold capitalize">{value}</p>
		</article>
	);
}

function PublicFinancialNotFound() {
	return (
		<main className="grid min-h-screen place-items-center bg-[#f6f8fa] p-6 text-center">
			<section>
				<Landmark className="mx-auto size-10 text-[#656d76]" />
				<h1 className="mt-4 text-2xl font-semibold">
					Public financials are not available
				</h1>
				<p className="mt-2 text-sm text-[#656d76]">
					This organization has not published an approved financial snapshot.
				</p>
			</section>
		</main>
	);
}

function formatPublicDate(value: number | string) {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(value));
}

function formatPublicDateTime(value: number | string) {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZone: "UTC",
	}).format(new Date(value));
}

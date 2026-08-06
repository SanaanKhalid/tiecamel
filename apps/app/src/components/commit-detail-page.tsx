import { Link } from "@tanstack/react-router";
import { CheckCircle2, GitCommitHorizontal, ShieldCheck } from "lucide-react";
import { usePlatform } from "../platform/store";
import { EmptyState, RepositoryHeader, relativeDate } from "./platform-ui";

export function CommitDetailPage({
	repositorySlug,
	commitHash,
}: {
	repositorySlug: string;
	commitHash: string;
}) {
	const platform = usePlatform();
	const repository = platform.repositories.find(
		(item) => item.slug === repositorySlug,
	);
	const commit = platform.repositoryCommits.find(
		(item) =>
			item.commitSha256 === commitHash && item.repositoryId === repository?.id,
	);
	if (!repository || !commit) {
		return (
			<div className="p-8">
				<EmptyState
					title="Commit not found"
					detail="This commit is unavailable or outside your repository access."
				/>
			</div>
		);
	}
	const change = platform.changeRequests.find(
		(item) => item.id === commit.changeRequestId,
	);
	const record = platform.records.find((item) =>
		item.versions.some((version) => version.id === commit.recordVersionId),
	);
	const version = record?.versions.find(
		(item) => item.id === commit.recordVersionId,
	);
	const tree = commit.treeManifest
		? (
				JSON.parse(commit.treeManifest) as {
					records: Array<{
						recordId: string;
						recordVersionId: string;
						contentSha256: string;
					}>;
				}
			).records
		: [];
	return (
		<>
			<RepositoryHeader repository={repository} active="history" />
			<main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
				<div className="flex items-start gap-3 border-b border-[#d0d7de] pb-5">
					<GitCommitHorizontal className="mt-1 size-7 text-[#0f766e]" />
					<div>
						<p className="text-xs font-semibold uppercase tracking-wider text-[#656d76]">
							Repository commit {commit.sequence}
						</p>
						<h1 className="mt-1 text-2xl font-semibold">
							{change?.title ?? record?.title ?? "Accepted record update"}
						</h1>
						<p className="mt-2 font-mono text-xs text-[#656d76]">
							{commit.commitSha256}
						</p>
					</div>
				</div>
				<div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
					<section className="space-y-5">
						<div className="rounded-lg border border-[#d0d7de] bg-white p-5">
							<h2 className="font-semibold">Changed record</h2>
							<p className="mt-3 text-lg font-semibold text-[#0969da]">
								{record?.title}
							</p>
							<p className="mt-1 text-sm text-[#656d76]">
								Version {version?.version} · {version?.summary}
							</p>
							<dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
								<Hash
									label="Content SHA-256"
									value={version?.contentSha256 ?? version?.sha256}
								/>
								<Hash
									label="Normalized SHA-256"
									value={version?.normalizedSha256}
								/>
								<Hash label="Tree SHA-256" value={commit.treeSha256} />
								<Hash
									label="Parent commit"
									value={commit.parentCommitSha256 ?? "Root commit"}
								/>
							</dl>
						</div>
						<div className="rounded-lg border border-[#d0d7de] bg-white p-5">
							<h2 className="font-semibold">Repository state at this commit</h2>
							<p className="mt-1 text-sm text-[#656d76]">
								Canonical tree snapshot containing {tree.length} accepted record
								{tree.length === 1 ? "" : "s"}.
							</p>
							<ul className="mt-4 divide-y divide-[#d8dee4] rounded-md border border-[#d8dee4]">
								{tree.map((entry) => {
									const snapshotRecord = platform.records.find(
										(item) => item.id === entry.recordId,
									);
									const snapshotVersion = snapshotRecord?.versions.find(
										(item) => item.id === entry.recordVersionId,
									);
									return (
										<li key={entry.recordId} className="px-3 py-3 text-sm">
											<p className="font-semibold">
												{snapshotRecord?.title ?? "Authorized record"}
											</p>
											<p className="mt-1 font-mono text-xs text-[#656d76]">
												Version {snapshotVersion?.version ?? "historical"} ·{" "}
												{entry.contentSha256}
											</p>
										</li>
									);
								})}
							</ul>
						</div>
						<div className="rounded-lg border border-[#d0d7de] bg-white p-5">
							<h2 className="font-semibold">Approval and checks</h2>
							<div className="mt-3 flex items-center gap-2 text-sm text-[#1a7f37]">
								<CheckCircle2 className="size-4" />
								Exact reviewed revision was accepted{" "}
								{relativeDate(commit.createdAt)}.
							</div>
							{change && (
								<p className="mt-3 text-sm text-[#656d76]">
									{
										change.reviews.filter(
											(review) =>
												review.decision === "approve" && !review.stale,
										).length
									}{" "}
									approvals ·{" "}
									{
										change.checks.filter(
											(check) =>
												check.conclusion === "passed" ||
												check.conclusion === "warning",
										).length
									}{" "}
									completed checks
								</p>
							)}
						</div>
					</section>
					<aside className="rounded-lg border border-[#d0d7de] bg-white p-5 lg:self-start">
						<div className="flex items-center gap-2">
							<ShieldCheck className="size-5 text-[#0f766e]" />
							<h2 className="font-semibold">Solana proof</h2>
						</div>
						<p className="mt-3 text-sm capitalize">
							{commit.anchor?.status ?? "queued"} ·{" "}
							{commit.anchor?.network ?? "devnet"}
						</p>
						{commit.anchor?.explorerUrl && (
							<a
								href={commit.anchor.explorerUrl}
								target="_blank"
								rel="noreferrer"
								className="mt-3 block text-sm font-semibold text-[#0969da] hover:underline"
							>
								Open Solana transaction
							</a>
						)}
						<Link
							to="/verify/$commitHash"
							params={{ commitHash: commit.commitSha256 }}
							className="mt-3 block text-sm font-semibold text-[#0969da] hover:underline"
						>
							Open independent verification
						</Link>
					</aside>
				</div>
			</main>
		</>
	);
}

function Hash({ label, value }: { label: string; value?: string }) {
	return (
		<div>
			<dt className="font-semibold text-[#656d76]">{label}</dt>
			<dd className="mt-1 break-all font-mono text-xs">
				{value ?? "Pending processor output"}
			</dd>
		</div>
	);
}

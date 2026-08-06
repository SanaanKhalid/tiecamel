import { Link } from "@tanstack/react-router";
import {
	Activity,
	CheckCircle2,
	CircleDot,
	Cloud,
	Columns3,
	File,
	FileCheck2,
	FileDiff,
	FolderOpen,
	GitCommitHorizontal,
	HardDrive,
	MessageSquare,
	Plus,
	Search,
	Settings,
	ShieldCheck,
	Users,
	X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { type NewChangeInput, usePlatform } from "../platform/store";
import type { RepositoryRules, RepositoryVisibility } from "../platform/types";
import {
	Avatar,
	ChangeStatusBadge,
	EmptyState,
	IssueStatusBadge,
	LabelPill,
	RepositoryHeader,
	relativeDate,
	VisibilityBadge,
} from "./platform-ui";
import { IssueList, NewIssueDialog } from "./work-platform-page";

export type RepositoryTab =
	| "overview"
	| "issues"
	| "changes"
	| "records"
	| "history"
	| "activity"
	| "settings";

export function RepositoryPage({
	repositorySlug,
	tab,
}: {
	repositorySlug: string;
	tab: RepositoryTab;
}) {
	const platform = usePlatform();
	const repository = platform.repositories.find(
		(item) => item.slug === repositorySlug,
	);
	if (!repository) {
		return (
			<div className="p-8">
				<EmptyState
					title="Repository not found"
					detail="This repository does not exist or is outside your access."
				/>
			</div>
		);
	}

	return (
		<>
			<RepositoryHeader repository={repository} active={tab} />
			<div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
				{tab === "overview" && (
					<RepositoryOverview repositoryId={repository.id} />
				)}
				{tab === "issues" && <RepositoryIssues repositoryId={repository.id} />}
				{tab === "changes" && (
					<RepositoryChanges repositoryId={repository.id} />
				)}
				{tab === "records" && (
					<RepositoryRecords repositoryId={repository.id} />
				)}
				{tab === "history" && (
					<RepositoryHistory repositoryId={repository.id} />
				)}
				{tab === "activity" && (
					<RepositoryActivity repositoryId={repository.id} />
				)}
				{tab === "settings" && (
					<RepositorySettings repositoryId={repository.id} />
				)}
			</div>
		</>
	);
}

function RepositoryHistory({ repositoryId }: { repositoryId: string }) {
	const platform = usePlatform();
	const repository = platform.repositories.find(
		(item) => item.id === repositoryId,
	);
	if (!repository) return null;
	const commits = platform.repositoryCommits
		.filter((commit) => commit.repositoryId === repositoryId)
		.sort((left, right) => right.sequence - left.sequence);
	return (
		<section className="overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
			<header className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
				<h2 className="font-semibold">Repository history</h2>
				<p className="text-xs text-[#656d76]">
					Every accepted record update advances one immutable repository commit.
				</p>
			</header>
			{commits.length === 0 ? (
				<EmptyState
					title="No Git-native commits yet"
					detail="The first newly accepted document will create this repository’s canonical tree and Solana-anchored head. Existing legacy versions remain available under Records."
				/>
			) : (
				<ul className="divide-y divide-[#d8dee4]">
					{commits.map((commit) => {
						const change = platform.changeRequests.find(
							(item) => item.id === commit.changeRequestId,
						);
						const record = platform.records.find((item) =>
							item.versions.some(
								(version) => version.id === commit.recordVersionId,
							),
						);
						return (
							<li key={commit.id} className="flex items-start gap-3 px-4 py-4">
								<GitCommitHorizontal className="mt-0.5 size-5 text-[#0f766e]" />
								<div className="min-w-0 flex-1">
									<Link
										to="/$organization/$repository/commits/$commitHash"
										params={{
											organization: platform.organization.slug,
											repository: repository.slug,
											commitHash: commit.commitSha256,
										}}
										className="font-semibold text-[#0969da] hover:underline"
									>
										{change?.title ?? record?.title ?? "Accepted record update"}
									</Link>
									<p className="mt-1 text-xs text-[#656d76]">
										Commit {commit.commitSha256.slice(0, 12)} · sequence{" "}
										{commit.sequence} · {relativeDate(commit.createdAt)}
									</p>
								</div>
								<span className="rounded-full bg-[#eaeef2] px-2 py-1 text-[11px] font-semibold">
									{commit.anchor?.status ?? "queued"}
								</span>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}

function RepositoryOverview({ repositoryId }: { repositoryId: string }) {
	const platform = usePlatform();
	const repository = platform.repositories.find(
		(item) => item.id === repositoryId,
	);
	if (!repository) return null;
	const issues = platform.issues
		.filter(
			(issue) => issue.repositoryId === repositoryId && issue.state === "open",
		)
		.slice(0, 4);
	const changes = platform.changeRequests
		.filter(
			(change) =>
				change.repositoryId === repositoryId &&
				!["merged", "closed"].includes(change.status),
		)
		.slice(0, 4);
	const records = platform.records
		.filter((record) => record.repositoryId === repositoryId)
		.slice(0, 4);

	return (
		<div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_22rem]">
			<div className="space-y-7">
				<section>
					<div className="mb-3 flex items-center justify-between">
						<h2 className="font-semibold">Open issues</h2>
						<Link
							to="/$organization/$repository/issues"
							params={{
								organization: platform.organization.slug,
								repository: repository.slug,
							}}
							preload="intent"
							className="text-sm font-semibold text-[#0969da] hover:underline"
						>
							View all
						</Link>
					</div>
					<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
						{issues.map((issue) => (
							<Link
								key={issue.id}
								to="/$organization/$repository/issues/$issueNumber"
								params={{
									organization: platform.organization.slug,
									repository: repository.slug,
									issueNumber: String(issue.number),
								}}
								preload="intent"
								className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0 hover:bg-[#f6f8fa]"
							>
								<CircleDot className="mt-0.5 size-4 shrink-0 text-[#1a7f37]" />
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap gap-2">
										<h3 className="font-semibold">{issue.title}</h3>
										<IssueStatusBadge status={issue.status} />
									</div>
									<p className="mt-1 text-xs text-[#656d76]">
										{repository.prefix}-{issue.number} · Updated{" "}
										{relativeDate(issue.updatedAt)}
									</p>
								</div>
								<span className="inline-flex items-center gap-1 text-xs text-[#656d76]">
									<MessageSquare className="size-3.5" /> {issue.commentCount}
								</span>
							</Link>
						))}
					</div>
				</section>

				<section>
					<div className="mb-3 flex items-center justify-between">
						<h2 className="font-semibold">Change requests</h2>
						<Link
							to="/$organization/$repository/changes"
							params={{
								organization: platform.organization.slug,
								repository: repository.slug,
							}}
							preload="intent"
							className="text-sm font-semibold text-[#0969da] hover:underline"
						>
							View all
						</Link>
					</div>
					<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
						{changes.length ? (
							changes.map((change) => (
								<Link
									key={change.id}
									to="/$organization/$repository/changes/$changeNumber"
									params={{
										organization: platform.organization.slug,
										repository: repository.slug,
										changeNumber: String(change.number),
									}}
									preload="intent"
									className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0 hover:bg-[#f6f8fa]"
								>
									<FileDiff className="mt-0.5 size-4 shrink-0 text-[#1a7f37]" />
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<h3 className="font-semibold">{change.title}</h3>
											<ChangeStatusBadge status={change.status} />
										</div>
										<p className="mt-1 text-xs text-[#656d76]">
											#{change.number} opened by{" "}
											{platform.members.find(
												(member) => member.id === change.authorId,
											)?.name ?? "Member"}{" "}
											·{" "}
											{
												change.reviews.filter(
													(review) => review.decision === "approve",
												).length
											}{" "}
											approvals
										</p>
									</div>
								</Link>
							))
						) : (
							<p className="p-5 text-sm text-[#656d76]">
								No changes are waiting for review.
							</p>
						)}
					</div>
				</section>

				<section>
					<div className="mb-3 flex items-center justify-between">
						<h2 className="font-semibold">Recently accepted records</h2>
						<Link
							to="/$organization/$repository/records"
							params={{
								organization: platform.organization.slug,
								repository: repository.slug,
							}}
							preload="intent"
							className="text-sm font-semibold text-[#0969da] hover:underline"
						>
							Browse records
						</Link>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						{records.length ? (
							records.map((record) => (
								<article
									key={record.id}
									className="rounded-md border border-[#d0d7de] bg-white p-4"
								>
									<div className="flex items-start gap-3">
										<FileCheck2 className="mt-0.5 size-5 text-[#0969da]" />
										<div>
											<h3 className="font-semibold">{record.title}</h3>
											<p className="mt-1 text-xs text-[#656d76]">
												{record.collection} · Version {record.versions.length}
											</p>
										</div>
									</div>
								</article>
							))
						) : (
							<p className="text-sm text-[#656d76]">No records accepted yet.</p>
						)}
					</div>
				</section>
			</div>

			<aside className="space-y-4">
				<section className="rounded-md border border-[#d0d7de] bg-white p-4">
					<h2 className="font-semibold">About</h2>
					<p className="mt-2 text-sm leading-5 text-[#656d76]">
						{repository.description}
					</p>
					<div className="mt-4 space-y-2 text-sm">
						<p className="flex items-center gap-2">
							<VisibilityBadge visibility={repository.visibility} />
						</p>
						<p className="flex items-center gap-2 text-[#656d76]">
							<Users className="size-4" /> {repository.rules.minimumApprovals}{" "}
							approvals required
						</p>
						<p className="flex items-center gap-2 text-[#656d76]">
							<ShieldCheck className="size-4" /> Authors cannot self-approve
						</p>
					</div>
				</section>
				<section className="rounded-md border border-[#d0d7de] bg-white p-4">
					<h2 className="font-semibold">Locations</h2>
					<div className="mt-3 flex flex-wrap gap-2">
						{platform.locations.map((location) => (
							<span
								key={location.id}
								className="rounded-full bg-[#eaeef2] px-2.5 py-1 text-xs font-medium"
							>
								{location.shortName}
							</span>
						))}
					</div>
				</section>
			</aside>
		</div>
	);
}

function RepositoryIssues({ repositoryId }: { repositoryId: string }) {
	const platform = usePlatform();
	const [query, setQuery] = useState("");
	const [createOpen, setCreateOpen] = useState(false);
	const issues = platform.issues.filter(
		(issue) =>
			issue.repositoryId === repositoryId &&
			`${issue.title} ${issue.description}`
				.toLowerCase()
				.includes(query.toLowerCase()),
	);
	useEffect(() => {
		if (new URLSearchParams(window.location.search).get("new") === "issue") {
			setCreateOpen(true);
		}
	}, []);
	return (
		<>
			<section className="repository-issues">
				<div className="issue-commandbar flex flex-col gap-3 sm:flex-row">
					<label className="issue-search relative min-w-0 flex-1">
						<span className="issue-search-caption">Find in docket</span>
						<Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8c959f]" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							className="w-full border-0 bg-transparent py-3 pr-3 pl-10 text-sm focus:outline-none"
							placeholder="Title, label, assignee…"
							aria-label="Search repository issues"
						/>
					</label>
					<div className="issue-commandbar-actions flex gap-2">
						<Link
							to="/work"
							search={{ new: undefined }}
							preload="intent"
							className="issue-board-link inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold"
						>
							<Columns3 className="size-4" /> Board
						</Link>
						<button
							type="button"
							onClick={() => setCreateOpen(true)}
							className="issue-new-button inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold"
						>
							<Plus className="size-4" /> New issue
						</button>
					</div>
				</div>
				<IssueList issues={issues} context="repository" />
			</section>
			{createOpen && (
				<NewIssueDialog
					repositoryId={repositoryId}
					onClose={() => setCreateOpen(false)}
				/>
			)}
		</>
	);
}

function RepositoryChanges({ repositoryId }: { repositoryId: string }) {
	const platform = usePlatform();
	const [createOpen, setCreateOpen] = useState(false);
	const changes = platform.changeRequests.filter(
		(change) => change.repositoryId === repositoryId,
	);
	const repository = platform.repositories.find(
		(item) => item.id === repositoryId,
	);
	useEffect(() => {
		if (new URLSearchParams(window.location.search).get("new") === "change") {
			setCreateOpen(true);
		}
	}, []);
	return (
		<>
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-lg font-semibold">Change requests</h2>
					<p className="mt-1 text-sm text-[#656d76]">
						Review documents and structured changes before they become accepted
						records.
					</p>
				</div>
				<button
					type="button"
					onClick={() => setCreateOpen(true)}
					className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white"
				>
					<Plus className="size-4" /> New change
				</button>
			</div>
			<div className="mt-5 overflow-hidden rounded-md border border-[#d0d7de] bg-white">
				<div className="flex items-center gap-5 border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3 text-sm">
					<strong>
						{
							changes.filter((change) =>
								["open", "approved", "changes-requested"].includes(
									change.status,
								),
							).length
						}{" "}
						open
					</strong>
					<span className="text-[#656d76]">
						{changes.filter((change) => change.status === "merged").length}{" "}
						accepted
					</span>
				</div>
				{changes.length ? (
					changes.map((change) => {
						const author = platform.members.find(
							(member) => member.id === change.authorId,
						);
						const labels = platform.labels.filter((label) =>
							change.labelIds.includes(label.id),
						);
						return (
							<Link
								key={change.id}
								to="/$organization/$repository/changes/$changeNumber"
								params={{
									organization: platform.organization.slug,
									repository: repository?.slug ?? "unknown",
									changeNumber: String(change.number),
								}}
								preload="intent"
								className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0 hover:bg-[#f6f8fa]"
							>
								<FileDiff
									className={`mt-0.5 size-5 shrink-0 ${
										change.status === "merged"
											? "text-[#8250df]"
											: "text-[#1a7f37]"
									}`}
								/>
								<div className="min-w-0 flex-1">
									<div className="flex flex-wrap items-center gap-2">
										<h3 className="font-semibold">{change.title}</h3>
										<ChangeStatusBadge status={change.status} />
										{labels.map((label) => (
											<LabelPill key={label.id} label={label} />
										))}
									</div>
									<p className="mt-1 text-xs text-[#656d76]">
										#{change.number} opened by {author?.name} · Updated{" "}
										{relativeDate(change.updatedAt)} · {change.revisions.length}{" "}
										revision
										{change.revisions.length === 1 ? "" : "s"}
									</p>
								</div>
								<div className="hidden items-center gap-3 text-xs text-[#656d76] sm:flex">
									<span className="inline-flex items-center gap-1">
										<CheckCircle2 className="size-3.5" />
										{
											change.reviews.filter(
												(review) => review.decision === "approve",
											).length
										}
									</span>
									<span className="inline-flex items-center gap-1">
										<MessageSquare className="size-3.5" />
										{change.comments.length}
									</span>
								</div>
							</Link>
						);
					})
				) : (
					<p className="p-8 text-center text-sm text-[#656d76]">
						No change requests yet.
					</p>
				)}
			</div>
			{createOpen && repository && (
				<NewChangeDialog
					repositoryId={repository.id}
					onClose={() => setCreateOpen(false)}
				/>
			)}
		</>
	);
}

function RepositoryRecords({ repositoryId }: { repositoryId: string }) {
	const platform = usePlatform();
	const [openingVersionId, setOpeningVersionId] = useState<string>();
	const [documentError, setDocumentError] = useState<string>();
	const records = platform.records.filter(
		(record) => record.repositoryId === repositoryId,
	);
	const grouped: Record<string, typeof records> = {};
	for (const record of records) {
		if (!grouped[record.collection]) {
			grouped[record.collection] = [];
		}
		grouped[record.collection].push(record);
	}
	const openVersion = async (
		version: (typeof records)[number]["versions"][number],
	) => {
		const objectRef =
			version.exactBlobRef ??
			version.azureEvidenceRef ??
			version.files[0]?.azureBlobRef;
		if (!objectRef) {
			setDocumentError(
				"This legacy version does not have managed source bytes.",
			);
			return;
		}
		const preview = window.open("", "_blank", "noopener,noreferrer");
		setOpeningVersionId(version.id);
		setDocumentError(undefined);
		try {
			const url = await platform.requestDocumentUrl(objectRef);
			if (preview) preview.location.href = url;
			else window.location.assign(url);
		} catch (error) {
			preview?.close();
			setDocumentError(
				error instanceof Error
					? error.message
					: "The document could not be opened.",
			);
		} finally {
			setOpeningVersionId(undefined);
		}
	};
	return (
		<div>
			<div className="flex items-end justify-between border-b border-[#d0d7de] pb-4">
				<div>
					<h2 className="text-lg font-semibold">Accepted records</h2>
					<p className="mt-1 text-sm text-[#656d76]">
						Every version is immutable and linked to its approved change
						request.
					</p>
				</div>
				<span className="text-sm text-[#656d76]">{records.length} records</span>
			</div>
			{documentError && (
				<p className="mt-3 text-sm font-medium text-[#cf222e]" role="alert">
					{documentError}
				</p>
			)}
			{records.length ? (
				<div className="mt-6 space-y-7">
					{Object.entries(grouped).map(([collection, collectionRecords]) => (
						<section key={collection}>
							<div className="mb-2 flex items-center gap-2">
								<FolderOpen className="size-4 text-[#656d76]" />
								<h3 className="font-semibold">{collection}</h3>
							</div>
							<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
								{collectionRecords?.map((record) => {
									const version = record.versions.find(
										(item) => item.id === record.currentVersionId,
									);
									return (
										<article
											key={record.id}
											className="grid gap-3 border-b border-[#d8dee4] p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto]"
										>
											<div className="flex gap-3">
												<File className="mt-0.5 size-5 text-[#0969da]" />
												<div>
													<h4 className="font-semibold text-[#0969da]">
														{record.title}
													</h4>
													<p className="mt-1 text-xs text-[#656d76]">
														Version {version?.version} ·{" "}
														{version?.files[0]?.name ?? "Structured record"} ·
														Updated {relativeDate(record.updatedAt)}
													</p>
													<p className="mt-1 text-xs font-medium text-[#656d76]">
														Master:{" "}
														{version?.masterProvider === "google-drive"
															? "Google Drive"
															: version?.masterProvider === "one-drive"
																? "OneDrive for Business"
																: "TieCamel managed storage"}
													</p>
													<details className="mt-3 text-sm">
														<summary className="cursor-pointer font-semibold text-[#0969da]">
															Browse all accepted versions
														</summary>
														<ol className="mt-2 space-y-2 border-l border-[#d0d7de] pl-3">
															{[...record.versions]
																.sort(
																	(left, right) => right.version - left.version,
																)
																.map((item) => {
																	const commit =
																		platform.repositoryCommits.find(
																			(entry) =>
																				entry.recordVersionId === item.id,
																		);
																	return (
																		<li key={item.id}>
																			<span className="font-semibold">
																				Version {item.version}
																			</span>{" "}
																			<span className="text-xs text-[#656d76]">
																				{relativeDate(item.createdAt)} ·{" "}
																				{item.sha256.slice(0, 12)}
																			</span>
																			{commit && (
																				<Link
																					to="/$organization/$repository/commits/$commitHash"
																					params={{
																						organization:
																							platform.organization.slug,
																						repository: repositorySlugFor(
																							platform.repositories,
																							repositoryId,
																						),
																						commitHash: commit.commitSha256,
																					}}
																					className="ml-2 font-semibold text-[#0969da] hover:underline"
																				>
																					Open commit
																				</Link>
																			)}
																			<button
																				type="button"
																				onClick={() => void openVersion(item)}
																				disabled={openingVersionId === item.id}
																				className="ml-2 font-semibold text-[#0969da] hover:underline disabled:text-[#656d76]"
																			>
																				{openingVersionId === item.id
																					? "Opening…"
																					: "Open document"}
																			</button>
																		</li>
																	);
																})}
														</ol>
													</details>
												</div>
											</div>
											<div className="flex items-center gap-2">
												<VisibilityBadge visibility={record.visibility} />
												<span className="rounded-full bg-[#eaeef2] px-2 py-0.5 text-xs font-medium">
													{record.versions.length} version
													{record.versions.length === 1 ? "" : "s"}
												</span>
											</div>
										</article>
									);
								})}
							</div>
						</section>
					))}
				</div>
			) : (
				<div className="mt-5">
					<EmptyState
						title="No accepted records"
						detail="Merge an approved change request to create this repository’s first immutable record."
					/>
				</div>
			)}
		</div>
	);
}

function repositorySlugFor(
	repositories: Array<{ id: string; slug: string }>,
	repositoryId: string,
) {
	return (
		repositories.find((repository) => repository.id === repositoryId)?.slug ??
		"repository"
	);
}

function RepositoryActivity({ repositoryId }: { repositoryId: string }) {
	const platform = usePlatform();
	const events = platform.activity.filter(
		(event) => event.repositoryId === repositoryId,
	);
	return (
		<div className="mx-auto max-w-4xl">
			<div className="flex items-center gap-2 border-b border-[#d0d7de] pb-4">
				<Activity className="size-5 text-[#656d76]" />
				<div>
					<h2 className="text-lg font-semibold">Repository activity</h2>
					<p className="text-sm text-[#656d76]">
						Append-only history for issues, reviews, rules, and accepted
						records.
					</p>
				</div>
			</div>
			<div className="relative mt-6 space-y-5 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-[#d8dee4]">
				{events.map((event) => {
					const member = platform.members.find(
						(item) => item.id === event.actorId,
					);
					return (
						<article key={event.id} className="relative flex gap-4">
							<Avatar member={member} />
							<div className="min-w-0 flex-1 rounded-md border border-[#d0d7de] bg-white p-4">
								<p className="text-sm">
									<strong>{member?.name ?? "TieCamel"}</strong> {event.action}{" "}
									<strong>{event.target}</strong>
								</p>
								<p className="mt-2 text-sm text-[#656d76]">{event.detail}</p>
								<p className="mt-2 text-xs text-[#8c959f]">
									{new Date(event.createdAt).toLocaleString()}
								</p>
							</div>
						</article>
					);
				})}
			</div>
		</div>
	);
}

function RepositorySettings({ repositoryId }: { repositoryId: string }) {
	const platform = usePlatform();
	const viewer = platform.members.find(
		(member) => member.id === platform.viewerId,
	);
	const repository = platform.repositories.find(
		(item) => item.id === repositoryId,
	);
	const [rules, setRules] = useState<RepositoryRules | null>(
		repository ? structuredClone(repository.rules) : null,
	);
	const [profile, setProfile] = useState(
		repository
			? {
					name: repository.name,
					description: repository.description,
					visibility: repository.visibility,
				}
			: null,
	);
	const [rulesNotice, setRulesNotice] = useState("");
	const [profileNotice, setProfileNotice] = useState("");
	const storageConfig = platform.repositoryStorageConfigs.find(
		(config) => config.repositoryId === repositoryId,
	);
	const googleConnection = platform.providerConnections.find(
		(connection) =>
			connection.provider === "google-drive" && connection.status === "healthy",
	);
	const [storageProvider, setStorageProvider] = useState<
		"azure" | "google-drive"
	>(storageConfig?.provider === "google-drive" ? "google-drive" : "azure");
	const [driveId, setDriveId] = useState(
		storageConfig?.driveId ?? "shared-drive-demo",
	);
	const [folderId, setFolderId] = useState(
		storageConfig?.folderId ?? "tiecamel-records-demo",
	);
	const [displayPath, setDisplayPath] = useState(
		storageConfig?.provider === "google-drive"
			? storageConfig.displayPath
			: "ICN Shared Drive / TieCamel Records",
	);
	const [storageNotice, setStorageNotice] = useState("");
	const [baselineFileId, setBaselineFileId] = useState("");
	const [baselineFileName, setBaselineFileName] = useState("");
	const [baselineAttestation, setBaselineAttestation] = useState("");
	const [baselineNotice, setBaselineNotice] = useState("");
	if (!repository || !rules) return null;
	if (!profile) return null;
	if (
		!viewer ||
		!["organization-owner", "organization-admin", "repository-admin"].includes(
			viewer.role,
		)
	) {
		return (
			<EmptyState
				title="Repository administrator access required"
				detail="Storage destinations, visibility, and protection rules can only be changed by an administrator."
			/>
		);
	}
	const activeRepositoryId = repository.id;
	const activeProfile = profile;

	async function saveRules(event: FormEvent) {
		event.preventDefault();
		await platform.updateRepositoryRules(
			activeRepositoryId,
			rules as RepositoryRules,
		);
		setRulesNotice("Protection rules saved.");
	}

	async function saveProfile(event: FormEvent) {
		event.preventDefault();
		await platform.updateRepository(activeRepositoryId, activeProfile);
		setProfileNotice("Repository settings saved.");
	}

	async function saveStorage(event: FormEvent) {
		event.preventDefault();
		await platform.configureRepositoryStorage(
			activeRepositoryId,
			storageProvider,
			storageProvider === "google-drive"
				? {
						connectionId: googleConnection?.id,
						driveId,
						folderId,
						displayPath,
					}
				: undefined,
		);
		setStorageNotice(
			storageProvider === "google-drive"
				? "Fixed Google Drive destination saved."
				: "TieCamel managed storage is now the master.",
		);
	}

	async function requestBaselineImport() {
		if (!googleConnection) return;
		await platform.requestBaselineImport({
			repositoryId: activeRepositoryId,
			connectionId: googleConnection.id,
			externalFileId: baselineFileId,
			fileName: baselineFileName,
			attestation: baselineAttestation,
		});
		setBaselineFileId("");
		setBaselineFileName("");
		setBaselineAttestation("");
		setBaselineNotice(
			"Legacy baseline queued for download, scanning, hashing, and secure retention.",
		);
	}

	return (
		<div className="mx-auto max-w-3xl space-y-8">
			<form onSubmit={saveProfile}>
				<div className="flex items-start gap-3 border-b border-[#d0d7de] pb-4">
					<FolderOpen className="mt-0.5 size-5 text-[#656d76]" />
					<div>
						<h2 className="text-lg font-semibold">Repository profile</h2>
						<p className="mt-1 text-sm text-[#656d76]">
							Control how this work area is named and who can discover its
							approved history.
						</p>
					</div>
				</div>
				<section className="mt-5 rounded-md border border-[#d0d7de] bg-white p-5">
					<div className="grid gap-4">
						<label className="grid gap-1.5 text-sm font-semibold">
							Name
							<input
								required
								value={profile.name}
								onChange={(event) =>
									setProfile({ ...profile, name: event.target.value })
								}
								className="input font-normal"
							/>
						</label>
						<label className="grid gap-1.5 text-sm font-semibold">
							Description
							<textarea
								required
								value={profile.description}
								onChange={(event) =>
									setProfile({ ...profile, description: event.target.value })
								}
								className="input min-h-24 font-normal"
							/>
						</label>
						<fieldset>
							<legend className="text-sm font-semibold">Visibility</legend>
							<div className="mt-2 grid gap-2 sm:grid-cols-2">
								{(
									[
										[
											"restricted",
											"Restricted",
											"Only explicitly assigned repository members.",
										],
										[
											"internal",
											"Internal",
											"Everyone inside this organization.",
										],
										[
											"members",
											"Verified members",
											"Internal users and verified community members.",
										],
										[
											"public",
											"Public",
											"Approved records and selected public discussion are open to anyone.",
										],
									] as const
								).map(([value, label, detail]) => (
									<label
										key={value}
										className={`flex gap-3 rounded-md border p-3 text-sm ${
											profile.visibility === value
												? "border-[#0969da] bg-[#ddf4ff]"
												: "border-[#d0d7de]"
										}`}
									>
										<input
											type="radio"
											name="visibility"
											value={value}
											checked={profile.visibility === value}
											onChange={() =>
												setProfile({
													...profile,
													visibility: value as RepositoryVisibility,
												})
											}
										/>
										<span>
											<strong className="block">{label}</strong>
											<span className="mt-0.5 block text-xs leading-5 text-[#656d76]">
												{detail}
											</span>
										</span>
									</label>
								))}
							</div>
						</fieldset>
						{profile.visibility === "public" && (
							<div className="rounded-md border border-[#54aeff66] bg-[#ddf4ff] p-3 text-sm leading-5">
								<strong>Safe public projection</strong>
								<p className="mt-1 text-[#656d76]">
									Drafts, internal comments, private reviews, and unapproved
									files remain private. Only approved public records enter the
									public view.
								</p>
								<Link
									to="/public/$organization/$repository"
									params={{
										organization: platform.organization.slug,
										repository: repository.slug,
									}}
									preload="intent"
									className="mt-2 inline-block font-semibold text-[#0969da] hover:underline"
								>
									Preview public repository
								</Link>
							</div>
						)}
					</div>
				</section>
				<div className="mt-4 flex items-center justify-between">
					<p className="text-sm font-semibold text-[#1a7f37]">
						{profileNotice}
					</p>
					<button
						type="submit"
						className="rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white"
					>
						Save repository
					</button>
				</div>
			</form>

			<form onSubmit={saveRules}>
				<div className="flex items-start gap-3 border-b border-[#d0d7de] pb-4">
					<Settings className="mt-0.5 size-5 text-[#656d76]" />
					<div>
						<h2 className="text-lg font-semibold">
							Repository protection rules
						</h2>
						<p className="mt-1 text-sm text-[#656d76]">
							These checks are enforced before a change can be accepted.
						</p>
					</div>
				</div>
				<section className="mt-5 rounded-md border border-[#d0d7de] bg-white">
					<div className="border-b border-[#d8dee4] p-4">
						<h3 className="font-semibold">Required reviews</h3>
					</div>
					<div className="space-y-5 p-5">
						<label className="block text-sm font-semibold">
							Minimum independent approvals
							<input
								type="number"
								min={1}
								max={12}
								value={rules.minimumApprovals}
								onChange={(event) =>
									setRules((current) =>
										current
											? {
													...current,
													minimumApprovals: Number(event.target.value),
												}
											: current,
									)
								}
								className="input mt-1.5 max-w-32"
							/>
						</label>
						<div>
							<p className="text-sm font-semibold">Required teams</p>
							<div className="mt-2 grid gap-2 sm:grid-cols-2">
								{platform.teams.map((team) => (
									<label
										key={team.id}
										className="flex gap-2 rounded-md border border-[#d0d7de] p-3 text-sm"
									>
										<input
											type="checkbox"
											checked={rules.requiredTeamIds.includes(team.id)}
											onChange={(event) =>
												setRules((current) => {
													if (!current) return current;
													return {
														...current,
														requiredTeamIds: event.target.checked
															? [...current.requiredTeamIds, team.id]
															: current.requiredTeamIds.filter(
																	(id) => id !== team.id,
																),
													};
												})
											}
										/>
										<span>
											<strong className="block">{team.name}</strong>
											<span className="mt-0.5 block text-xs text-[#656d76]">
												{team.description}
											</span>
										</span>
									</label>
								))}
							</div>
						</div>
						<RuleToggle
							label="Dismiss approvals when a new revision is uploaded"
							checked={rules.dismissApprovalsOnRevision}
							onChange={(checked) =>
								setRules({ ...rules, dismissApprovalsOnRevision: checked })
							}
						/>
						<RuleToggle
							label="Prevent authors from approving their own changes"
							checked={rules.prohibitSelfApproval}
							onChange={(checked) =>
								setRules({ ...rules, prohibitSelfApproval: checked })
							}
						/>
						<RuleToggle
							label="Require blocking review threads to be resolved"
							checked={rules.requireResolvedThreads}
							onChange={(checked) =>
								setRules({ ...rules, requireResolvedThreads: checked })
							}
						/>
						{profile.visibility === "public" &&
							repository.kind === "transparency" && (
								<RuleToggle
									label="Anchor approved publication manifests on Solana"
									checked={rules.publicIntegrityAnchoring}
									onChange={(checked) =>
										setRules({
											...rules,
											publicIntegrityAnchoring: checked,
										})
									}
								/>
							)}
					</div>
				</section>
				<div className="mt-4 flex items-center justify-between">
					<p className="text-sm font-semibold text-[#1a7f37]">{rulesNotice}</p>
					<button
						type="submit"
						className="rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white"
					>
						Save rules
					</button>
				</div>
			</form>

			<form onSubmit={saveStorage}>
				<div className="flex items-start gap-3 border-b border-[#d0d7de] pb-4">
					<HardDrive className="mt-0.5 size-5 text-[#656d76]" />
					<div>
						<h2 className="text-lg font-semibold">Accepted-record storage</h2>
						<p className="mt-1 text-sm text-[#656d76]">
							Choose one fixed master destination for all newly accepted
							documents in this repository.
						</p>
					</div>
				</div>
				<section className="mt-5 space-y-4 rounded-md border border-[#d0d7de] bg-white p-5">
					<div className="grid gap-3 sm:grid-cols-2">
						<label
							className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${
								storageProvider === "azure"
									? "border-[#0969da] bg-[#ddf4ff]"
									: "border-[#d0d7de]"
							}`}
						>
							<input
								type="radio"
								name="storage-provider"
								checked={storageProvider === "azure"}
								onChange={() => setStorageProvider("azure")}
							/>
							<span>
								<span className="flex items-center gap-2 font-semibold">
									<HardDrive className="size-4 text-[#0969da]" /> TieCamel
									storage
								</span>
								<span className="mt-1 block text-xs leading-5 text-[#656d76]">
									TieCamel securely stores the accepted record. No external
									client account is required.
								</span>
							</span>
						</label>
						<label
							className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${
								storageProvider === "google-drive"
									? "border-[#0969da] bg-[#ddf4ff]"
									: "border-[#d0d7de]"
							}`}
						>
							<input
								type="radio"
								name="storage-provider"
								checked={storageProvider === "google-drive"}
								onChange={() => setStorageProvider("google-drive")}
								disabled={!googleConnection}
							/>
							<span>
								<span className="flex items-center gap-2 font-semibold">
									<Cloud className="size-4 text-[#1a73e8]" /> Google Drive
								</span>
								<span className="mt-1 block text-xs leading-5 text-[#656d76]">
									Publish to one verified folder in an organization-owned Shared
									Drive.
								</span>
							</span>
						</label>
					</div>
					{storageProvider === "google-drive" && (
						<div className="space-y-4 rounded-lg border border-[#d8dee4] bg-[#f6f8fa] p-4">
							<div className="rounded-md border border-[#d4a72c66] bg-[#fff8c5] p-3 text-xs leading-5 text-[#6e5700]">
								<strong>Provider simulator:</strong> these controls exercise the
								fixed-folder workflow without contacting Google. Live connection
								and publication require verified authentication.
							</div>
							<div className="grid gap-4 sm:grid-cols-2">
								<label className="grid gap-1.5 text-sm font-semibold">
									Shared Drive ID
									<input
										required
										value={driveId}
										onChange={(event) => setDriveId(event.target.value)}
										className="input font-mono text-xs font-normal"
									/>
								</label>
								<label className="grid gap-1.5 text-sm font-semibold">
									Fixed folder ID
									<input
										required
										value={folderId}
										onChange={(event) => setFolderId(event.target.value)}
										className="input font-mono text-xs font-normal"
									/>
								</label>
							</div>
							<label className="grid gap-1.5 text-sm font-semibold">
								Display path
								<input
									required
									value={displayPath}
									onChange={(event) => setDisplayPath(event.target.value)}
									className="input font-normal"
								/>
							</label>
							<p className="text-xs text-[#656d76]">
								Publishers cannot redirect individual change requests. Existing
								TieCamel-managed records remain in managed storage until a
								future approved update is published.
							</p>
							<div className="border-t border-[#d8dee4] pt-4">
								<h3 className="text-sm font-semibold">
									Import an existing Google record
								</h3>
								<p className="mt-1 text-xs leading-5 text-[#656d76]">
									This creates a clearly labeled legacy baseline. It does not
									invent historical approvals.
								</p>
								<div className="mt-3 grid gap-3 sm:grid-cols-2">
									<label className="grid gap-1.5 text-sm font-semibold">
										Google file ID
										<input
											value={baselineFileId}
											onChange={(event) =>
												setBaselineFileId(event.target.value)
											}
											className="input font-mono text-xs font-normal"
										/>
									</label>
									<label className="grid gap-1.5 text-sm font-semibold">
										File name
										<input
											value={baselineFileName}
											onChange={(event) =>
												setBaselineFileName(event.target.value)
											}
											className="input font-normal"
										/>
									</label>
								</div>
								<label className="mt-3 grid gap-1.5 text-sm font-semibold">
									Administrator attestation
									<textarea
										value={baselineAttestation}
										onChange={(event) =>
											setBaselineAttestation(event.target.value)
										}
										className="input min-h-20 font-normal"
										placeholder="Explain why this is the accepted pre-TieCamel baseline."
									/>
								</label>
								<div className="mt-3 flex items-center justify-between gap-3">
									<p className="text-xs font-semibold text-[#1a7f37]">
										{baselineNotice}
									</p>
									<button
										type="button"
										onClick={requestBaselineImport}
										disabled={
											!baselineFileId.trim() ||
											!baselineFileName.trim() ||
											baselineAttestation.trim().length < 20
										}
										className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:text-[#8c959f]"
									>
										Queue baseline import
									</button>
								</div>
							</div>
						</div>
					)}
					<div className="flex items-center justify-between gap-4">
						<p className="text-sm font-semibold text-[#1a7f37]">
							{storageNotice}
						</p>
						<button
							type="submit"
							className="rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white"
						>
							Save destination
						</button>
					</div>
				</section>
			</form>
		</div>
	);
}

function RuleToggle({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center justify-between gap-4 rounded-md border border-[#d0d7de] p-3 text-sm font-medium">
			{label}
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
		</label>
	);
}

function NewChangeDialog({
	repositoryId,
	onClose,
}: {
	repositoryId: string;
	onClose: () => void;
}) {
	const platform = usePlatform();
	const repository = platform.repositories.find(
		(item) => item.id === repositoryId,
	);
	const candidateIssues = platform.issues.filter(
		(issue) => issue.repositoryId === repositoryId && issue.state === "open",
	);
	const candidateRecords = platform.records.filter(
		(record) => record.repositoryId === repositoryId,
	);
	const [input, setInput] = useState<NewChangeInput>({
		repositoryId,
		title: "",
		summary: "",
		linkedIssueId: undefined,
		targetRecordId: undefined,
		locationIds: [],
		labelIds: [],
		publicAfterMerge: repository?.visibility === "public",
	});
	const [error, setError] = useState("");

	async function submit(event: FormEvent) {
		event.preventDefault();
		setError("");
		try {
			await platform.createChangeRequest(input);
			onClose();
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not create change",
			);
		}
	}

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
			<button
				type="button"
				className="absolute inset-0"
				onClick={onClose}
				aria-label="Close new change request"
			/>
			<form
				onSubmit={submit}
				className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-[#d0d7de] bg-white shadow-2xl"
			>
				<header className="flex items-center justify-between border-b border-[#d8dee4] px-5 py-4">
					<div>
						<h2 className="text-lg font-semibold">New change request</h2>
						<p className="text-xs text-[#656d76]">
							Propose a document or structured record for review.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-2 hover:bg-[#f6f8fa]"
					>
						<X className="size-4" />
					</button>
				</header>
				<div className="space-y-4 p-5">
					<label className="block text-sm font-semibold">
						Title
						<input
							value={input.title}
							onChange={(event) =>
								setInput({ ...input, title: event.target.value })
							}
							className="input mt-1.5"
							required
						/>
					</label>
					<label className="block text-sm font-semibold">
						Summary
						<textarea
							value={input.summary}
							onChange={(event) =>
								setInput({ ...input, summary: event.target.value })
							}
							className="input mt-1.5 min-h-28"
							required
						/>
					</label>
					<fieldset className="rounded-md border border-[#d0d7de] p-3">
						<legend className="px-1 text-sm font-semibold">
							Record target
						</legend>
						<p className="mb-3 text-xs text-[#656d76]">
							Choose the accepted document whose exact bytes should be compared,
							or start a new record.
						</p>
						<label className="mb-2 flex cursor-pointer items-center gap-2 text-sm">
							<input
								type="radio"
								name="record-target"
								checked={!input.targetRecordId}
								onChange={() =>
									setInput({ ...input, targetRecordId: undefined })
								}
							/>
							Create a new record
						</label>
						{candidateRecords.length > 0 && (
							<div className="flex items-center gap-2 text-sm">
								<label className="flex cursor-pointer items-center gap-2">
									<input
										type="radio"
										name="record-target"
										checked={Boolean(input.targetRecordId)}
										onChange={() =>
											setInput({
												...input,
												targetRecordId: candidateRecords[0].id,
											})
										}
									/>
									Update an accepted record
								</label>
								<select
									value={input.targetRecordId ?? candidateRecords[0].id}
									onChange={(event) =>
										setInput({ ...input, targetRecordId: event.target.value })
									}
									onFocus={() =>
										setInput({
											...input,
											targetRecordId:
												input.targetRecordId ?? candidateRecords[0].id,
										})
									}
									className="input ml-auto max-w-xs"
								>
									{candidateRecords.map((record) => (
										<option key={record.id} value={record.id}>
											{record.title}
										</option>
									))}
								</select>
							</div>
						)}
					</fieldset>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="block text-sm font-semibold">
							Linked issue (optional)
							<select
								value={input.linkedIssueId ?? ""}
								onChange={(event) =>
									setInput({
										...input,
										linkedIssueId: event.target.value || undefined,
									})
								}
								className="input mt-1.5"
							>
								<option value="">No linked issue</option>
								{candidateIssues.map((issue) => (
									<option key={issue.id} value={issue.id}>
										{repository?.prefix}-{issue.number} · {issue.title}
									</option>
								))}
							</select>
						</label>
						<label className="block text-sm font-semibold">
							Location
							<select
								value={input.locationIds[0] ?? ""}
								onChange={(event) =>
									setInput({
										...input,
										locationIds: event.target.value ? [event.target.value] : [],
									})
								}
								className="input mt-1.5"
							>
								<option value="">Organization-wide</option>
								{platform.locations.map((location) => (
									<option key={location.id} value={location.id}>
										{location.name}
									</option>
								))}
							</select>
						</label>
					</div>
					<label className="block text-sm font-semibold">
						Document
						<input
							type="file"
							accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.tif,.tiff"
							onChange={(event) =>
								setInput({ ...input, file: event.target.files?.[0] })
							}
							className="mt-1.5 block w-full rounded-md border border-[#d0d7de] p-2 text-sm"
						/>
						<span className="mt-1 block text-xs font-normal text-[#656d76]">
							PDF, DOCX, XLSX, CSV, PNG, JPEG, or TIFF · 50 MB maximum
						</span>
					</label>
					{repository?.visibility === "public" && (
						<label className="flex gap-2 rounded-md border border-[#d0d7de] p-3 text-sm">
							<input
								type="checkbox"
								checked={input.publicAfterMerge}
								onChange={(event) =>
									setInput({ ...input, publicAfterMerge: event.target.checked })
								}
							/>
							<span>
								<strong className="block">Publish after acceptance</strong>
								<span className="text-xs text-[#656d76]">
									Only the approved public projection will be visible.
								</span>
							</span>
						</label>
					)}
					{error && <p className="text-sm text-[#cf222e]">{error}</p>}
				</div>
				<footer className="flex justify-end gap-2 border-t border-[#d8dee4] px-5 py-4">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border border-[#d0d7de] px-3 py-2 text-sm font-semibold"
					>
						Cancel
					</button>
					<button
						type="submit"
						className="rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white"
					>
						Open change request
					</button>
				</footer>
			</form>
		</div>
	);
}

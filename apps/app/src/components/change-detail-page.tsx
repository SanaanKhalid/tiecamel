import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	CheckCircle2,
	CircleDot,
	Clock3,
	CloudUpload,
	Download,
	ExternalLink,
	File,
	FileCheck2,
	FileDiff,
	GitCommitHorizontal,
	LoaderCircle,
	LockKeyhole,
	MessageSquare,
	ShieldCheck,
	X,
	XCircle,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { reviewRequirementsMet, usePlatform } from "../platform/store";
import type { ChangeFile, ReviewDecision } from "../platform/types";
import {
	Avatar,
	ChangeStatusBadge,
	CheckIcon,
	EmptyState,
	LabelPill,
	RepositoryHeader,
	relativeDate,
} from "./platform-ui";

type ChangeTab = "conversation" | "changes" | "files" | "checks";

export function ChangeDetailPage({
	repositorySlug,
	changeNumber,
}: {
	repositorySlug: string;
	changeNumber: number;
}) {
	const platform = usePlatform();
	const repository = platform.repositories.find(
		(item) => item.slug === repositorySlug,
	);
	const change = repository
		? platform.changeRequests.find(
				(item) =>
					item.repositoryId === repository.id && item.number === changeNumber,
			)
		: undefined;
	const [tab, setTab] = useState<ChangeTab>("conversation");
	const [reviewBody, setReviewBody] = useState("");
	const [commentBody, setCommentBody] = useState("");
	const [commentVisibility, setCommentVisibility] = useState<
		"internal" | "public"
	>("internal");
	const [notice, setNotice] = useState("");
	const [error, setError] = useState("");
	const [publishing, setPublishing] = useState(false);
	const [previewFile, setPreviewFile] = useState<ChangeFile | null>(null);
	const [revisionOpen, setRevisionOpen] = useState(false);
	const [revisionMessage, setRevisionMessage] = useState("");
	const [revisionFile, setRevisionFile] = useState<File | null>(null);
	const [revising, setRevising] = useState(false);
	if (!repository || !change) {
		return (
			<div className="p-8">
				<EmptyState
					title="Change request not found"
					detail="This change may have moved or be outside your access."
				/>
			</div>
		);
	}
	const author = platform.members.find(
		(member) => member.id === change.authorId,
	);
	const changeId = change.id;
	const latestRevision = change.revisions.at(-1);
	const currentApprovals = change.reviews.filter(
		(review) =>
			review.decision === "approve" &&
			!review.stale &&
			review.revisionId === latestRevision?.id,
	);
	const requirementsMet = reviewRequirementsMet(
		change,
		change.reviews,
		repository,
		platform,
	);
	const requiredChecksPass = change.checks.every(
		(check) => !check.required || check.conclusion !== "failed",
	);
	const blockingLabel = platform.labels.find(
		(label) => label.blocksMerge && change.labelIds.includes(label.id),
	);
	const storageConfig = platform.repositoryStorageConfigs.find(
		(config) => config.repositoryId === repository.id,
	);
	const publicationJob = change.publicationJobId
		? platform.publicationJobs.find((job) => job.id === change.publicationJobId)
		: undefined;
	const mergeReady =
		requirementsMet &&
		requiredChecksPass &&
		change.unresolvedThreads === 0 &&
		!change.outOfDate &&
		!blockingLabel;

	async function review(decision: ReviewDecision) {
		setError("");
		setNotice("");
		try {
			await platform.reviewChange(changeId, decision, reviewBody);
			setReviewBody("");
			setNotice(
				decision === "approve"
					? "Approval recorded for the current revision."
					: decision === "request-changes"
						? "Changes requested."
						: "Review comment recorded.",
			);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Review could not be recorded",
			);
		}
	}

	async function merge() {
		setError("");
		setPublishing(true);
		try {
			await platform.mergeChange(changeId);
			setNotice(
				"Published successfully. A new immutable TieCamel record version was created.",
			);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Change could not be accepted",
			);
		} finally {
			setPublishing(false);
		}
	}

	async function comment(event: FormEvent) {
		event.preventDefault();
		if (!commentBody.trim()) return;
		await platform.addChangeComment(changeId, commentBody, commentVisibility);
		setCommentBody("");
	}

	async function openFile(file: ChangeFile) {
		if (file.previewUrl || !file.azureBlobRef) {
			setPreviewFile(file);
			return;
		}
		setError("");
		try {
			const previewUrl = await platform.requestDocumentUrl(file.azureBlobRef);
			setPreviewFile({ ...file, previewUrl });
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "The document could not be opened.",
			);
		}
	}

	async function addRevision(event: FormEvent) {
		event.preventDefault();
		if (!revisionFile) return;
		setRevising(true);
		setError("");
		try {
			await platform.addChangeRevision(changeId, revisionMessage, revisionFile);
			setRevisionOpen(false);
			setRevisionFile(null);
			setRevisionMessage("");
			setNotice(
				"New revision uploaded. Earlier approvals are stale while document processing reruns against the accepted base.",
			);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "The revision could not be uploaded.",
			);
		} finally {
			setRevising(false);
		}
	}

	const tabs: Array<{ id: ChangeTab; label: string; count?: number }> = [
		{
			id: "conversation",
			label: "Conversation",
			count: change.comments.length + change.reviews.length,
		},
		{
			id: "changes",
			label: "Changes",
			count: change.structuredDiff.length,
		},
		{
			id: "files",
			label: "Files",
			count: latestRevision?.files.length ?? 0,
		},
		{ id: "checks", label: "Checks", count: change.checks.length },
	];

	return (
		<>
			<RepositoryHeader repository={repository} active="changes" />
			<div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
				<header>
					<h1 className="text-2xl font-normal tracking-[-0.02em]">
						{change.title}{" "}
						<span className="font-light text-[#656d76]">#{change.number}</span>
					</h1>
					<div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#656d76]">
						<span
							className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold text-white ${
								change.status === "merged"
									? "bg-[#8250df]"
									: change.status === "closed"
										? "bg-[#57606a]"
										: "bg-[#1f883d]"
							}`}
						>
							<FileDiff className="size-4" />
							{change.status === "merged" ? "Accepted" : "Open"}
						</span>
						<strong className="text-[#1f2328]">{author?.name}</strong> proposed
						this change {relativeDate(change.createdAt)} ·{" "}
						{change.revisions.length} revision
						{change.revisions.length === 1 ? "" : "s"}
						<ChangeStatusBadge status={change.status} />
					</div>
				</header>

				<nav className="mt-6 flex gap-1 overflow-x-auto border-b border-[#d0d7de]">
					{tabs.map((item) => (
						<button
							key={item.id}
							type="button"
							onClick={() => setTab(item.id)}
							className={`flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${
								tab === item.id
									? "border-[#fd8c73] text-[#1f2328]"
									: "border-transparent text-[#656d76] hover:border-[#d0d7de]"
							}`}
						>
							{item.label}
							{item.count !== undefined && (
								<span className="rounded-full bg-[#afb8c1]/25 px-2 py-0.5 text-xs">
									{item.count}
								</span>
							)}
						</button>
					))}
				</nav>
				{tab === "files" && !["merged", "closed"].includes(change.status) && (
					<div className="mt-4 flex justify-end">
						<button
							type="button"
							onClick={() => setRevisionOpen(true)}
							className="inline-flex items-center gap-2 rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold hover:bg-[#f6f8fa]"
						>
							<CloudUpload className="size-4" /> Upload new revision
						</button>
					</div>
				)}

				{(notice || error) && (
					<div
						className={`mt-4 rounded-md border p-3 text-sm font-medium ${
							error
								? "border-[#ff8182] bg-[#ffebe9] text-[#cf222e]"
								: "border-[#4ac26b] bg-[#dafbe1] text-[#1a7f37]"
						}`}
					>
						{error || notice}
					</div>
				)}

				<div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_21rem]">
					<div>
						{tab === "conversation" && (
							<Conversation
								changeId={changeId}
								reviewBody={reviewBody}
								commentBody={commentBody}
								onReviewBodyChange={setReviewBody}
								onCommentBodyChange={setCommentBody}
								commentVisibility={commentVisibility}
								onCommentVisibilityChange={setCommentVisibility}
								publicRepository={repository.visibility === "public"}
								onReview={review}
								onComment={comment}
								onOpenFile={openFile}
							/>
						)}
						{tab === "changes" && <Changes changeId={changeId} />}
						{tab === "files" && (
							<Files changeId={changeId} onOpenFile={openFile} />
						)}
						{tab === "checks" && <Checks changeId={changeId} />}
					</div>

					<aside className="space-y-4">
						<section
							className={`overflow-hidden rounded-md border ${
								change.status === "merged"
									? "border-[#8250df]"
									: mergeReady
										? "border-[#4ac26b]"
										: "border-[#d0d7de]"
							} bg-white`}
						>
							<div
								className={`flex items-center gap-2 border-b px-4 py-3 ${
									change.status === "merged"
										? "border-[#8250df]/30 bg-[#eddeff]"
										: mergeReady
											? "border-[#4ac26b]/30 bg-[#dafbe1]"
											: "border-[#d8dee4] bg-[#f6f8fa]"
								}`}
							>
								{change.status === "merged" ? (
									<FileCheck2 className="size-5 text-[#8250df]" />
								) : mergeReady ? (
									<CheckCircle2 className="size-5 text-[#1a7f37]" />
								) : (
									<Clock3 className="size-5 text-[#656d76]" />
								)}
								<h2 className="font-semibold">
									{change.status === "merged"
										? "Change accepted"
										: mergeReady
											? "Ready to accept"
											: "Review required"}
								</h2>
							</div>
							<div className="space-y-3 p-4 text-sm">
								<div className="mb-3 rounded-md border border-[#d8dee4] bg-white p-3">
									<p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#656d76]">
										<CloudUpload className="size-4" /> Publish destination
									</p>
									<p className="mt-1 font-semibold">
										{storageConfig?.provider === "google-drive"
											? `Google Drive · ${storageConfig.displayPath}`
											: "TieCamel managed storage"}
									</p>
									<p className="mt-1 text-xs leading-5 text-[#656d76]">
										The exact approved file and verification manifest are
										retained regardless of the selected destination.
									</p>
								</div>
								{publicationJob && (
									<div
										className={`rounded-md border p-3 text-xs ${
											publicationJob.status === "failed"
												? "border-[#ff8182] bg-[#ffebe9] text-[#cf222e]"
												: "border-[#54aeff66] bg-[#ddf4ff] text-[#0550ae]"
										}`}
									>
										<strong className="capitalize">
											Publication {publicationJob.status}
										</strong>
										<p className="mt-1">
											Attempt {publicationJob.attempts} · exact revision{" "}
											{publicationJob.revisionId}
										</p>
									</div>
								)}
								<MergeCondition
									passed={requirementsMet}
									label={`${currentApprovals.length}/${repository.rules.minimumApprovals} approvals`}
								/>
								<MergeCondition
									passed={requiredChecksPass}
									label={`${change.checks.filter((check) => check.conclusion !== "failed").length}/${change.checks.length} checks completed`}
								/>
								<MergeCondition
									passed={change.unresolvedThreads === 0}
									label={`${change.unresolvedThreads} unresolved blocking threads`}
								/>
								<MergeCondition
									passed={!change.outOfDate}
									label={
										change.outOfDate
											? "Revision is out of date"
											: "Based on current record"
									}
								/>
								{blockingLabel && (
									<MergeCondition
										passed={false}
										label={`${blockingLabel.name} label is active`}
									/>
								)}
								{change.status !== "merged" && (
									<button
										type="button"
										onClick={merge}
										disabled={!mergeReady || publishing}
										className="mt-2 w-full rounded-md bg-[#1f883d] px-3 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#afb8c1]"
									>
										{publishing ? (
											<span className="inline-flex items-center gap-2">
												<LoaderCircle className="size-4 animate-spin" />
												Publishing…
											</span>
										) : (
											"Approve & publish"
										)}
									</button>
								)}
							</div>
						</section>

						<SidebarSection title="Reviewers">
							<div className="space-y-2">
								{currentApprovals.length ? (
									currentApprovals.map((review) => {
										const reviewer = platform.members.find(
											(member) => member.id === review.reviewerId,
										);
										return (
											<div key={review.id} className="flex items-center gap-2">
												<Avatar member={reviewer} size="sm" />
												<span className="min-w-0 flex-1 truncate text-sm font-medium">
													{reviewer?.name}
												</span>
												<Check className="size-4 text-[#1a7f37]" />
											</div>
										);
									})
								) : (
									<p className="text-sm text-[#656d76]">No approvals yet</p>
								)}
							</div>
						</SidebarSection>
						<SidebarSection title="Labels">
							<div className="flex flex-wrap gap-1.5">
								{platform.labels
									.filter((label) => change.labelIds.includes(label.id))
									.map((label) => (
										<LabelPill key={label.id} label={label} />
									))}
							</div>
						</SidebarSection>
						<SidebarSection title="Linked issue">
							{change.linkedIssueId ? (
								<Link
									to="/$organization/$repository/issues/$issueNumber"
									params={{
										organization: platform.organization.slug,
										repository: repository.slug,
										issueNumber: String(
											platform.issues.find(
												(issue) => issue.id === change.linkedIssueId,
											)?.number ?? "",
										),
									}}
									preload="intent"
									className="flex items-start gap-2 text-sm font-semibold text-[#0969da] hover:underline"
								>
									<CircleDot className="mt-0.5 size-4 shrink-0 text-[#1a7f37]" />
									{
										platform.issues.find(
											(issue) => issue.id === change.linkedIssueId,
										)?.title
									}
								</Link>
							) : (
								<p className="text-sm text-[#656d76]">No linked issue</p>
							)}
						</SidebarSection>
					</aside>
				</div>
			</div>
			{previewFile && (
				<FilePreviewDialog
					file={previewFile}
					onClose={() => setPreviewFile(null)}
				/>
			)}
			{revisionOpen && (
				<div className="fixed inset-0 z-50 grid place-items-center bg-[#0d1117]/55 p-4">
					<form
						onSubmit={addRevision}
						className="w-full max-w-lg rounded-lg border border-[#d0d7de] bg-white p-5 shadow-2xl"
					>
						<h2 className="text-lg font-semibold">Upload a new revision</h2>
						<p className="mt-1 text-sm text-[#656d76]">
							The file will be compared with the exact current accepted version.
							All earlier approvals become stale.
						</p>
						<label className="mt-4 block text-sm font-semibold">
							Revision note
							<input
								value={revisionMessage}
								onChange={(event) => setRevisionMessage(event.target.value)}
								className="input mt-1.5"
								placeholder="What changed?"
							/>
						</label>
						<label className="mt-4 block text-sm font-semibold">
							Replacement document
							<input
								type="file"
								accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.tif,.tiff"
								required
								onChange={(event) =>
									setRevisionFile(event.target.files?.[0] ?? null)
								}
								className="mt-1.5 block w-full text-sm"
							/>
						</label>
						<div className="mt-5 flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setRevisionOpen(false)}
								className="rounded-md border border-[#d0d7de] px-4 py-2 text-sm font-semibold"
							>
								Cancel
							</button>
							<button
								type="submit"
								disabled={!revisionFile || revising}
								className="rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
							>
								{revising ? "Uploading…" : "Upload revision"}
							</button>
						</div>
					</form>
				</div>
			)}
		</>
	);
}

function Conversation({
	changeId,
	reviewBody,
	commentBody,
	commentVisibility,
	publicRepository,
	onReviewBodyChange,
	onCommentBodyChange,
	onCommentVisibilityChange,
	onReview,
	onComment,
	onOpenFile,
}: {
	changeId: string;
	reviewBody: string;
	commentBody: string;
	commentVisibility: "internal" | "public";
	publicRepository: boolean;
	onReviewBodyChange: (value: string) => void;
	onCommentBodyChange: (value: string) => void;
	onCommentVisibilityChange: (value: "internal" | "public") => void;
	onReview: (decision: ReviewDecision) => void;
	onComment: (event: FormEvent) => void;
	onOpenFile: (file: ChangeFile) => void;
}) {
	const platform = usePlatform();
	const change = platform.changeRequests.find((item) => item.id === changeId);
	if (!change) return null;
	return (
		<div>
			<TimelineEntry memberId={change.authorId}>
				<p className="whitespace-pre-wrap text-sm leading-6">
					{change.summary}
				</p>
				{change.revisions.at(-1)?.files.length ? (
					<div className="mt-4 rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-3">
						{change.revisions.at(-1)?.files.map((file) => (
							<div key={file.id} className="flex items-center gap-3">
								<File className="size-5 text-[#0969da]" />
								<button
									type="button"
									onClick={() => onOpenFile(file)}
									className="min-w-0 flex-1 text-left"
								>
									<p className="truncate text-sm font-semibold text-[#0969da] hover:underline">
										{file.name}
									</p>
									<p className="text-xs text-[#656d76]">
										{file.sizeLabel} · SHA-256 {file.sha256}
									</p>
								</button>
							</div>
						))}
					</div>
				) : null}
			</TimelineEntry>

			{change.comments.map((comment) => (
				<TimelineEntry
					key={comment.id}
					memberId={comment.authorId}
					meta={relativeDate(comment.createdAt)}
				>
					<div className="flex items-start justify-between gap-3">
						<p className="text-sm leading-6">{comment.body}</p>
						<span className="shrink-0 rounded-full bg-[#eaeef2] px-2 py-0.5 text-[11px] font-medium text-[#656d76]">
							{comment.visibility === "public" ? "Public" : "Internal"}
						</span>
					</div>
				</TimelineEntry>
			))}

			{change.reviews.map((review) => {
				const reviewer = platform.members.find(
					(member) => member.id === review.reviewerId,
				);
				return (
					<div
						key={review.id}
						className="relative mb-5 ml-4 border-l-2 border-[#d8dee4] py-2 pl-8"
					>
						<span
							className={`absolute top-2 -left-3 grid size-6 place-items-center rounded-full text-white ${
								review.decision === "approve"
									? "bg-[#1f883d]"
									: review.decision === "request-changes"
										? "bg-[#cf222e]"
										: "bg-[#656d76]"
							}`}
						>
							{review.decision === "approve" ? (
								<Check className="size-3.5" />
							) : review.decision === "request-changes" ? (
								<XCircle className="size-3.5" />
							) : (
								<MessageSquare className="size-3.5" />
							)}
						</span>
						<p className="text-sm">
							<strong>{reviewer?.name}</strong>{" "}
							{review.decision === "approve"
								? "approved this revision"
								: review.decision === "request-changes"
									? "requested changes"
									: "reviewed this revision"}
							{review.stale ? " · Stale" : ""}
						</p>
						{review.body && (
							<p className="mt-2 rounded-md bg-white p-3 text-sm text-[#656d76]">
								{review.body}
							</p>
						)}
					</div>
				);
			})}

			<form
				onSubmit={onComment}
				className="mt-6 rounded-md border border-[#d0d7de] bg-white"
			>
				<div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-2 text-sm font-semibold">
					Conversation
				</div>
				<div className="p-4">
					<textarea
						value={commentBody}
						onChange={(event) => onCommentBodyChange(event.target.value)}
						className="input min-h-24 resize-y"
						placeholder={`Comment as ${platform.members.find((member) => member.id === platform.viewerId)?.name}`}
						aria-label="Change request comment"
					/>
					<div className="mt-3 flex items-center justify-between gap-3">
						{publicRepository ? (
							<label className="flex items-center gap-2 text-xs text-[#656d76]">
								Visibility
								<select
									value={commentVisibility}
									onChange={(event) =>
										onCommentVisibilityChange(
											event.target.value as "internal" | "public",
										)
									}
									className="rounded-md border border-[#d0d7de] bg-white px-2 py-1.5 text-sm text-[#1f2328]"
									aria-label="Comment visibility"
								>
									<option value="internal">Internal</option>
									<option value="public">Public</option>
								</select>
							</label>
						) : (
							<span className="text-xs text-[#656d76]">
								Internal discussion
							</span>
						)}
						<button
							type="submit"
							disabled={!commentBody.trim()}
							className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"
						>
							Comment
						</button>
					</div>
				</div>
			</form>

			{change.status !== "merged" && (
				<section className="mt-5 rounded-md border border-[#d0d7de] bg-white">
					<div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
						<h2 className="font-semibold">Submit your review</h2>
						<p className="mt-0.5 text-xs text-[#656d76]">
							Your decision applies only to the current revision.
						</p>
					</div>
					<div className="p-4">
						<textarea
							value={reviewBody}
							onChange={(event) => onReviewBodyChange(event.target.value)}
							className="input min-h-20"
							placeholder="Explain your review decision"
							aria-label="Review summary"
						/>
						<div className="mt-3 flex flex-wrap gap-2">
							<button
								type="button"
								onClick={() => onReview("approve")}
								className="inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white"
							>
								<Check className="size-4" /> Approve
							</button>
							<button
								type="button"
								onClick={() => onReview("request-changes")}
								className="inline-flex items-center gap-2 rounded-md border border-[#cf222e] px-3 py-2 text-sm font-semibold text-[#cf222e]"
							>
								<XCircle className="size-4" /> Request changes
							</button>
							<button
								type="button"
								onClick={() => onReview("comment")}
								className="rounded-md border border-[#d0d7de] px-3 py-2 text-sm font-semibold"
							>
								Comment only
							</button>
						</div>
					</div>
				</section>
			)}
		</div>
	);
}

function Changes({ changeId }: { changeId: string }) {
	const platform = usePlatform();
	const change = platform.changeRequests.find((item) => item.id === changeId);
	if (!change) return null;
	return (
		<div className="space-y-6">
			<section className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
				<div className="flex items-center justify-between border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
					<div>
						<h2 className="font-semibold">Structured changes</h2>
						<p className="mt-0.5 text-xs text-[#656d76]">
							Deterministic extraction with source provenance
						</p>
					</div>
					<span className="rounded-full bg-[#fff8c5] px-2 py-1 text-xs font-semibold text-[#9a6700]">
						{
							change.structuredDiff.filter((field) => field.severity !== "info")
								.length
						}{" "}
						warnings
					</span>
				</div>
				{change.structuredDiff.length ? (
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm">
							<thead className="border-b border-[#d8dee4] bg-[#f6f8fa] text-xs text-[#656d76]">
								<tr>
									<th className="px-4 py-2.5 font-semibold">Field</th>
									<th className="px-4 py-2.5 font-semibold">Accepted record</th>
									<th className="px-4 py-2.5 font-semibold">Proposed record</th>
									<th className="px-4 py-2.5 font-semibold">Source</th>
								</tr>
							</thead>
							<tbody>
								{change.structuredDiff.map((field) => (
									<tr
										key={field.id}
										className="border-b border-[#d8dee4] last:border-b-0"
									>
										<td className="px-4 py-3 font-semibold">
											<span className="flex items-center gap-2">
												{field.severity === "critical" && (
													<AlertTriangle className="size-4 text-[#cf222e]" />
												)}
												{field.field}
											</span>
										</td>
										<td className="px-4 py-3 bg-[#ffebe9]/45 text-[#82071e] line-through">
											{field.before ?? "—"}
										</td>
										<td className="px-4 py-3 bg-[#dafbe1]/55 font-semibold text-[#116329]">
											{field.after ?? "—"}
										</td>
										<td className="px-4 py-3 text-xs text-[#656d76]">
											{field.provenance}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<p className="p-5 text-sm text-[#656d76]">
						No structured field changes were detected.
					</p>
				)}
			</section>

			<section className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
				<div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
					<h2 className="font-semibold">Text comparison</h2>
				</div>
				{change.textDiff.length ? (
					<div className="font-mono text-xs leading-6">
						{change.textDiff.map((line, index) => (
							<div
								key={line.id}
								className={`grid grid-cols-[3rem_minmax(0,1fr)] border-b border-[#d8dee4] last:border-b-0 ${
									line.type === "added"
										? "bg-[#dafbe1]"
										: line.type === "removed"
											? "bg-[#ffebe9]"
											: "bg-white"
								}`}
							>
								<span className="border-r border-[#d8dee4] px-3 py-1 text-right text-[#8c959f]">
									{index + 1}
								</span>
								<span className="px-3 py-1">
									{line.type === "added"
										? "+"
										: line.type === "removed"
											? "−"
											: " "}
									{line.content}
								</span>
							</div>
						))}
					</div>
				) : (
					<ComparisonEmptyState
						hasBaseVersion={Boolean(change.baseVersionId)}
						kind="text"
					/>
				)}
			</section>

			<section className="rounded-md border border-[#d0d7de] bg-white">
				<div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
					<h2 className="font-semibold">Visual comparison</h2>
				</div>
				<VisualComparison changeId={changeId} />
			</section>
		</div>
	);
}

function VisualComparison({ changeId }: { changeId: string }) {
	const platform = usePlatform();
	const change = platform.changeRequests.find((item) => item.id === changeId);
	const [urls, setUrls] = useState<Record<string, string>>({});
	const [error, setError] = useState("");
	const renders = useMemo(
		() =>
			(change?.artifacts ?? []).filter(
				(artifact) => artifact.kind === "page-render",
			),
		[change?.artifacts],
	);
	useEffect(() => {
		let active = true;
		if (!renders.length) return;
		void Promise.all(
			renders.map(
				async (artifact) =>
					[
						artifact.id,
						await platform.requestDocumentUrl(artifact.objectRef),
					] as const,
			),
		)
			.then((entries) => {
				if (active) setUrls(Object.fromEntries(entries));
			})
			.catch((caught) => {
				if (active)
					setError(
						caught instanceof Error
							? caught.message
							: "Rendered pages could not be opened.",
					);
			});
		return () => {
			active = false;
		};
	}, [platform, renders]);
	if (!change) return null;
	if (!renders.length) {
		return (
			<ComparisonEmptyState
				hasBaseVersion={Boolean(change.baseVersionId)}
				kind="visual"
			/>
		);
	}
	if (error) return <p className="p-5 text-sm text-[#cf222e]">{error}</p>;
	return (
		<div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
			{renders.map((artifact) => (
				<figure
					key={artifact.id}
					className="overflow-hidden rounded-md border border-[#d8dee4] bg-[#f6f8fa]"
				>
					{urls[artifact.id] ? (
						<img
							src={urls[artifact.id]}
							alt={`${String(artifact.metadata?.side ?? "document")} page ${String(artifact.metadata?.page ?? "")}`}
							className="aspect-[3/4] w-full object-contain"
						/>
					) : (
						<div className="aspect-[3/4] w-full animate-pulse bg-slate-100" />
					)}
					<figcaption className="border-t border-[#d8dee4] bg-white px-3 py-2 text-xs font-semibold capitalize text-[#656d76]">
						{String(artifact.metadata?.side ?? "rendered")} · page{" "}
						{String(artifact.metadata?.page ?? "—")}
					</figcaption>
				</figure>
			))}
		</div>
	);
}

function Files({
	changeId,
	onOpenFile,
}: {
	changeId: string;
	onOpenFile: (file: ChangeFile) => void;
}) {
	const platform = usePlatform();
	const change = platform.changeRequests.find((item) => item.id === changeId);
	if (!change) return null;
	return (
		<div className="space-y-4">
			{change.revisions
				.slice()
				.reverse()
				.map((revision) => {
					const author = platform.members.find(
						(member) => member.id === revision.authorId,
					);
					return (
						<section
							key={revision.id}
							className="overflow-hidden rounded-md border border-[#d0d7de] bg-white"
						>
							<div className="flex items-center justify-between border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
								<div className="flex items-center gap-2">
									<GitCommitHorizontal className="size-4 text-[#656d76]" />
									<strong>Revision {revision.number}</strong>
									<span className="text-xs text-[#656d76]">
										by {author?.name}
									</span>
								</div>
								<span className="text-xs text-[#656d76]">
									{relativeDate(revision.createdAt)}
								</span>
							</div>
							<p className="border-b border-[#d8dee4] px-4 py-3 text-sm">
								{revision.message}
							</p>
							{revision.files.map((file) => (
								<div key={file.id} className="flex items-start gap-3 p-4">
									<File className="mt-0.5 size-5 text-[#0969da]" />
									<button
										type="button"
										onClick={() => onOpenFile(file)}
										className="min-w-0 flex-1 text-left"
									>
										<p className="font-semibold text-[#0969da] hover:underline">
											{file.name}
										</p>
										<p className="mt-1 text-xs text-[#656d76]">
											{file.mimeType} · {file.sizeLabel}
										</p>
										<p className="mt-1 break-all font-mono text-[11px] text-[#8c959f]">
											SHA-256 {file.sha256}
										</p>
									</button>
									<span className="rounded-full bg-[#dafbe1] px-2 py-0.5 text-xs font-semibold text-[#1a7f37]">
										Ready
									</span>
								</div>
							))}
						</section>
					);
				})}
			<div className="rounded-md border border-[#54aeff] bg-[#ddf4ff] p-4 text-sm text-[#0550ae]">
				<strong>Immutable revisions:</strong> uploading a replacement creates a
				new revision and makes prior approvals stale. Existing files are never
				overwritten.
			</div>
		</div>
	);
}

function Checks({ changeId }: { changeId: string }) {
	const platform = usePlatform();
	const change = platform.changeRequests.find((item) => item.id === changeId);
	if (!change) return null;
	return (
		<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
			<div className="flex items-center gap-2 border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
				<ShieldCheck className="size-5 text-[#1a7f37]" />
				<div>
					<h2 className="font-semibold">Required checks</h2>
					<p className="text-xs text-[#656d76]">
						Automated analysis can warn or block, but it cannot approve.
					</p>
				</div>
			</div>
			{change.checks.map((check) => (
				<article
					key={check.id}
					className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0"
				>
					<CheckIcon
						state={
							check.conclusion === "passed"
								? "passed"
								: check.conclusion === "warning"
									? "warning"
									: check.conclusion === "failed"
										? "failed"
										: "running"
						}
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<h3 className="font-semibold">{check.name}</h3>
							{check.required && (
								<span className="rounded-full bg-[#eaeef2] px-2 py-0.5 text-[10px] font-semibold text-[#656d76]">
									Required
								</span>
							)}
						</div>
						<p className="mt-1 text-sm text-[#656d76]">{check.description}</p>
					</div>
				</article>
			))}
			<div className="flex gap-3 border-t border-[#d8dee4] bg-[#f6f8fa] p-4">
				<LockKeyhole className="size-4 shrink-0 text-[#656d76]" />
				<p className="text-xs leading-5 text-[#656d76]">
					File safety, deterministic extraction, repository rules, and deadline
					policies are authoritative. Any AI-generated explanation is separately
					labeled advisory.
				</p>
			</div>
		</div>
	);
}

function TimelineEntry({
	memberId,
	meta,
	children,
}: {
	memberId: string;
	meta?: string;
	children: React.ReactNode;
}) {
	const platform = usePlatform();
	const member = platform.members.find((item) => item.id === memberId);
	return (
		<article className="mb-5 flex gap-3">
			<Avatar member={member} />
			<div className="min-w-0 flex-1 overflow-hidden rounded-md border border-[#d0d7de] bg-white">
				<div className="flex items-center justify-between border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-2 text-sm">
					<strong>{member?.name ?? "Former member"}</strong>
					{meta && <span className="text-xs text-[#656d76]">{meta}</span>}
				</div>
				<div className="p-4">{children}</div>
			</div>
		</article>
	);
}

function MergeCondition({ passed, label }: { passed: boolean; label: string }) {
	return (
		<p className="flex items-start gap-2">
			{passed ? (
				<Check className="mt-0.5 size-4 shrink-0 text-[#1a7f37]" />
			) : (
				<CircleDot className="mt-0.5 size-4 shrink-0 text-[#8c959f]" />
			)}
			<span className={passed ? "" : "text-[#656d76]"}>{label}</span>
		</p>
	);
}

function SidebarSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="border-b border-[#d8dee4] pb-4">
			<h2 className="mb-2 text-xs font-semibold text-[#656d76]">{title}</h2>
			{children}
		</section>
	);
}

function FilePreviewDialog({
	file,
	onClose,
}: {
	file: ChangeFile;
	onClose: () => void;
}) {
	const isImage = file.mimeType.startsWith("image/");
	const isPdf = file.mimeType === "application/pdf";
	return (
		<div className="fixed inset-0 z-50 flex flex-col bg-[#0d1117]/90 p-3 sm:p-6">
			<header className="flex items-center gap-3 rounded-t-lg bg-white px-4 py-3 text-[#1f2328]">
				<File className="size-5 text-[#0969da]" />
				<div className="min-w-0 flex-1">
					<h2 className="truncate font-semibold">{file.name}</h2>
					<p className="text-xs text-[#656d76]">
						{file.mimeType} · {file.sizeLabel}
					</p>
				</div>
				{file.previewUrl ? (
					<>
						<a
							href={file.previewUrl}
							target="_blank"
							rel="noreferrer"
							className="rounded-md border border-[#d0d7de] p-2 hover:bg-[#f6f8fa]"
							aria-label={`Open ${file.name} in a new tab`}
						>
							<ExternalLink className="size-4" />
						</a>
						<a
							href={file.previewUrl}
							download={file.name}
							className="rounded-md border border-[#d0d7de] p-2 hover:bg-[#f6f8fa]"
							aria-label={`Download ${file.name}`}
						>
							<Download className="size-4" />
						</a>
					</>
				) : null}
				<button
					type="button"
					onClick={onClose}
					className="rounded-md border border-[#d0d7de] p-2 hover:bg-[#f6f8fa]"
					aria-label="Close file preview"
				>
					<X className="size-4" />
				</button>
			</header>
			<div className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-b-lg bg-[#f6f8fa] p-3">
				{!file.previewUrl ? (
					<div className="max-w-md rounded-lg border border-[#d0d7de] bg-white p-8 text-center">
						<File className="mx-auto size-10 text-[#656d76]" />
						<p className="mt-4 font-semibold">Preview unavailable</p>
						<p className="mt-2 text-sm leading-6 text-[#656d76]">
							This file was added before local previews were enabled. Add it
							again as a new change request to preview or download it here.
						</p>
					</div>
				) : isImage ? (
					<img
						src={file.previewUrl}
						alt={file.name}
						className="max-h-full max-w-full rounded shadow-xl"
					/>
				) : isPdf ? (
					<iframe
						src={file.previewUrl}
						title={file.name}
						className="h-full min-h-[70vh] w-full rounded bg-white"
					/>
				) : (
					<div className="max-w-md rounded-lg border border-[#d0d7de] bg-white p-8 text-center">
						<File className="mx-auto size-10 text-[#656d76]" />
						<p className="mt-4 font-semibold">
							This format does not have an in-app preview.
						</p>
						<a
							href={file.previewUrl}
							download={file.name}
							className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-4 py-2 text-sm font-semibold text-white"
						>
							<Download className="size-4" /> Download file
						</a>
					</div>
				)}
			</div>
		</div>
	);
}

function ComparisonEmptyState({
	hasBaseVersion,
	kind,
}: {
	hasBaseVersion: boolean;
	kind: "text" | "visual";
}) {
	const label =
		kind === "text" ? "text comparison" : "rendered page comparison";
	const processingMessage =
		kind === "text"
			? "Review the proposed file. Text changes will appear only when document processing produces them."
			: "Review the extracted changes above and the proposed file. A visual comparison will appear only when document processing produces one.";
	return (
		<div className="p-5 text-sm text-[#656d76]">
			<p className="font-semibold text-[#1f2328]">
				{hasBaseVersion
					? `No ${label} is available for this revision.`
					: "This is the first version of this record."}
			</p>
			<p className="mt-1 leading-6">
				{hasBaseVersion
					? processingMessage
					: `There is no previously accepted document to use for a ${label}.`}
			</p>
		</div>
	);
}

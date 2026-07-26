import { Link } from "@tanstack/react-router";
import {
	CalendarDays,
	CheckCircle2,
	CircleDot,
	FileDiff,
	Link2,
	MapPin,
	Users,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { usePlatform } from "../platform/store";
import type { IssueStatus } from "../platform/types";
import {
	Avatar,
	ChangeStatusBadge,
	EmptyState,
	IssueStatusBadge,
	issueStatusLabel,
	LabelPill,
	RepositoryHeader,
	relativeDate,
} from "./platform-ui";

const statuses: IssueStatus[] = ["todo", "in-progress", "in-review", "done"];

export function IssueDetailPage({
	repositorySlug,
	issueNumber,
}: {
	repositorySlug: string;
	issueNumber: number;
}) {
	const platform = usePlatform();
	const repository = platform.repositories.find(
		(item) => item.slug === repositorySlug,
	);
	const issue = repository
		? platform.issues.find(
				(item) =>
					item.repositoryId === repository.id && item.number === issueNumber,
			)
		: undefined;
	const [body, setBody] = useState("");
	const [visibility, setVisibility] = useState<"internal" | "public">(
		"internal",
	);
	if (!repository || !issue) {
		return (
			<div className="p-8">
				<EmptyState
					title="Issue not found"
					detail="This issue may have moved or be outside your access."
				/>
			</div>
		);
	}
	const author = platform.members.find(
		(member) => member.id === issue.authorId,
	);
	const issueId = issue.id;
	const labels = platform.labels.filter((label) =>
		issue.labelIds.includes(label.id),
	);
	const linkedChanges = platform.changeRequests.filter((change) =>
		issue.linkedChangeIds.includes(change.id),
	);

	async function addComment(event: FormEvent) {
		event.preventDefault();
		if (!body.trim()) return;
		await platform.addIssueComment(issueId, body, visibility);
		setBody("");
	}

	return (
		<>
			<RepositoryHeader repository={repository} active="issues" />
			<div className="mx-auto w-full max-w-[1800px] px-4 py-6 sm:px-6 lg:px-8">
				<header className="border-b border-[#d0d7de] pb-5">
					<h1 className="text-2xl font-normal tracking-[-0.02em]">
						{issue.title}{" "}
						<span className="font-light text-[#656d76]">#{issue.number}</span>
					</h1>
					<div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#656d76]">
						<span
							className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold text-white ${
								issue.state === "open" ? "bg-[#1f883d]" : "bg-[#8250df]"
							}`}
						>
							{issue.state === "open" ? (
								<CircleDot className="size-4" />
							) : (
								<CheckCircle2 className="size-4" />
							)}
							{issue.state === "open" ? "Open" : "Closed"}
						</span>
						<strong className="text-[#1f2328]">{author?.name}</strong> opened
						this issue {relativeDate(issue.createdAt)} · {issue.commentCount}{" "}
						comments
					</div>
				</header>

				<div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_18rem]">
					<div>
						<TimelineEntry memberId={issue.authorId}>
							<p className="whitespace-pre-wrap text-sm leading-6">
								{issue.description}
							</p>
						</TimelineEntry>
						{issue.comments.map((comment) => (
							<TimelineEntry
								key={comment.id}
								memberId={comment.authorId}
								meta={`${relativeDate(comment.createdAt)} · ${
									comment.visibility === "public"
										? "Public comment"
										: "Internal comment"
								}`}
							>
								<p className="whitespace-pre-wrap text-sm leading-6">
									{comment.body}
								</p>
							</TimelineEntry>
						))}

						{linkedChanges.length > 0 && (
							<div className="relative mt-5 ml-4 border-l-2 border-[#d8dee4] py-2 pl-8">
								<span className="absolute top-3 -left-3 grid size-6 place-items-center rounded-full bg-[#ddf4ff] text-[#0969da]">
									<Link2 className="size-3.5" />
								</span>
								{linkedChanges.map((change) => (
									<Link
										key={change.id}
										to="/$organization/$repository/changes/$changeNumber"
										params={{
											organization: platform.organization.slug,
											repository: repository.slug,
											changeNumber: String(change.number),
										}}
										preload="intent"
										className="flex items-center gap-3 rounded-md border border-[#d0d7de] bg-white p-3 hover:bg-[#f6f8fa]"
									>
										<FileDiff className="size-5 text-[#1a7f37]" />
										<div className="min-w-0 flex-1">
											<p className="font-semibold text-[#0969da]">
												{change.title}
											</p>
											<p className="mt-0.5 text-xs text-[#656d76]">
												Change request #{change.number}
											</p>
										</div>
										<ChangeStatusBadge status={change.status} />
									</Link>
								))}
							</div>
						)}

						<form
							onSubmit={addComment}
							className="mt-6 rounded-md border border-[#d0d7de] bg-white"
						>
							<div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-2 text-sm font-semibold">
								Add a comment
							</div>
							<div className="p-4">
								<textarea
									value={body}
									onChange={(event) => setBody(event.target.value)}
									className="input min-h-28 resize-y"
									placeholder="Add context, evidence, or a status update"
									aria-label="Comment"
								/>
								<div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									{repository.visibility === "public" ? (
										<select
											value={visibility}
											onChange={(event) =>
												setVisibility(
													event.target.value as "internal" | "public",
												)
											}
											className="rounded-md border border-[#d0d7de] px-2 py-1.5 text-xs"
											aria-label="Comment visibility"
										>
											<option value="internal">Internal review comment</option>
											<option value="public">Public comment</option>
										</select>
									) : (
										<span className="text-xs text-[#656d76]">
											Visible to authorized repository members
										</span>
									)}
									<button
										type="submit"
										disabled={!body.trim()}
										className="rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
									>
										Comment
									</button>
								</div>
							</div>
						</form>
					</div>

					<aside className="space-y-5 text-sm">
						<MetaSection title="Status">
							<select
								value={issue.status}
								onChange={(event) =>
									void platform.moveIssue(
										issue.id,
										event.target.value as IssueStatus,
									)
								}
								className="w-full rounded-md border border-[#d0d7de] bg-white px-2 py-2 text-sm"
								aria-label="Issue status"
							>
								{statuses.map((status) => (
									<option key={status} value={status}>
										{issueStatusLabel(status)}
									</option>
								))}
							</select>
							<div className="mt-2">
								<IssueStatusBadge status={issue.status} />
							</div>
						</MetaSection>
						<MetaSection title="Assignees">
							<div className="space-y-2">
								{issue.assigneeIds.map((memberId) => {
									const member = platform.members.find(
										(item) => item.id === memberId,
									);
									return (
										<div key={memberId} className="flex items-center gap-2">
											<Avatar member={member} size="sm" />
											<span className="font-medium">{member?.name}</span>
										</div>
									);
								})}
							</div>
						</MetaSection>
						<MetaSection title="Labels">
							<div className="flex flex-wrap gap-1.5">
								{labels.length ? (
									labels.map((label) => (
										<LabelPill key={label.id} label={label} />
									))
								) : (
									<span className="text-[#656d76]">None</span>
								)}
							</div>
						</MetaSection>
						<MetaSection title="Location">
							<div className="space-y-1.5 text-[#656d76]">
								{issue.locationIds.length ? (
									issue.locationIds.map((locationId) => (
										<p key={locationId} className="flex items-center gap-2">
											<MapPin className="size-3.5" />
											{
												platform.locations.find(
													(location) => location.id === locationId,
												)?.shortName
											}
										</p>
									))
								) : (
									<p>Organization-wide</p>
								)}
							</div>
						</MetaSection>
						{issue.dueDate && (
							<MetaSection title="Due date">
								<p className="flex items-center gap-2 text-[#656d76]">
									<CalendarDays className="size-4" /> {issue.dueDate}
								</p>
							</MetaSection>
						)}
						<MetaSection title="Watchers">
							<p className="flex items-center gap-2 text-[#656d76]">
								<Users className="size-4" /> {issue.watcherIds.length} people
							</p>
						</MetaSection>
					</aside>
				</div>
			</div>
		</>
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
					<span className="text-xs text-[#656d76]">{meta}</span>
				</div>
				<div className="p-4">{children}</div>
			</div>
		</article>
	);
}

function MetaSection({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="border-b border-[#d8dee4] pb-4">
			<h3 className="mb-2 text-xs font-semibold text-[#656d76]">{title}</h3>
			{children}
		</section>
	);
}

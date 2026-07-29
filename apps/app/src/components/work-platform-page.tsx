import { Link } from "@tanstack/react-router";
import {
	Columns3,
	Filter,
	List,
	MessageSquare,
	Plus,
	Search,
	X,
} from "lucide-react";
import {
	type CSSProperties,
	type FormEvent,
	useEffect,
	useMemo,
	useState,
} from "react";
import { type NewIssueInput, usePlatform } from "../platform/store";
import type { Issue, IssueStatus } from "../platform/types";
import {
	Avatar,
	issueStatusLabel,
	LabelPill,
	relativeDate,
} from "./platform-ui";

const statuses: IssueStatus[] = ["todo", "in-progress", "in-review", "done"];

export function WorkPlatformPage() {
	const platform = usePlatform();
	const [view, setView] = useState<"list" | "board">("list");
	const [query, setQuery] = useState("");
	const [repositoryId, setRepositoryId] = useState("all");
	const [mine, setMine] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const issues = useMemo(
		() =>
			platform.issues
				.filter(
					(issue) =>
						repositoryId === "all" || issue.repositoryId === repositoryId,
				)
				.filter(
					(issue) => !mine || issue.assigneeIds.includes(platform.viewerId),
				)
				.filter((issue) =>
					`${issue.title} ${issue.description}`
						.toLowerCase()
						.includes(query.toLowerCase()),
				)
				.sort((a, b) => {
					const aDue = a.dueDate
						? new Date(a.dueDate).getTime()
						: Number.MAX_SAFE_INTEGER;
					const bDue = b.dueDate
						? new Date(b.dueDate).getTime()
						: Number.MAX_SAFE_INTEGER;
					return aDue - bDue;
				}),
		[platform.issues, platform.viewerId, query, repositoryId, mine],
	);

	useEffect(() => {
		if (new URLSearchParams(window.location.search).get("new") === "issue") {
			setCreateOpen(true);
		}
	}, []);

	return (
		<div className="px-4 py-8 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-[2200px]">
				<div className="flex flex-col gap-4 border-b border-[#d0d7de] pb-5 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h1 className="text-2xl font-semibold">Organization work</h1>
						<p className="mt-1 text-sm text-[#656d76]">
							Issues from every repository, in one place.
						</p>
					</div>
					<button
						type="button"
						onClick={() => setCreateOpen(true)}
						className="inline-flex items-center justify-center gap-2 rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1a7f37]"
					>
						<Plus className="size-4" /> New issue
					</button>
				</div>

				<section className="mt-5 flex flex-col gap-3 rounded-md border border-[#d0d7de] bg-white p-3 lg:flex-row lg:items-center">
					<label className="relative min-w-0 flex-1">
						<Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8c959f]" />
						<input
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder="Search issues"
							aria-label="Search issues"
							className="w-full rounded-md border border-[#d0d7de] bg-[#f6f8fa] py-2 pr-3 pl-9 text-sm focus:border-[#0969da] focus:bg-white focus:outline-none"
						/>
					</label>
					<div className="flex flex-wrap gap-2">
						<label className="flex items-center gap-2 rounded-md border border-[#d0d7de] px-3 py-2 text-sm">
							<Filter className="size-4 text-[#656d76]" />
							<select
								value={repositoryId}
								onChange={(event) => setRepositoryId(event.target.value)}
								className="bg-transparent font-medium outline-none"
								aria-label="Repository filter"
							>
								<option value="all">All repositories</option>
								{platform.repositories.map((repository) => (
									<option key={repository.id} value={repository.id}>
										{repository.name}
									</option>
								))}
							</select>
						</label>
						<button
							type="button"
							onClick={() => setMine((value) => !value)}
							className={`rounded-md border px-3 py-2 text-sm font-medium ${
								mine
									? "border-[#0969da] bg-[#ddf4ff] text-[#0969da]"
									: "border-[#d0d7de] hover:bg-[#f6f8fa]"
							}`}
						>
							My issues
						</button>
						<div className="flex rounded-md border border-[#d0d7de] p-0.5">
							<button
								type="button"
								onClick={() => setView("list")}
								className={`rounded p-1.5 ${view === "list" ? "bg-[#eaeef2]" : ""}`}
								aria-label="List view"
							>
								<List className="size-4" />
							</button>
							<button
								type="button"
								onClick={() => setView("board")}
								className={`rounded p-1.5 ${view === "board" ? "bg-[#eaeef2]" : ""}`}
								aria-label="Board view"
							>
								<Columns3 className="size-4" />
							</button>
						</div>
					</div>
				</section>

				{view === "list" ? (
					<IssueList issues={issues} />
				) : (
					<div className="mt-5 grid gap-4 xl:grid-cols-4">
						{statuses.map((status) => {
							const columnIssues = issues.filter(
								(issue) => issue.status === status,
							);
							return (
								<section
									key={status}
									className={`min-h-[26rem] rounded-md border border-[#d0d7de] bg-[#f6f8fa] p-3 ${
										draggingId ? "border-dashed" : ""
									}`}
									aria-label={issueStatusLabel(status)}
									onDragOver={(event) => event.preventDefault()}
									onDrop={() => {
										if (draggingId) void platform.moveIssue(draggingId, status);
										setDraggingId(null);
									}}
								>
									<div className="mb-3 flex items-center justify-between">
										<h2 className="font-semibold">
											{issueStatusLabel(status)}
										</h2>
										<span className="rounded-full bg-[#afb8c1]/25 px-2 py-0.5 text-xs font-semibold">
											{columnIssues.length}
										</span>
									</div>
									<div className="space-y-3">
										{columnIssues.map((issue) => (
											<IssueCard
												key={issue.id}
												issue={issue}
												onDragStart={() => setDraggingId(issue.id)}
												onMove={(nextStatus) =>
													void platform.moveIssue(issue.id, nextStatus)
												}
											/>
										))}
									</div>
								</section>
							);
						})}
					</div>
				)}
			</div>
			{createOpen && <NewIssueDialog onClose={() => setCreateOpen(false)} />}
		</div>
	);
}

export function IssueList({
	issues,
	context = "work",
}: {
	issues: Issue[];
	context?: "work" | "repository";
}) {
	const platform = usePlatform();
	const openCount = issues.filter((issue) => issue.state === "open").length;
	const reviewCount = issues.filter(
		(issue) => issue.state === "open" && issue.status === "in-review",
	).length;
	const overdueCount = issues.filter(isIssueOverdue).length;

	return (
		<section className={`issue-docket issue-docket-${context}`}>
			<header className="issue-docket-header">
				<div>
					<p className="issue-docket-kicker">
						<span aria-hidden="true" />
						Active docket
					</p>
					<p className="issue-docket-heading">
						{openCount} open {openCount === 1 ? "matter" : "matters"}
					</p>
				</div>
				<dl className="issue-docket-stats">
					<div>
						<dt>In review</dt>
						<dd>{reviewCount}</dd>
					</div>
					<div className={overdueCount ? "is-alert" : undefined}>
						<dt>Overdue</dt>
						<dd>{overdueCount}</dd>
					</div>
					<div>
						<dt>Matching</dt>
						<dd>{issues.length}</dd>
					</div>
				</dl>
			</header>

			<div className="issue-docket-body">
				{issues.length ? (
					issues.map((issue) => {
						const repository = platform.repositories.find(
							(item) => item.id === issue.repositoryId,
						);
						const labels = platform.labels.filter((label) =>
							issue.labelIds.includes(label.id),
						);
						const overdue = isIssueOverdue(issue);
						const dueSoon = isIssueDueSoon(issue);

						return (
							<Link
								key={issue.id}
								to="/$organization/$repository/issues/$issueNumber"
								params={{
									organization: platform.organization.slug,
									repository: repository?.slug ?? "unknown",
									issueNumber: String(issue.number),
								}}
								preload="intent"
								className="issue-docket-row"
								style={
									{
										"--docket-accent": repository?.color ?? "#0f766e",
									} as CSSProperties
								}
							>
								<div className="issue-docket-id">
									<span>{repository?.prefix ?? "ISSUE"}</span>
									<strong>{String(issue.number).padStart(2, "0")}</strong>
								</div>

								<div className="issue-docket-content">
									<div className="issue-docket-titleline">
										<h2>{issue.title}</h2>
										<span
											className={`docket-status docket-status-${issue.status}`}
										>
											{issueStatusLabel(issue.status)}
										</span>
									</div>
									{issue.description && (
										<p className="issue-docket-description">
											{issue.description}
										</p>
									)}
									<div className="issue-docket-meta">
										<span>{repository?.name}</span>
										<span aria-hidden="true">/</span>
										<span>Updated {relativeDate(issue.updatedAt)}</span>
										{labels.map((label) => (
											<span className="docket-label" key={label.id}>
												<i
													aria-hidden="true"
													style={{ backgroundColor: label.color }}
												/>
												{label.name}
											</span>
										))}
									</div>
								</div>

								<div
									className={`issue-due-stamp ${
										overdue ? "is-overdue" : dueSoon ? "is-soon" : ""
									}`}
								>
									<span>{overdue ? "Past due" : "Due"}</span>
									<strong>{formatIssueDueDate(issue.dueDate)}</strong>
								</div>

								<div className="issue-docket-people">
									<div className="issue-docket-assignees">
										{issue.assigneeIds.length ? (
											issue.assigneeIds
												.slice(0, 3)
												.map((memberId) => (
													<Avatar
														key={memberId}
														member={platform.members.find(
															(member) => member.id === memberId,
														)}
														size="sm"
													/>
												))
										) : (
											<span>Unassigned</span>
										)}
									</div>
									<span className="issue-docket-comments">
										<MessageSquare className="size-3.5" aria-hidden="true" />
										{issue.commentCount}
									</span>
								</div>
							</Link>
						);
					})
				) : (
					<div className="issue-docket-empty">
						<p>No matters match this view.</p>
						<span>Try a different search or filter.</span>
					</div>
				)}
			</div>
		</section>
	);
}

function issueDueTime(issue: Issue) {
	if (!issue.dueDate) return null;
	const value = new Date(`${issue.dueDate}T12:00:00`).getTime();
	return Number.isNaN(value) ? null : value;
}

function todayStart() {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	return today.getTime();
}

function isIssueOverdue(issue: Issue) {
	const due = issueDueTime(issue);
	return issue.state === "open" && due !== null && due < todayStart();
}

function isIssueDueSoon(issue: Issue) {
	const due = issueDueTime(issue);
	if (issue.state !== "open" || due === null || due < todayStart())
		return false;
	return due - todayStart() <= 7 * 24 * 60 * 60 * 1000;
}

function formatIssueDueDate(value?: string) {
	if (!value) return "No date";
	const date = new Date(`${value}T12:00:00`);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
	}).format(date);
}

function IssueCard({
	issue,
	onDragStart,
	onMove,
}: {
	issue: Issue;
	onDragStart: () => void;
	onMove: (status: IssueStatus) => void;
}) {
	const platform = usePlatform();
	const repository = platform.repositories.find(
		(item) => item.id === issue.repositoryId,
	);
	const labels = platform.labels.filter((label) =>
		issue.labelIds.includes(label.id),
	);
	return (
		<article
			draggable
			onDragStart={onDragStart}
			className="cursor-grab rounded-md border border-[#d0d7de] bg-white p-3 shadow-sm active:cursor-grabbing"
		>
			<Link
				to="/$organization/$repository/issues/$issueNumber"
				params={{
					organization: platform.organization.slug,
					repository: repository?.slug ?? "unknown",
					issueNumber: String(issue.number),
				}}
				preload="intent"
				className="block"
			>
				<p
					className="text-xs font-semibold"
					style={{ color: repository?.color }}
				>
					{repository?.prefix}-{issue.number}
				</p>
				<h3 className="mt-1 text-sm font-semibold leading-5 hover:text-[#0969da]">
					{issue.title}
				</h3>
				<div className="mt-2 flex flex-wrap gap-1">
					{labels.slice(0, 2).map((label) => (
						<LabelPill key={label.id} label={label} />
					))}
				</div>
			</Link>
			<div className="mt-3 flex items-center justify-between border-t border-[#d8dee4] pt-3">
				<div className="flex -space-x-1">
					{issue.assigneeIds.slice(0, 2).map((memberId) => (
						<Avatar
							key={memberId}
							member={platform.members.find((member) => member.id === memberId)}
							size="sm"
						/>
					))}
				</div>
				<label className="text-xs text-[#656d76]">
					<span className="sr-only">Move {issue.title}</span>
					<select
						value={issue.status}
						onChange={(event) => onMove(event.target.value as IssueStatus)}
						className="rounded border border-[#d0d7de] bg-white px-1.5 py-1 text-xs"
						aria-label={`Move ${issue.title}`}
					>
						{statuses.map((status) => (
							<option key={status} value={status}>
								{issueStatusLabel(status)}
							</option>
						))}
					</select>
				</label>
			</div>
		</article>
	);
}

export function NewIssueDialog({
	onClose,
	repositoryId = "repo-compliance",
}: {
	onClose: () => void;
	repositoryId?: string;
}) {
	const platform = usePlatform();
	const [input, setInput] = useState<NewIssueInput>({
		repositoryId,
		title: "",
		description: "",
		template: "general",
		assigneeIds: [platform.viewerId],
		locationIds: [],
		labelIds: [],
		dueDate: "",
	});
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);

	async function submit(event: FormEvent) {
		event.preventDefault();
		if (!input.title.trim() || !input.description.trim()) return;
		setPending(true);
		setError("");
		try {
			await platform.createIssue(input);
			onClose();
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : "Could not create issue",
			);
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
			<button
				type="button"
				className="absolute inset-0"
				onClick={onClose}
				aria-label="Close new issue"
			/>
			<form
				onSubmit={submit}
				className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-[#d0d7de] bg-white shadow-2xl"
			>
				<header className="flex items-center justify-between border-b border-[#d8dee4] px-5 py-4">
					<div>
						<h2 className="text-lg font-semibold">New issue</h2>
						<p className="text-xs text-[#656d76]">
							Create trackable work in a governed repository.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-2 hover:bg-[#f6f8fa]"
						aria-label="Close new issue dialog"
					>
						<X className="size-4" />
					</button>
				</header>
				<div className="grid gap-4 p-5 sm:grid-cols-2">
					<Field id="new-issue-repository" label="Repository">
						<select
							id="new-issue-repository"
							value={input.repositoryId}
							onChange={(event) =>
								setInput((current) => ({
									...current,
									repositoryId: event.target.value,
								}))
							}
							className="input"
						>
							{platform.repositories.map((repository) => (
								<option key={repository.id} value={repository.id}>
									{repository.name}
								</option>
							))}
						</select>
					</Field>
					<Field id="new-issue-template" label="Issue type">
						<select
							id="new-issue-template"
							value={input.template}
							onChange={(event) =>
								setInput((current) => ({
									...current,
									template: event.target.value as Issue["template"],
								}))
							}
							className="input"
						>
							<option value="general">General work</option>
							<option value="obligation">Obligation</option>
							<option value="incident">Incident</option>
							<option value="proposal">Proposal</option>
							<option value="question">Question</option>
						</select>
					</Field>
					<Field id="new-issue-title" label="Title" wide>
						<input
							id="new-issue-title"
							value={input.title}
							onChange={(event) =>
								setInput((current) => ({
									...current,
									title: event.target.value,
								}))
							}
							className="input"
							placeholder="Clear, actionable issue title"
							required
						/>
					</Field>
					<Field id="new-issue-description" label="Description" wide>
						<textarea
							id="new-issue-description"
							value={input.description}
							onChange={(event) =>
								setInput((current) => ({
									...current,
									description: event.target.value,
								}))
							}
							className="input min-h-28 resize-y"
							placeholder="What needs to happen, and what evidence is required?"
							required
						/>
					</Field>
					<Field id="new-issue-assignee" label="Assignee">
						<select
							id="new-issue-assignee"
							value={input.assigneeIds[0] ?? ""}
							onChange={(event) =>
								setInput((current) => ({
									...current,
									assigneeIds: event.target.value ? [event.target.value] : [],
								}))
							}
							className="input"
						>
							<option value="">Unassigned</option>
							{platform.members
								.filter((member) => member.role !== "verified-member")
								.map((member) => (
									<option key={member.id} value={member.id}>
										{member.name}
									</option>
								))}
						</select>
					</Field>
					<Field id="new-issue-location" label="Location">
						<select
							id="new-issue-location"
							value={input.locationIds[0] ?? ""}
							onChange={(event) =>
								setInput((current) => ({
									...current,
									locationIds: event.target.value ? [event.target.value] : [],
								}))
							}
							className="input"
						>
							<option value="">Organization-wide</option>
							{platform.locations.map((location) => (
								<option key={location.id} value={location.id}>
									{location.name}
								</option>
							))}
						</select>
					</Field>
					<Field id="new-issue-due-date" label="Due date">
						<input
							id="new-issue-due-date"
							type="date"
							value={input.dueDate}
							onInput={(event) => {
								const dueDate = event.currentTarget.value;
								setInput((current) => ({ ...current, dueDate }));
							}}
							className="input"
						/>
					</Field>
				</div>
				{error && <p className="mx-5 mb-3 text-sm text-[#cf222e]">{error}</p>}
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
						disabled={pending}
						className="rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
					>
						{pending ? "Creating…" : "Create issue"}
					</button>
				</footer>
			</form>
		</div>
	);
}

function Field({
	id,
	label,
	wide = false,
	children,
}: {
	id: string;
	label: string;
	wide?: boolean;
	children: React.ReactNode;
}) {
	return (
		<label
			htmlFor={id}
			className={`block text-sm font-semibold ${wide ? "sm:col-span-2" : ""}`}
		>
			<span className="mb-1.5 block">{label}</span>
			{children}
		</label>
	);
}

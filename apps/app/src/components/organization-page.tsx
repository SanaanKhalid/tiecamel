import { Link } from "@tanstack/react-router";
import {
	ArrowRight,
	CircleDot,
	FileCheck2,
	FileDiff,
	FolderGit2,
	History,
	Plus,
	ShieldAlert,
	X,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { usePlatform } from "../platform/store";
import type { RepositoryVisibility } from "../platform/types";
import {
	Avatar,
	IssueStatusBadge,
	relativeDate,
	VisibilityBadge,
} from "./platform-ui";

export function OrganizationPage() {
	const platform = usePlatform();
	const [createOpen, setCreateOpen] = useState(false);
	const openIssues = platform.issues.filter((issue) => issue.state === "open");
	const pendingChanges = platform.changeRequests.filter((change) =>
		["open", "changes-requested", "approved"].includes(change.status),
	);
	const riskIssues = openIssues.filter((issue) =>
		issue.labelIds.some((labelId) =>
			["label-close", "label-breached"].includes(labelId),
		),
	);

	useEffect(() => {
		if (
			new URLSearchParams(window.location.search).get("new") === "repository"
		) {
			setCreateOpen(true);
		}
	}, []);

	return (
		<div className="dashboard-page mx-auto w-full max-w-[2200px] px-4 py-8 sm:px-6 lg:px-8">
			<section className="dashboard-hero flex flex-col gap-5 border-b border-[#d0d7de] pb-7 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p className="dashboard-eyebrow text-sm font-semibold text-[#656d76]">
						Organization workspace
					</p>
					<h1 className="mt-1 text-3xl font-semibold tracking-[-0.025em]">
						{platform.organization.name}
					</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-[#656d76]">
						{platform.organization.description}
					</p>
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => setCreateOpen(true)}
						className="primary-button inline-flex items-center gap-2 rounded-md bg-[#1f883d] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#1a7f37]"
					>
						<Plus className="size-4" /> New repository
					</button>
					<Link
						to="/work"
						preload="intent"
						className="secondary-button inline-flex items-center gap-2 rounded-md border border-[#d0d7de] bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-[#f6f8fa]"
					>
						<CircleDot className="size-4" /> View all work
					</Link>
				</div>
			</section>

			<section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
				<Metric
					icon={FolderGit2}
					label="Repositories"
					value={platform.repositories.length}
					detail="Governed work areas"
				/>
				<Metric
					icon={CircleDot}
					label="Open issues"
					value={openIssues.length}
					detail="Across every repository"
				/>
				<Metric
					icon={FileDiff}
					label="Pending changes"
					value={pendingChanges.length}
					detail="Waiting for review or acceptance"
				/>
				<Metric
					icon={ShieldAlert}
					label="Needs attention"
					value={riskIssues.length}
					detail="Close to breach or breached"
					warning={riskIssues.length > 0}
				/>
			</section>

			<div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_23rem]">
				<section>
					<div className="mb-3 flex items-center justify-between">
						<h2 className="text-lg font-semibold">Repositories</h2>
						<span className="text-xs text-[#656d76]">
							Each repository has its own rules and audience
						</span>
					</div>
					<div className="repository-card-grid grid gap-4 md:grid-cols-2">
						{platform.repositories.map((repository) => {
							const repoIssues = openIssues.filter(
								(issue) => issue.repositoryId === repository.id,
							);
							const repoChanges = pendingChanges.filter(
								(change) => change.repositoryId === repository.id,
							);
							return (
								<Link
									key={repository.id}
									to="/$organization/$repository"
									params={{
										organization: platform.organization.slug,
										repository: repository.slug,
									}}
									preload="intent"
									className="repository-card group rounded-md border border-[#d0d7de] bg-white p-5 shadow-sm transition hover:border-[#0969da] hover:shadow-md"
								>
									<div className="flex items-start justify-between gap-4">
										<div className="flex min-w-0 items-center gap-3">
											<span
												className="grid size-10 shrink-0 place-items-center rounded-md"
												style={{
													backgroundColor: `${repository.color}14`,
													color: repository.color,
												}}
											>
												<FolderGit2 className="size-5" />
											</span>
											<div className="min-w-0">
												<h3 className="truncate font-semibold text-[#0969da] group-hover:underline">
													{repository.name}
												</h3>
												<VisibilityBadge visibility={repository.visibility} />
											</div>
										</div>
										<ArrowRight className="size-4 text-[#8c959f] transition group-hover:translate-x-1 group-hover:text-[#0969da]" />
									</div>
									<p className="mt-4 min-h-10 text-sm leading-5 text-[#656d76]">
										{repository.description}
									</p>
									<div className="repository-card-stats mt-5 grid grid-cols-3 gap-3 border-t border-[#d8dee4] pt-3 text-xs text-[#656d76]">
										<span>
											<strong>{repoIssues.length}</strong>
											<small>Open</small>
										</span>
										<span>
											<strong>{repoChanges.length}</strong>
											<small>Changes</small>
										</span>
										<span>
											<strong>{repository.recordCount}</strong>
											<small>Records</small>
										</span>
									</div>
								</Link>
							);
						})}
					</div>

					<div className="mt-8 mb-3 flex items-center justify-between">
						<h2 className="text-lg font-semibold">Needs attention</h2>
						<Link
							to="/work"
							preload="intent"
							className="text-sm font-semibold text-[#0969da] hover:underline"
						>
							View all work
						</Link>
					</div>
					<div className="surface-panel overflow-hidden rounded-md border border-[#d0d7de] bg-white">
						{riskIssues.map((issue) => {
							const repository = platform.repositories.find(
								(item) => item.id === issue.repositoryId,
							);
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
									className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0 hover:bg-[#f6f8fa]"
								>
									<CircleDot className="mt-0.5 size-5 shrink-0 text-[#1a7f37]" />
									<div className="min-w-0 flex-1">
										<div className="flex flex-wrap items-center gap-2">
											<h3 className="font-semibold">{issue.title}</h3>
											<IssueStatusBadge status={issue.status} />
										</div>
										<p className="mt-1 text-xs text-[#656d76]">
											{repository?.prefix}-{issue.number} · Updated{" "}
											{relativeDate(issue.updatedAt)}
										</p>
									</div>
									<div className="flex -space-x-1">
										{issue.assigneeIds.slice(0, 2).map((memberId) => (
											<Avatar
												key={memberId}
												member={platform.members.find(
													(member) => member.id === memberId,
												)}
												size="sm"
											/>
										))}
									</div>
								</Link>
							);
						})}
					</div>
				</section>

				<aside>
					<div className="surface-panel rounded-md border border-[#d0d7de] bg-white">
						<div className="flex items-center gap-2 border-b border-[#d8dee4] px-4 py-3">
							<History className="size-4 text-[#656d76]" />
							<h2 className="font-semibold">Recent activity</h2>
						</div>
						<div className="divide-y divide-[#d8dee4]">
							{platform.activity.slice(0, 5).map((event) => {
								const member = platform.members.find(
									(item) => item.id === event.actorId,
								);
								return (
									<article key={event.id} className="flex gap-3 p-4">
										<Avatar member={member} size="sm" />
										<div className="min-w-0">
											<p className="text-sm leading-5">
												<strong>{member?.name ?? "TieCamel"}</strong>{" "}
												{event.action}{" "}
												<span className="font-semibold text-[#0969da]">
													{event.target}
												</span>
											</p>
											<p className="mt-1 text-xs text-[#656d76]">
												{relativeDate(event.createdAt)}
											</p>
										</div>
									</article>
								);
							})}
						</div>
					</div>

					<div className="surface-panel mt-4 rounded-md border border-[#d0d7de] bg-white p-4">
						<div className="flex items-center gap-2">
							<FileCheck2 className="size-4 text-[#1a7f37]" />
							<h2 className="font-semibold">Repository protections</h2>
						</div>
						<p className="mt-2 text-sm leading-5 text-[#656d76]">
							Accepted records cannot be overwritten. Every correction requires
							a new reviewed change request.
						</p>
					</div>
				</aside>
			</div>
			{createOpen && (
				<NewRepositoryDialog onClose={() => setCreateOpen(false)} />
			)}
		</div>
	);
}

export function NewRepositoryDialog({ onClose }: { onClose: () => void }) {
	const platform = usePlatform();
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [prefix, setPrefix] = useState("");
	const [description, setDescription] = useState("");
	const [visibility, setVisibility] =
		useState<RepositoryVisibility>("internal");
	const [minimumApprovals, setMinimumApprovals] = useState(2);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");

	async function submit(event: FormEvent) {
		event.preventDefault();
		setPending(true);
		setError("");
		try {
			const repository = await platform.createRepository({
				name,
				slug,
				prefix,
				description,
				visibility,
				minimumApprovals,
			});
			window.location.href = `/${platform.organization.slug}/${repository.slug}`;
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Could not create repository",
			);
			setPending(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-[#1f2328]/45 p-4">
			<button
				type="button"
				className="absolute inset-0"
				onClick={onClose}
				aria-label="Close repository dialog"
			/>
			<form
				onSubmit={submit}
				className="relative w-full max-w-xl rounded-lg border border-[#d0d7de] bg-white shadow-2xl"
				aria-label="Create repository"
			>
				<div className="flex items-start justify-between border-b border-[#d8dee4] px-5 py-4">
					<div>
						<h2 className="text-lg font-semibold">Create a repository</h2>
						<p className="mt-1 text-sm text-[#656d76]">
							Group issues, proposed changes, and accepted records in one work
							area.
						</p>
					</div>
					<button type="button" onClick={onClose} aria-label="Close">
						<X className="size-5 text-[#656d76]" />
					</button>
				</div>
				<div className="grid gap-4 p-5">
					<label className="grid gap-1 text-sm font-semibold">
						Repository name
						<input
							required
							value={name}
							onChange={(event) => {
								const next = event.target.value;
								setName(next);
								setSlug(
									next
										.toLowerCase()
										.replace(/[^a-z0-9]+/g, "-")
										.replace(/^-|-$/g, ""),
								);
							}}
							className="rounded-md border border-[#d0d7de] px-3 py-2 font-normal"
							placeholder="Programs"
						/>
					</label>
					<div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
						<label className="grid gap-1 text-sm font-semibold">
							Repository URL
							<input
								required
								value={slug}
								onChange={(event) => setSlug(event.target.value.toLowerCase())}
								className="rounded-md border border-[#d0d7de] px-3 py-2 font-mono font-normal"
								placeholder="programs"
							/>
						</label>
						<label className="grid gap-1 text-sm font-semibold">
							Issue prefix
							<input
								required
								maxLength={12}
								value={prefix}
								onChange={(event) =>
									setPrefix(event.target.value.toUpperCase())
								}
								className="rounded-md border border-[#d0d7de] px-3 py-2 font-mono font-normal"
								placeholder="PROG"
							/>
						</label>
					</div>
					<label className="grid gap-1 text-sm font-semibold">
						Description
						<textarea
							required
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							className="min-h-20 rounded-md border border-[#d0d7de] px-3 py-2 font-normal"
							placeholder="What work and records belong here?"
						/>
					</label>
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="grid gap-1 text-sm font-semibold">
							Visibility
							<select
								value={visibility}
								onChange={(event) =>
									setVisibility(event.target.value as RepositoryVisibility)
								}
								className="rounded-md border border-[#d0d7de] bg-white px-3 py-2 font-normal"
							>
								<option value="restricted">Restricted</option>
								<option value="internal">Internal</option>
								<option value="members">Verified members</option>
								<option value="public">Public</option>
							</select>
						</label>
						<label className="grid gap-1 text-sm font-semibold">
							Required approvals
							<input
								type="number"
								min={1}
								max={12}
								value={minimumApprovals}
								onChange={(event) =>
									setMinimumApprovals(Number(event.target.value))
								}
								className="rounded-md border border-[#d0d7de] px-3 py-2 font-normal"
							/>
						</label>
					</div>
					<p className="rounded-md bg-[#f6f8fa] p-3 text-xs leading-5 text-[#656d76]">
						Public repositories expose approved records and selected public
						discussion. Draft files and internal comments stay private.
					</p>
					{error && (
						<p className="text-sm font-medium text-[#cf222e]">{error}</p>
					)}
				</div>
				<div className="flex justify-end gap-2 border-t border-[#d8dee4] px-5 py-4">
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
						{pending ? "Creating…" : "Create repository"}
					</button>
				</div>
			</form>
		</div>
	);
}

function Metric({
	icon: Icon,
	label,
	value,
	detail,
	warning = false,
}: {
	icon: typeof CircleDot;
	label: string;
	value: number;
	detail: string;
	warning?: boolean;
}) {
	return (
		<div
			className={`metric-card rounded-md border border-[#d0d7de] bg-white p-4 shadow-sm ${
				warning ? "metric-card-warning" : ""
			}`}
		>
			<div className="flex items-center justify-between">
				<p className="text-sm font-medium text-[#656d76]">{label}</p>
				<Icon
					className={`size-4 ${warning ? "text-[#cf222e]" : "text-[#656d76]"}`}
				/>
			</div>
			<p
				className={`mt-2 text-2xl font-semibold ${warning ? "text-[#cf222e]" : ""}`}
			>
				{value}
			</p>
			<p className="mt-1 text-xs text-[#656d76]">{detail}</p>
		</div>
	);
}

import { Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	Check,
	ChevronRight,
	CircleDot,
	Clock3,
	Eye,
	Globe2,
	LockKeyhole,
	Users,
} from "lucide-react";
import type {
	ChangeRequestStatus,
	IssueStatus,
	Label,
	Member,
	Repository,
	RepositoryVisibility,
} from "../platform/types";

export function Avatar({
	member,
	size = "md",
}: {
	member?: Member;
	size?: "sm" | "md" | "lg";
}) {
	const classes =
		size === "sm"
			? "size-6 text-[9px]"
			: size === "lg"
				? "size-10 text-xs"
				: "size-8 text-[10px]";
	return (
		<span
			className={`inline-grid shrink-0 place-items-center rounded-full bg-[#ddf4ff] font-bold text-[#0969da] ring-1 ring-[#54aeff]/30 ${classes}`}
			title={member?.name}
		>
			{member?.initials ?? "?"}
		</span>
	);
}

export function LabelPill({ label }: { label: Label }) {
	return (
		<span
			className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
			style={{
				color: label.color,
				borderColor: `${label.color}55`,
				backgroundColor: `${label.color}12`,
			}}
			title={label.description}
		>
			{label.name}
		</span>
	);
}

export function VisibilityBadge({
	visibility,
}: {
	visibility: RepositoryVisibility;
}) {
	const Icon =
		visibility === "public"
			? Globe2
			: visibility === "members"
				? Users
				: visibility === "restricted"
					? LockKeyhole
					: Eye;
	const label =
		visibility === "members"
			? "Members"
			: visibility[0].toUpperCase() + visibility.slice(1);
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-[#d0d7de] px-2 py-0.5 text-xs font-medium text-[#656d76]">
			<Icon className="size-3" /> {label}
		</span>
	);
}

export function IssueStatusBadge({ status }: { status: IssueStatus }) {
	const label = issueStatusLabel(status);
	const style =
		status === "done"
			? "bg-[#dafbe1] text-[#1a7f37]"
			: status === "in-review"
				? "bg-[#fff8c5] text-[#9a6700]"
				: status === "in-progress"
					? "bg-[#ddf4ff] text-[#0969da]"
					: "bg-[#eaeef2] text-[#57606a]";
	return (
		<span
			className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style}`}
		>
			{label}
		</span>
	);
}

export function ChangeStatusBadge({ status }: { status: ChangeRequestStatus }) {
	const styles: Record<ChangeRequestStatus, string> = {
		draft: "bg-[#eaeef2] text-[#57606a]",
		open: "bg-[#dafbe1] text-[#1a7f37]",
		"changes-requested": "bg-[#ffebe9] text-[#cf222e]",
		approved: "bg-[#ddf4ff] text-[#0969da]",
		merged: "bg-[#eddeff] text-[#8250df]",
		closed: "bg-[#eaeef2] text-[#57606a]",
	};
	return (
		<span
			className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles[status]}`}
		>
			{changeStatusLabel(status)}
		</span>
	);
}

export function RepositoryHeader({
	repository,
	active,
}: {
	repository: Repository;
	active:
		| "overview"
		| "issues"
		| "changes"
		| "records"
		| "history"
		| "activity"
		| "settings";
}) {
	const base = `/icn/${repository.slug}`;
	const tabs = [
		{ id: "overview", label: "Overview", href: base },
		{ id: "issues", label: "Issues", href: `${base}/issues` },
		{ id: "changes", label: "Change requests", href: `${base}/changes` },
		{ id: "records", label: "Records", href: `${base}/records` },
		{ id: "history", label: "History", href: `${base}/history` },
		{ id: "activity", label: "Activity", href: `${base}/activity` },
		{ id: "settings", label: "Settings", href: `${base}/settings` },
	] as const;
	return (
		<header className="repository-header border-b border-[#d0d7de] bg-white px-4 pt-5 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-[1800px]">
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<Link
						to="/$organization"
						params={{ organization: "icn" }}
						preload="intent"
						className="font-semibold text-[#0969da] hover:underline"
					>
						ICN
					</Link>
					<ChevronRight className="size-4 text-[#8c959f]" />
					<h1 className="text-xl font-semibold text-[#0969da]">
						{repository.name}
					</h1>
					<VisibilityBadge visibility={repository.visibility} />
				</div>
				<p className="mt-2 max-w-3xl text-sm text-[#656d76]">
					{repository.description}
				</p>
				<nav
					className="mt-5 flex gap-1 overflow-x-auto"
					aria-label={`${repository.name} navigation`}
				>
					{tabs.map((tab) => (
						<Link
							key={tab.id}
							to={tab.href}
							preload="intent"
							className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium ${
								active === tab.id
									? "border-[#0f766e] text-[#17211f]"
									: "border-transparent text-[#656d76] hover:border-[#d0d7de]"
							}`}
						>
							{tab.label}
						</Link>
					))}
				</nav>
			</div>
		</header>
	);
}

export function EmptyState({
	title,
	detail,
}: {
	title: string;
	detail: string;
}) {
	return (
		<div className="rounded-md border border-dashed border-[#afb8c1] bg-white px-6 py-14 text-center">
			<CircleDot className="mx-auto size-8 text-[#8c959f]" />
			<h3 className="mt-3 font-semibold">{title}</h3>
			<p className="mx-auto mt-1 max-w-lg text-sm text-[#656d76]">{detail}</p>
		</div>
	);
}

export function CheckIcon({
	state,
}: {
	state: "passed" | "warning" | "failed" | "running";
}) {
	if (state === "passed") {
		return (
			<span className="grid size-6 place-items-center rounded-full bg-[#dafbe1] text-[#1a7f37]">
				<Check className="size-4" />
			</span>
		);
	}
	if (state === "warning") {
		return (
			<span className="grid size-6 place-items-center rounded-full bg-[#fff8c5] text-[#9a6700]">
				<AlertTriangle className="size-4" />
			</span>
		);
	}
	if (state === "failed") {
		return (
			<span className="grid size-6 place-items-center rounded-full bg-[#ffebe9] text-[#cf222e]">
				<AlertTriangle className="size-4" />
			</span>
		);
	}
	return (
		<span className="grid size-6 place-items-center rounded-full bg-[#ddf4ff] text-[#0969da]">
			<Clock3 className="size-4" />
		</span>
	);
}

export function relativeDate(value: string) {
	const timestamp = new Date(value).getTime();
	const difference = Date.now() - timestamp;
	const days = Math.floor(Math.abs(difference) / 86_400_000);
	if (days === 0) return "today";
	if (days === 1) return difference >= 0 ? "yesterday" : "tomorrow";
	return difference >= 0 ? `${days} days ago` : `in ${days} days`;
}

export function issueStatusLabel(status: IssueStatus) {
	return (
		{
			todo: "To do",
			"in-progress": "In progress",
			"in-review": "In review",
			done: "Done",
		} satisfies Record<IssueStatus, string>
	)[status];
}

export function changeStatusLabel(status: ChangeRequestStatus) {
	return (
		{
			draft: "Draft",
			open: "Open",
			"changes-requested": "Changes requested",
			approved: "Approved",
			merged: "Merged",
			closed: "Closed",
		} satisfies Record<ChangeRequestStatus, string>
	)[status];
}

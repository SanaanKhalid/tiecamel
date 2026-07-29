import { Show, SignInButton, UserButton } from "@clerk/tanstack-react-start";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
	Bell,
	BookOpen,
	Check,
	ChevronDown,
	CircleDot,
	type FileDiff,
	FolderGit2,
	Inbox,
	Menu,
	Plus,
	Search,
	Settings,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { clientConfig } from "../config/client";
import { usePlatform } from "../platform/store";

export function AppShell({ children }: { children: React.ReactNode }) {
	const platform = usePlatform();
	const navigate = useNavigate();
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const routePending = useRouterState({
		select: (state) => state.isTransitioning,
	});
	const [mobileOpen, setMobileOpen] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [globalQuery, setGlobalQuery] = useState("");
	const unread = platform.notifications.filter(
		(notification) => !notification.read,
	).length;
	const currentRepository = useMemo(
		() =>
			platform.repositories.find((repository) =>
				pathname.startsWith(
					`/${platform.organization.slug}/${repository.slug}`,
				),
			),
		[pathname, platform.organization.slug, platform.repositories],
	);
	return (
		<div className="app-modern app-canvas min-h-screen text-[#17211f]">
			<header className="app-topbar sticky top-0 z-40 flex h-16 items-center gap-3 px-4 text-white">
				{routePending && (
					<span
						className="route-progress"
						role="progressbar"
						aria-label="Loading page"
					/>
				)}
				<button
					type="button"
					className="topbar-icon rounded-md p-2 text-white/80 hover:bg-white/10 lg:hidden"
					onClick={() => setMobileOpen(true)}
					aria-label="Open navigation"
				>
					<Menu className="size-5" />
				</button>
				<Link
					to="/$organization"
					params={{ organization: platform.organization.slug }}
					preload="intent"
					className="flex shrink-0 items-center gap-2 font-semibold"
				>
					<span className="app-logo grid size-9 place-items-center overflow-hidden rounded-md bg-white">
						<img
							src="/tiecamel-logo.png"
							alt=""
							className="size-9 scale-125 object-cover"
						/>
					</span>
					<span className="hidden sm:inline">TieCamel</span>
				</Link>
				<button
					type="button"
					className="topbar-control hidden items-center gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10 md:flex"
				>
					<span>{platform.organization.shortName}</span>
					<ChevronDown className="size-4 text-white/50" />
				</button>
				<form
					className="relative ml-1 hidden min-w-0 max-w-3xl flex-1 md:block"
					onSubmit={(event) => {
						event.preventDefault();
						const q = globalQuery.trim();
						if (!q) return;
						void navigate({ to: "/search", search: { q } });
					}}
				>
					<button
						type="submit"
						className="absolute top-1/2 left-2 grid size-6 -translate-y-1/2 place-items-center rounded text-white/45 hover:bg-white/10 hover:text-white"
						aria-label="Search all work"
					>
						<Search className="size-4" />
					</button>
					<input
						className="global-search w-full rounded-md border border-white/20 bg-[#0d1117]/45 py-2 pr-3 pl-9 text-sm text-white placeholder:text-white/45 focus:border-[#58a6ff] focus:outline-none"
						placeholder="Search issues, changes, and records"
						aria-label="Global search"
						value={globalQuery}
						onChange={(event) => setGlobalQuery(event.target.value)}
					/>
				</form>
				<nav className="ml-auto flex items-center gap-1" aria-label="Global">
					<div className="relative">
						<button
							type="button"
							onClick={() => setCreateOpen((value) => !value)}
							className="topbar-icon flex items-center gap-1 rounded-md border border-white/15 p-2 hover:bg-white/10"
							aria-label="Create"
							aria-expanded={createOpen}
						>
							<Plus className="size-4" />
							<ChevronDown className="size-3 text-white/50" />
						</button>
						{createOpen && (
							<div className="app-popover absolute top-11 right-0 w-56 rounded-md border border-[#d0d7de] bg-white p-1 text-sm text-[#1f2328] shadow-xl">
								<Link
									to="/work"
									search={{ new: "issue" }}
									preload="intent"
									className="block rounded px-3 py-2 hover:bg-[#f6f8fa]"
								>
									New issue
								</Link>
								<Link
									to="/$organization/$repository/changes"
									params={{
										organization: platform.organization.slug,
										repository: currentRepository?.slug ?? "compliance",
									}}
									search={{ new: "change" }}
									preload="intent"
									className="block rounded px-3 py-2 hover:bg-[#f6f8fa]"
								>
									New change request
								</Link>
								<Link
									to="/$organization"
									params={{ organization: platform.organization.slug }}
									search={{ new: "repository" }}
									preload="intent"
									className="block rounded px-3 py-2 hover:bg-[#f6f8fa]"
								>
									New repository
								</Link>
							</div>
						)}
					</div>
					<Link
						to="/inbox"
						preload="intent"
						className="topbar-icon relative rounded-md p-2 hover:bg-white/10"
						aria-label={`${unread} unread notifications`}
					>
						<Bell className="size-5" />
						{unread > 0 && (
							<span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-[#2f81f7] ring-2 ring-[#24292f]" />
						)}
					</Link>
					<AccountControl />
				</nav>
			</header>

			<div className="flex min-h-[calc(100vh-4rem)] w-full">
				<aside
					className={`app-sidebar fixed inset-y-0 left-0 z-50 w-72 shrink-0 border-r border-[#d0d7de] bg-white transition-transform lg:sticky lg:top-16 lg:z-10 lg:h-[calc(100vh-4rem)] lg:w-64 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
				>
					<div className="flex h-16 items-center justify-between border-b border-[#d8dee4] px-4 lg:hidden">
						<strong>{platform.organization.shortName}</strong>
						<button
							type="button"
							onClick={() => setMobileOpen(false)}
							className="rounded-md p-2 hover:bg-[#f6f8fa]"
							aria-label="Close navigation"
						>
							<X className="size-5" />
						</button>
					</div>
					<nav className="space-y-1 p-3 text-sm" aria-label="Workspace">
						<NavItem
							href={`/${platform.organization.slug}`}
							active={pathname === `/${platform.organization.slug}`}
							icon={FolderGit2}
							label="Repositories"
						/>
						<NavItem
							href="/work"
							active={pathname === "/work"}
							icon={CircleDot}
							label="Work"
						/>
						<NavItem
							href="/inbox"
							active={pathname === "/inbox"}
							icon={Inbox}
							label="Inbox"
							count={unread}
						/>
						<div className="pt-4 pb-1">
							<p className="px-2 text-xs font-semibold text-[#656d76]">
								Repositories
							</p>
						</div>
						{platform.repositories.map((repository) => (
							<NavItem
								key={repository.id}
								href={`/${platform.organization.slug}/${repository.slug}`}
								active={currentRepository?.id === repository.id}
								icon={BookOpen}
								label={repository.name}
								color={repository.color}
							/>
						))}
					</nav>
					<div className="absolute right-3 bottom-4 left-3 border-t border-[#d8dee4] pt-3">
						<NavItem
							href="/settings"
							active={pathname === "/settings"}
							icon={Settings}
							label="Organization settings"
						/>
					</div>
				</aside>
				{mobileOpen && (
					<button
						type="button"
						className="fixed inset-0 z-40 bg-black/35 lg:hidden"
						onClick={() => setMobileOpen(false)}
						aria-label="Close navigation"
					/>
				)}

				<main className="app-main min-w-0 flex-1">{children}</main>
			</div>
		</div>
	);
}

function NavItem({
	href,
	active,
	icon: Icon,
	label,
	count,
	color,
}: {
	href: string;
	active: boolean;
	icon: typeof FileDiff;
	label: string;
	count?: number;
	color?: string;
}) {
	return (
		<Link
			to={href}
			preload="intent"
			className={`app-nav-item flex items-center gap-2 rounded-md px-2 py-2 font-medium ${
				active
					? "app-nav-item-active bg-[#d0d7de]/45 text-[#1f2328]"
					: "text-[#656d76] hover:bg-[#f6f8fa]"
			}`}
		>
			<Icon className="size-4" style={color ? { color } : undefined} />
			<span className="min-w-0 flex-1 truncate">{label}</span>
			{count ? (
				<span className="rounded-full bg-[#afb8c1]/30 px-2 py-0.5 text-xs">
					{count}
				</span>
			) : null}
		</Link>
	);
}

function AccountControl() {
	if (clientConfig.demoMode || !clientConfig.authConfigured) {
		return <DemoPersonaSwitcher />;
	}
	return (
		<>
			<Show when="signed-in">
				<UserButton />
			</Show>
			<Show when="signed-out">
				<SignInButton mode="modal">
					<button
						type="button"
						className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-semibold"
					>
						Sign in
					</button>
				</SignInButton>
			</Show>
		</>
	);
}

function DemoPersonaSwitcher() {
	const platform = usePlatform();
	const [open, setOpen] = useState(false);
	const viewer = platform.members.find(
		(member) => member.id === platform.viewerId,
	);
	const availableViewers = platform.members.filter(
		(member) => member.role !== "verified-member",
	);

	return (
		<div className="relative ml-1">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="persona-control flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-2 py-1.5 text-left hover:bg-white/10"
				aria-label={`Current View: ${viewer?.name ?? "Board member"} — ${viewer?.title ?? "Member"}`}
				aria-expanded={open}
			>
				<span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#2f81f7] text-xs font-bold">
					{viewer?.initials ?? "MR"}
				</span>
				<span className="hidden min-w-0 sm:block">
					<span className="block text-[10px] leading-3 font-medium text-white/55 uppercase">
						Current View
					</span>
					<span className="block max-w-56 truncate text-xs font-semibold">
						{viewer?.name} — {viewer?.title}
					</span>
				</span>
				<ChevronDown className="hidden size-3.5 text-white/50 sm:block" />
			</button>

			{open && (
				<div className="app-popover absolute top-12 right-0 z-50 w-80 overflow-hidden rounded-md border border-[#d0d7de] bg-white text-[#1f2328] shadow-xl">
					<div className="border-b border-[#d8dee4] px-4 py-3">
						<p className="text-sm font-semibold">Switch current view</p>
						<p className="mt-0.5 text-xs text-[#656d76]">
							Actions and permissions use the selected demo member.
						</p>
					</div>
					<div className="max-h-96 overflow-y-auto p-1.5">
						{availableViewers.map((member) => {
							const selected = member.id === platform.viewerId;
							return (
								<button
									key={member.id}
									type="button"
									onClick={() => {
										platform.switchViewer(member.id);
										setOpen(false);
									}}
									className={`flex w-full items-center gap-3 rounded px-2.5 py-2 text-left ${
										selected ? "bg-[#ddf4ff]" : "hover:bg-[#f6f8fa]"
									}`}
								>
									<span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#ddf4ff] text-xs font-bold text-[#0969da]">
										{member.initials}
									</span>
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-semibold">
											{member.name}
										</span>
										<span className="block truncate text-xs text-[#656d76]">
											{member.title}
										</span>
									</span>
									{selected && (
										<Check className="size-4 shrink-0 text-[#1a7f37]" />
									)}
								</button>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}

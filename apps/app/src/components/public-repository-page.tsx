import { useQuery } from "convex/react";
import {
	ArrowUpRight,
	CheckCircle2,
	CircleAlert,
	CircleDot,
	Clock3,
	FileCheck2,
	FolderGit2,
	Globe2,
	History,
	ShieldCheck,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import { clientConfig } from "../config/client";
import { usePlatform } from "../platform/store";
import { relativeDate } from "./platform-ui";

export function PublicRepositoryPage({
	organizationSlug,
	repositorySlug,
}: {
	organizationSlug: string;
	repositorySlug: string;
}) {
	if (
		!clientConfig.demoMode &&
		clientConfig.convexConfigured &&
		import.meta.env.MODE !== "test"
	) {
		return (
			<LivePublicRepositoryPage
				organizationSlug={organizationSlug}
				repositorySlug={repositorySlug}
			/>
		);
	}
	return (
		<PreviewPublicRepositoryPage
			organizationSlug={organizationSlug}
			repositorySlug={repositorySlug}
		/>
	);
}

function LivePublicRepositoryPage({
	organizationSlug,
	repositorySlug,
}: {
	organizationSlug: string;
	repositorySlug: string;
}) {
	const projection = useQuery(api.publicRepositories.getRepositoryProjection, {
		organizationSlug,
		repositorySlug,
	});
	if (projection === undefined) {
		return (
			<main className="grid min-h-screen place-items-center bg-[#f6f8fa] text-sm text-[#656d76]">
				Loading approved public history…
			</main>
		);
	}
	if (!projection) return <PublicRepositoryNotFound />;

	return (
		<div className="min-h-screen bg-[#f6f8fa] text-[#1f2328]">
			<PublicHeader
				organizationName={projection.organizationSlug.toUpperCase()}
			/>
			<main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
				<section className="border-b border-[#d0d7de] pb-6">
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span className="font-semibold text-[#0969da]">
							{projection.organizationSlug.toUpperCase()}
						</span>
						<span className="text-[#8c959f]">/</span>
						<h1 className="text-2xl font-semibold text-[#0969da]">
							{projection.repository.name}
						</h1>
					</div>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-[#656d76]">
						{projection.repository.description}
					</p>
					<SafeSnapshotNotice />
				</section>
				<div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_20rem]">
					<section>
						<div className="mb-3 flex items-center justify-between">
							<h2 className="font-semibold">Published records</h2>
							<span className="text-xs text-[#656d76]">
								{projection.records.length} public
							</span>
						</div>
						<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
							{projection.records.map((record) => (
								<article
									key={record.id}
									className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0"
								>
									<FileCheck2 className="mt-0.5 size-5 shrink-0 text-[#0969da]" />
									<div className="min-w-0 flex-1">
										<h3 className="font-semibold text-[#0969da]">
											{record.title}
										</h3>
										<p className="mt-1 text-sm text-[#656d76]">
											{record.summary}
										</p>
										<p className="mt-2 font-mono text-[10px] text-[#8c959f]">
											SHA-256 {record.sha256}
										</p>
										<IntegrityVerification verification={record.integrity} />
									</div>
									<span className="text-xs font-semibold text-[#1a7f37]">
										Version {record.version}
									</span>
								</article>
							))}
						</div>
					</section>
					<aside className="space-y-4">
						<section className="rounded-md border border-[#d0d7de] bg-white p-4">
							<div className="flex items-center gap-2">
								<CheckCircle2 className="size-5 text-[#1a7f37]" />
								<h2 className="font-semibold">Verified snapshot</h2>
							</div>
							<p className="mt-2 text-sm leading-5 text-[#656d76]">
								Snapshot {projection.snapshotVersion} was produced from accepted
								records only.
							</p>
							<p className="mt-3 break-all font-mono text-[10px] text-[#8c959f]">
								{projection.snapshotSha256}
							</p>
						</section>
						<section className="rounded-md border border-[#d0d7de] bg-white">
							<div className="flex items-center gap-2 border-b border-[#d8dee4] px-4 py-3">
								<History className="size-4 text-[#656d76]" />
								<h2 className="font-semibold">Public activity</h2>
							</div>
							{projection.activity.map((event) => (
								<article
									key={event.id}
									className="border-b border-[#d8dee4] p-4 last:border-b-0"
								>
									<p className="text-sm font-semibold">
										Accepted change #{event.changeNumber}
									</p>
									<p className="mt-1 text-xs text-[#656d76]">{event.title}</p>
								</article>
							))}
						</section>
					</aside>
				</div>
			</main>
		</div>
	);
}

function IntegrityVerification({
	verification,
}: {
	verification?:
		| {
				status: "queued" | "running" | "anchored" | "failed";
				commitment: string;
				network: "devnet" | "mainnet-beta";
				signature?: string;
				explorerUrl?: string;
		  }
		| undefined;
}) {
	if (!verification) return null;
	if (verification.status === "failed") {
		return (
			<p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#cf222e]">
				<CircleAlert className="size-3.5" />
				Independent verification needs attention
			</p>
		);
	}
	if (verification.status !== "anchored") {
		return (
			<p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[#9a6700]">
				<Clock3 className="size-3.5" />
				Solana verification pending
			</p>
		);
	}
	return (
		<a
			href={verification.explorerUrl}
			target="_blank"
			rel="noreferrer"
			className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#1a7f37] hover:underline"
			title={`Manifest commitment ${verification.commitment}`}
		>
			<ShieldCheck className="size-3.5" />
			Verified on Solana {verification.network}
			<ArrowUpRight className="size-3" />
		</a>
	);
}

function PreviewPublicRepositoryPage({
	organizationSlug,
	repositorySlug,
}: {
	organizationSlug: string;
	repositorySlug: string;
}) {
	const platform = usePlatform();
	const repository = platform.repositories.find(
		(item) =>
			item.slug === repositorySlug &&
			item.visibility === "public" &&
			platform.organization.slug === organizationSlug,
	);
	if (!repository) {
		return (
			<main className="grid min-h-screen place-items-center bg-[#f6f8fa] px-6">
				<section className="max-w-lg text-center">
					<FolderGit2 className="mx-auto size-10 text-[#656d76]" />
					<h1 className="mt-4 text-2xl font-semibold">
						Public repository not found
					</h1>
					<p className="mt-2 text-sm text-[#656d76]">
						This repository is private or has not published an approved
						snapshot.
					</p>
				</section>
			</main>
		);
	}
	const records = platform.records.filter(
		(record) =>
			record.repositoryId === repository.id && record.visibility === "public",
	);
	const issues = platform.issues.filter(
		(issue) =>
			issue.repositoryId === repository.id &&
			!issue.labelIds.includes("label-sensitive"),
	);
	const activity = platform.activity.filter(
		(event) =>
			event.repositoryId === repository.id && event.visibility === "public",
	);

	return (
		<div className="min-h-screen bg-[#f6f8fa] text-[#1f2328]">
			<header className="border-b border-[#d0d7de] bg-[#24292f] text-white">
				<div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
					<span className="grid size-9 place-items-center overflow-hidden rounded-md bg-white">
						<img
							src="/tiecamel-logo.png"
							alt=""
							className="size-9 scale-125 object-cover"
						/>
					</span>
					<strong>TieCamel</strong>
					<span className="text-white/40">/</span>
					<span>{platform.organization.shortName}</span>
					<span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-xs">
						<Globe2 className="size-3.5" /> Public repository
					</span>
				</div>
			</header>
			<main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
				<section className="border-b border-[#d0d7de] pb-6">
					<div className="flex flex-wrap items-center gap-2 text-sm">
						<span className="font-semibold text-[#0969da]">
							{platform.organization.shortName}
						</span>
						<span className="text-[#8c959f]">/</span>
						<h1 className="text-2xl font-semibold text-[#0969da]">
							{repository.name}
						</h1>
					</div>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-[#656d76]">
						{repository.description}
					</p>
					<p className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#54aeff] bg-[#ddf4ff] px-3 py-2 text-xs text-[#0550ae]">
						<ShieldCheck className="size-4" />
						This page is generated only from approved public snapshots. Drafts
						and internal review discussion are excluded.
					</p>
				</section>

				<div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_22rem]">
					<div className="space-y-7">
						<section>
							<div className="mb-3 flex items-center justify-between">
								<h2 className="font-semibold">Published records</h2>
								<span className="text-xs text-[#656d76]">
									{records.length} public
								</span>
							</div>
							<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
								{records.map((record) => {
									const version = record.versions.find(
										(item) => item.id === record.currentVersionId,
									);
									return (
										<article
											key={record.id}
											className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0"
										>
											<FileCheck2 className="mt-0.5 size-5 shrink-0 text-[#0969da]" />
											<div className="min-w-0 flex-1">
												<h3 className="font-semibold text-[#0969da]">
													{record.title}
												</h3>
												<p className="mt-1 text-sm text-[#656d76]">
													{version?.summary}
												</p>
												<p className="mt-2 font-mono text-[10px] text-[#8c959f]">
													SHA-256 {version?.sha256}
												</p>
												<IntegrityVerification
													verification={version?.integrity}
												/>
											</div>
											<span className="text-xs font-semibold text-[#1a7f37]">
												Version {version?.version}
											</span>
										</article>
									);
								})}
							</div>
						</section>

						<section>
							<div className="mb-3 flex items-center justify-between">
								<h2 className="font-semibold">Public issues</h2>
								<span className="text-xs text-[#656d76]">
									{issues.length} visible
								</span>
							</div>
							<div className="overflow-hidden rounded-md border border-[#d0d7de] bg-white">
								{issues.map((issue) => (
									<article
										key={issue.id}
										className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0"
									>
										<CircleDot className="mt-0.5 size-5 shrink-0 text-[#1a7f37]" />
										<div>
											<h3 className="font-semibold">{issue.title}</h3>
											<p className="mt-1 text-xs text-[#656d76]">
												{repository.prefix}-{issue.number} · Updated{" "}
												{relativeDate(issue.updatedAt)}
											</p>
										</div>
									</article>
								))}
							</div>
						</section>
					</div>

					<aside className="space-y-4">
						<section className="rounded-md border border-[#d0d7de] bg-white p-4">
							<div className="flex items-center gap-2">
								<CheckCircle2 className="size-5 text-[#1a7f37]" />
								<h2 className="font-semibold">Publication policy</h2>
							</div>
							<p className="mt-2 text-sm leading-5 text-[#656d76]">
								Records appear here only after independent review, board
								approval, and authorized publication.
							</p>
						</section>
						<section className="rounded-md border border-[#d0d7de] bg-white">
							<div className="flex items-center gap-2 border-b border-[#d8dee4] px-4 py-3">
								<History className="size-4 text-[#656d76]" />
								<h2 className="font-semibold">Public activity</h2>
							</div>
							<div className="divide-y divide-[#d8dee4]">
								{activity.map((event) => (
									<article key={event.id} className="p-4">
										<p className="text-sm">
											<strong>{event.action}</strong> {event.target}
										</p>
										<p className="mt-1 text-xs text-[#656d76]">
											{relativeDate(event.createdAt)}
										</p>
									</article>
								))}
							</div>
						</section>
						<a
							href="/"
							className="flex items-center justify-between rounded-md border border-[#d0d7de] bg-white p-4 text-sm font-semibold text-[#0969da]"
						>
							Sign in to participate <ArrowUpRight className="size-4" />
						</a>
					</aside>
				</div>
			</main>
		</div>
	);
}

function PublicHeader({ organizationName }: { organizationName: string }) {
	return (
		<header className="border-b border-[#d0d7de] bg-[#24292f] text-white">
			<div className="mx-auto flex h-16 max-w-[1280px] items-center gap-3 px-4 sm:px-6">
				<span className="grid size-9 place-items-center overflow-hidden rounded-md bg-white">
					<img
						src="/tiecamel-logo.png"
						alt=""
						className="size-9 scale-125 object-cover"
					/>
				</span>
				<strong>TieCamel</strong>
				<span className="text-white/40">/</span>
				<span>{organizationName}</span>
				<span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-white/20 px-2.5 py-1 text-xs">
					<Globe2 className="size-3.5" /> Public repository
				</span>
			</div>
		</header>
	);
}

function SafeSnapshotNotice() {
	return (
		<p className="mt-4 inline-flex items-center gap-2 rounded-md border border-[#54aeff] bg-[#ddf4ff] px-3 py-2 text-xs text-[#0550ae]">
			<ShieldCheck className="size-4" />
			This page is generated only from approved public snapshots. Drafts and
			internal review discussion are excluded.
		</p>
	);
}

function PublicRepositoryNotFound() {
	return (
		<main className="grid min-h-screen place-items-center bg-[#f6f8fa] px-6">
			<section className="max-w-lg text-center">
				<FolderGit2 className="mx-auto size-10 text-[#656d76]" />
				<h1 className="mt-4 text-2xl font-semibold">
					Public repository not found
				</h1>
				<p className="mt-2 text-sm text-[#656d76]">
					This repository is private or has not published an approved snapshot.
				</p>
			</section>
		</main>
	);
}

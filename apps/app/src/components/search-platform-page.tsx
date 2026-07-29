import { Link, useSearch } from "@tanstack/react-router";
import { CircleDot, FileCheck2, FileDiff, Search } from "lucide-react";
import { useMemo } from "react";
import { usePlatform } from "../platform/store";

export function SearchPlatformPage() {
	const platform = usePlatform();
	const { q } = useSearch({ from: "/_app/search" });
	const query = q.trim().toLowerCase();
	const results = useMemo(() => {
		if (!query) return { issues: [], changes: [], records: [] };
		return {
			issues: platform.issues.filter((issue) =>
				`${issue.title} ${issue.description}`.toLowerCase().includes(query),
			),
			changes: platform.changeRequests.filter((change) =>
				`${change.title} ${change.summary}`.toLowerCase().includes(query),
			),
			records: platform.records.filter((record) =>
				`${record.title} ${record.collection}`.toLowerCase().includes(query),
			),
		};
	}, [platform.changeRequests, platform.issues, platform.records, query]);
	const total =
		results.issues.length + results.changes.length + results.records.length;

	return (
		<div className="px-4 py-8 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-5xl">
				<div className="border-b border-[#d0d7de] pb-5">
					<h1 className="text-2xl font-semibold">Search</h1>
					<p className="mt-1 text-sm text-[#656d76]">
						{query
							? `${total} result${total === 1 ? "" : "s"} for “${q.trim()}”`
							: "Search issues, change requests, and accepted records."}
					</p>
				</div>
				{!query ? (
					<div className="mt-10 grid place-items-center rounded-lg border border-dashed border-[#afb8c1] bg-white py-16 text-center">
						<Search className="size-8 text-[#8c959f]" />
						<p className="mt-3 text-sm text-[#656d76]">
							Enter a search in the header to find governed work.
						</p>
					</div>
				) : total === 0 ? (
					<div className="mt-10 rounded-lg border border-[#d0d7de] bg-white py-12 text-center">
						<p className="font-semibold">No matching work found</p>
						<p className="mt-1 text-sm text-[#656d76]">
							Try a title, record collection, or issue description.
						</p>
					</div>
				) : (
					<div className="mt-6 space-y-7">
						<SearchSection title="Issues" count={results.issues.length}>
							{results.issues.map((issue) => {
								const repository = platform.repositories.find(
									(item) => item.id === issue.repositoryId,
								);
								if (!repository) return null;
								return (
									<Link
										key={issue.id}
										to="/$organization/$repository/issues/$issueNumber"
										params={{
											organization: platform.organization.slug,
											repository: repository.slug,
											issueNumber: String(issue.number),
										}}
										className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0 hover:bg-[#f6f8fa]"
									>
										<CircleDot className="mt-0.5 size-5 shrink-0 text-[#1a7f37]" />
										<div>
											<strong>{issue.title}</strong>
											<p className="mt-1 text-xs text-[#656d76]">
												{repository.prefix}-{issue.number} · {repository.name}
											</p>
										</div>
									</Link>
								);
							})}
						</SearchSection>
						<SearchSection
							title="Change requests"
							count={results.changes.length}
						>
							{results.changes.map((change) => {
								const repository = platform.repositories.find(
									(item) => item.id === change.repositoryId,
								);
								if (!repository) return null;
								return (
									<Link
										key={change.id}
										to="/$organization/$repository/changes/$changeNumber"
										params={{
											organization: platform.organization.slug,
											repository: repository.slug,
											changeNumber: String(change.number),
										}}
										className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0 hover:bg-[#f6f8fa]"
									>
										<FileDiff className="mt-0.5 size-5 shrink-0 text-[#8250df]" />
										<div>
											<strong>{change.title}</strong>
											<p className="mt-1 text-xs text-[#656d76]">
												#{change.number} · {repository.name} · {change.status}
											</p>
										</div>
									</Link>
								);
							})}
						</SearchSection>
						<SearchSection title="Records" count={results.records.length}>
							{results.records.map((record) => {
								const repository = platform.repositories.find(
									(item) => item.id === record.repositoryId,
								);
								if (!repository) return null;
								return (
									<Link
										key={record.id}
										to="/$organization/$repository/records"
										params={{
											organization: platform.organization.slug,
											repository: repository.slug,
										}}
										className="flex gap-3 border-b border-[#d8dee4] p-4 last:border-b-0 hover:bg-[#f6f8fa]"
									>
										<FileCheck2 className="mt-0.5 size-5 shrink-0 text-[#0969da]" />
										<div>
											<strong>{record.title}</strong>
											<p className="mt-1 text-xs text-[#656d76]">
												{record.collection} · {repository.name}
											</p>
										</div>
									</Link>
								);
							})}
						</SearchSection>
					</div>
				)}
			</div>
		</div>
	);
}

function SearchSection({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: React.ReactNode;
}) {
	if (count === 0) return null;
	return (
		<section>
			<div className="mb-2 flex items-center justify-between">
				<h2 className="font-semibold">{title}</h2>
				<span className="text-xs text-[#656d76]">{count}</span>
			</div>
			<div className="overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
				{children}
			</div>
		</section>
	);
}

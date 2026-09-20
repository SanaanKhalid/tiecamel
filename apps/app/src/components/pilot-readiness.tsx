import type { pilotReadiness } from "../governance/readiness";

export function PilotReadiness({
	readiness,
}: {
	readiness: ReturnType<typeof pilotReadiness> | undefined;
}) {
	if (!readiness)
		return <p className="text-sm text-[#687d6e]">Checking pilot setup…</p>;
	return (
		<details className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
			<summary className="cursor-pointer font-semibold text-[#31563d]">
				Pilot readiness · {readiness.demo ? "demo only" : "setup required"}
			</summary>
			<div className="mt-4 space-y-4">
				<p className="text-sm text-[#687d6e]">
					This checklist shows observed setup, not a compliance certificate.
					Live critical closure remains disabled until secure individual
					approvals are connected and verified.
				</p>
				<section
					className="flex flex-wrap gap-2"
					aria-label="Registered responsibility categories"
				>
					{readiness.categories.map((item) => (
						<span
							key={item.category}
							className="rounded-full bg-white px-3 py-1 text-xs text-[#496250]"
						>
							{item.category}: {item.registered} registered
						</span>
					))}
				</section>
				<div className="grid gap-3 md:grid-cols-2">
					{readiness.checks.map((check) => (
						<article
							key={check.id}
							className="rounded-xl border border-[#dce5e0] bg-white p-4"
						>
							<div className="flex flex-wrap items-start justify-between gap-2">
								<h3 className="text-sm font-semibold text-[#31563d]">
									{check.title}
								</h3>
								<span
									className={`rounded-full px-2 py-1 text-[11px] ${check.state === "observed" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
								>
									{check.state === "observed"
										? "Observed"
										: check.state === "unverified"
											? "Needs live test"
											: "Needs attention"}
								</span>
							</div>
							<p className="mt-2 text-xs leading-5 text-[#687d6e]">
								{check.detail}
							</p>
							<p className="mt-2 text-xs leading-5 text-[#3d5b45]">
								<strong>Next: </strong>
								{check.next}
							</p>
						</article>
					))}
				</div>
			</div>
		</details>
	);
}

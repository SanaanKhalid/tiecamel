import { type ReactNode, useEffect, useState } from "react";

export function PublicDemoBoundary({
	pathname,
	children,
}: {
	pathname: string;
	children: ReactNode;
}) {
	// Demo clocks, localized dates and browser-saved sample records must not be
	// hydrated from a server's independently generated values or timezone.
	const [browserReady, setBrowserReady] = useState(false);
	useEffect(() => setBrowserReady(true), []);
	return (
		<>
			<aside
				aria-label="Public demo notice"
				className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
			>
				<div className="mx-auto max-w-7xl">
					<strong>Interactive demo — not a live nonprofit workspace.</strong>{" "}
					Use sample information only. Changes stay in this browser. No server
					uploads, real alerts, or on-chain approvals. Do not enter confidential
					information or rely on this demo for deadlines.
				</div>
			</aside>
			{pathname.startsWith("/verify/") ? (
				<main className="mx-auto max-w-2xl space-y-4 px-6 py-12">
					<h1 className="text-2xl font-semibold">
						Live verification is unavailable in this demo
					</h1>
					<p>
						Sample approvals and records are simulated. This demo does not
						retrieve or claim a live Solana proof.
					</p>
					<a className="underline" href="/">
						Return to the demo
					</a>
				</main>
			) : browserReady ? (
				children
			) : (
				<main aria-busy="true" className="mx-auto max-w-2xl px-6 py-12">
					Loading the sample workspace…
				</main>
			)}
		</>
	);
}

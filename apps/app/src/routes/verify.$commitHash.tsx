import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/verify/$commitHash")({
	component: VerifyPage,
});

function VerifyPage() {
	const { commitHash } = Route.useParams();
	const proof = useQuery(api.verification.getPublicProof, {
		commitSha256: commitHash,
	});
	const verifyLive = useAction(api.verification.verifyLive);
	const [liveResult, setLiveResult] = useState<Awaited<
		ReturnType<typeof verifyLive>
	> | null>(null);
	const [verifying, setVerifying] = useState(false);
	const [error, setError] = useState("");
	const isPublic = proof?.visibility === "public";
	const downloadManifest = () => {
		if (!proof) return;
		const manifest = JSON.stringify(
			{
				format: "tiecamel-public-verification/v2",
				...proof,
			},
			null,
			2,
		);
		const url = URL.createObjectURL(
			new Blob([manifest], { type: "application/json" }),
		);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = `tiecamel-${commitHash}.json`;
		anchor.click();
		URL.revokeObjectURL(url);
	};
	return (
		<main className="min-h-screen bg-[#f6f8fa] px-4 py-12">
			<div className="mx-auto max-w-3xl rounded-xl border border-[#d0d7de] bg-white p-6 shadow-sm sm:p-8">
				<div className="flex items-start gap-3">
					<ShieldCheck className="size-8 text-[#0f766e]" />
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
							TieCamel public proof
						</p>
						<h1 className="mt-1 text-2xl font-semibold">
							Repository commit verification
						</h1>
					</div>
				</div>
				{proof === undefined ? (
					<div className="mt-6 h-24 animate-pulse rounded-lg bg-slate-100" />
				) : proof ? (
					<>
						<div className="mt-6 flex items-center gap-2 rounded-lg bg-[#dafbe1] p-4 text-[#1a7f37]">
							<CheckCircle2 className="size-5" />
							{proof.verification.commitMatches &&
							proof.verification.treeMatches
								? "Commit and repository tree hashes match their canonical manifests."
								: "Stored history failed local hash verification."}
						</div>
						<dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2">
							<Hash label="Commit" value={proof.commitSha256} />
							<Hash
								label="Parent"
								value={proof.parentCommitSha256 ?? "Root commit"}
							/>
							<Hash label="Tree" value={proof.treeSha256} />
							<Hash label="Chain" value={proof.chainId} />
							<Hash label="Network" value={proof.verification.network} />
							<Hash
								label="Anchor status"
								value={liveResult?.status ?? proof.verification.status}
							/>
							{isPublic && (
								<>
									<Hash label="Organization" value={proof.organization ?? ""} />
									<Hash label="Repository" value={proof.repository ?? ""} />
									<Hash label="Record" value={proof.record ?? ""} />
									<Hash label="Version" value={String(proof.version ?? "")} />
								</>
							)}
						</dl>
						<div className="mt-6 flex flex-wrap gap-3">
							<button
								type="button"
								disabled={verifying}
								onClick={async () => {
									setVerifying(true);
									setError("");
									try {
										setLiveResult(
											await verifyLive({ commitSha256: commitHash }),
										);
									} catch (caught) {
										setError(
											caught instanceof Error
												? caught.message
												: "Live verification failed.",
										);
									} finally {
										setVerifying(false);
									}
								}}
								className="rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
							>
								{verifying ? "Checking Solana…" : "Verify live on Solana"}
							</button>
							<button
								type="button"
								onClick={downloadManifest}
								className="rounded-md border border-[#d0d7de] px-4 py-2 text-sm font-semibold"
							>
								Download verification manifest
							</button>
						</div>
						{liveResult && (
							<p
								className={`mt-3 text-sm font-semibold ${liveResult.verified ? "text-[#1a7f37]" : "text-[#cf222e]"}`}
							>
								{liveResult.verified
									? "The canonical hashes and on-chain Memo commitment all match."
									: "The live Solana proof does not match this canonical commit."}
							</p>
						)}
						{error && <p className="mt-3 text-sm text-[#cf222e]">{error}</p>}
						{proof.verification.explorerUrl && (
							<a
								href={proof.verification.explorerUrl}
								target="_blank"
								rel="noreferrer"
								className="mt-6 inline-block font-semibold text-[#0969da] hover:underline"
							>
								Inspect transaction on Solana Explorer
							</a>
						)}
						<p className="mt-6 text-xs leading-5 text-[#656d76]">
							{isPublic
								? "This public repository exposes descriptive record context."
								: "This repository is not public. The proof intentionally exposes only opaque chain linkage, hashes, time, network, and transaction state."}
						</p>
					</>
				) : (
					<div className="mt-6 flex items-center gap-2 rounded-lg bg-[#ffebe9] p-4 text-[#cf222e]">
						<XCircle className="size-5" />
						No commit with this hash is available.
					</div>
				)}
				<Link
					to="/"
					className="mt-8 inline-block text-sm font-semibold text-[#0969da] hover:underline"
				>
					Return to TieCamel
				</Link>
			</div>
		</main>
	);
}

function Hash({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<dt className="font-semibold text-[#656d76]">{label}</dt>
			<dd className="mt-1 break-all font-mono text-xs">{value}</dd>
		</div>
	);
}

import {
	type ApprovalIntent,
	encodeApprovalIntent,
	GOVERNANCE_PROGRAM_ID,
	privateEvidenceCommitment,
} from "@tiecamel/governance";
import { useEffect, useState } from "react";
import { SecureApprovalReview } from "./secure-approval-review";

const evidence = {
	responsibility: "Community center property tax response",
	documentName: "Sample authority settlement receipt.pdf",
	digest: "11".repeat(32),
	salt: "22".repeat(32),
};
/** Development-only UI fixture. No private keys, provider requests or on-chain submissions. */
export default function ApprovalReviewPreview() {
	const [intent, setIntent] = useState<ApprovalIntent>();
	function reset() {
		const now = Date.now();
		setIntent(
			encodeApprovalIntent({
				format: "tiecamel-approval-intent/v1",
				id: crypto.randomUUID(),
				organizationId: "demo-org",
				membershipId: "demo-reviewer",
				userId: "demo-person",
				obligationId: "demo-case",
				appRevision: 7,
				signerIdentity: "33".repeat(32),
				network: "localnet",
				genesisHash: "11111111111111111111111111111111",
				chainId: "44".repeat(32),
				caseId: "55".repeat(32),
				caseRevision: "2",
				policyVersion: "1",
				parent: "66".repeat(32),
				evidenceCommitment: privateEvidenceCommitment(
					evidence.digest,
					evidence.salt,
				).toString("hex"),
				signer: GOVERNANCE_PROGRAM_ID.toBase58(),
				feePayer: "11111111111111111111111111111111",
				blockhash: "11111111111111111111111111111111",
				lastValidBlockHeight: 1000,
				createdAt: now,
				expiresAt: now + 120_000,
			}),
		);
	}
	useEffect(reset, []);
	return (
		<main className="mx-auto max-w-2xl space-y-5 px-4 py-10">
			<header>
				<p className="text-xs font-semibold tracking-widest text-[#687d6e]">
					TIECAMEL / DEVELOPMENT PREVIEW
				</p>
				<h1 className="mt-2 text-2xl font-semibold text-[#31563d]">
					An approval, in your own name.
				</h1>
			</header>
			<p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
				Simulation only. The button below simulates confirmation; it never opens
				a real passkey prompt, contacts a signing provider, or broadcasts a
				transaction. This page is unavailable in production.
			</p>
			{intent && (
				<SecureApprovalReview
					intent={intent}
					evidence={evidence}
					account={{
						subOrganizationId: "00000000-0000-0000-0000-000000000001",
						credentialId: "demoCredentialIdNoRealKey",
						rpId: "localhost",
						address: intent.signer,
						membershipId: intent.membershipId,
						userId: intent.userId,
					}}
					sign={async () => "simulation-not-a-signature"}
					submit={async () => ({
						status: "submitted",
						signature: "DEMONSTRATION — no transaction broadcast",
					})}
				/>
			)}
			<button
				type="button"
				onClick={reset}
				className="rounded-lg border border-[#cbdacf] bg-white px-4 py-2 text-sm text-[#31563d]"
			>
				Start a fresh review
			</button>
		</main>
	);
}

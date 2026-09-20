import {
	type ApprovalIntent,
	inspectApprovalIntent,
	privateEvidenceCommitment,
} from "@tiecamel/governance";
import { useEffect, useRef, useState } from "react";
import {
	type IndividualSigningAccount,
	signApprovalWithPasskey,
	validateSigningAccount,
} from "../governance/passkey-approval";

export type ReviewedEvidence = {
	responsibility: string;
	documentName: string;
	digest: string;
	salt: string;
};
type SubmissionResult = {
	status: "submitted" | "uncertain" | "finalized";
	signature: string;
};
/** Only mount with a server-prepared, stored intent and authenticated individual account. */
export function SecureApprovalReview({
	intent,
	account,
	evidence,
	submit,
	sign = signApprovalWithPasskey,
}: {
	intent: ApprovalIntent;
	account: IndividualSigningAccount;
	evidence: ReviewedEvidence;
	submit: (
		intentId: string,
		signedTransaction: string,
	) => Promise<SubmissionResult>;
	sign?: typeof signApprovalWithPasskey;
}) {
	const [confirmed, setConfirmed] = useState(false);
	const [now, setNow] = useState(Date.now());
	const [phase, setPhase] = useState<
		| "review"
		| "signing"
		| "submitting"
		| "submitted"
		| "uncertain"
		| "finalized"
	>("review");
	const [error, setError] = useState("");
	const [receipt, setReceipt] = useState("");
	const generation = useRef(0);
	const inFlight = useRef(false);
	// biome-ignore lint/correctness/useExhaustiveDependencies: A new intent must reset explicit consent, even when other fields are unchanged.
	useEffect(() => {
		generation.current += 1;
		inFlight.current = false;
		setConfirmed(false);
		setPhase("review");
		setError("");
		setReceipt("");
		setNow(Date.now());
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => {
			window.clearInterval(timer);
			generation.current += 1;
		};
	}, [intent.id]);
	let invalid = "";
	try {
		inspectApprovalIntent(intent, now);
		validateSigningAccount(intent, account);
		if (
			privateEvidenceCommitment(evidence.digest, evidence.salt).toString(
				"hex",
			) !== intent.evidenceCommitment
		)
			throw new Error(
				"This document does not match the evidence being approved",
			);
	} catch (caught) {
		invalid =
			caught instanceof Error ? caught.message : "Approval cannot be verified";
	}
	async function approve() {
		if (!confirmed || invalid || phase !== "review" || inFlight.current) return;
		inFlight.current = true;
		const requestGeneration = generation.current;
		setError("");
		setPhase("signing");
		try {
			const signed = await sign(intent, account);
			if (generation.current !== requestGeneration) return;
			setPhase("submitting");
			const result = await submit(intent.id, signed);
			if (generation.current !== requestGeneration) return;
			setReceipt(result.signature);
			setPhase(result.status);
		} catch (caught) {
			if (generation.current !== requestGeneration) return;
			setError(
				caught instanceof Error ? caught.message : "Approval was not completed",
			);
			// Once submission was attempted, refresh/reconcile before asking for another signature.
			setPhase((current) =>
				current === "submitting" ? "uncertain" : "review",
			);
		} finally {
			if (generation.current === requestGeneration) inFlight.current = false;
		}
	}
	return (
		<section
			aria-label="Review secure approval"
			className="space-y-4 rounded-2xl border border-[#dce5e0] bg-white p-5"
		>
			<h2 className="text-lg font-semibold text-[#31563d]">
				Review before approving
			</h2>
			<p className="text-sm text-[#496250]">
				You are approving the evidence for{" "}
				<strong>{evidence.responsibility}</strong>, not acknowledging a message
				or moving money.
			</p>
			<dl className="grid gap-2 rounded-xl bg-[#f3f6f2] p-4 text-sm">
				<div>
					<dt className="text-xs text-[#687d6e]">Document</dt>
					<dd>{evidence.documentName}</dd>
				</div>
				<div>
					<dt className="text-xs text-[#687d6e]">Responsibility version</dt>
					<dd>{intent.appRevision}</dd>
				</div>
				<div>
					<dt className="text-xs text-[#687d6e]">Review window</dt>
					<dd>
						{Math.max(0, Math.ceil((intent.expiresAt - now) / 1000))} seconds
						remaining
					</dd>
				</div>
			</dl>
			<p className="text-sm text-[#687d6e]">
				Your passkey confirms your own decision. The organization covers the
				processing fee. Closure requires the board's full independent-review
				threshold, including a director; this action alone does not close the
				responsibility.
			</p>
			{phase === "review" && (
				<label className="flex gap-2 text-sm text-[#31563d]">
					<input
						type="checkbox"
						checked={confirmed}
						disabled={Boolean(invalid)}
						onChange={(event) => setConfirmed(event.target.checked)}
					/>
					I reviewed the source evidence and am independent of its owner and
					submitter.
				</label>
			)}
			{((phase === "review" && invalid) || error) && (
				<p role="alert" className="text-sm text-red-700">
					{error || invalid}
				</p>
			)}
			{phase === "review" && (
				<button
					type="button"
					disabled={!confirmed || Boolean(invalid)}
					onClick={() => void approve()}
					className="rounded-lg bg-[#155d46] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
				>
					Confirm with my passkey
				</button>
			)}
			{phase !== "review" && (
				<output className="block rounded-lg bg-[#f3f6f2] p-3 text-sm">
					{phase === "signing"
						? "Waiting for your passkey confirmation…"
						: phase === "submitting"
							? "Submitting your signed approval…"
							: phase === "finalized"
								? "Your approval is independently recorded. This is not a closure or compliance certificate."
								: phase === "uncertain"
									? "Submission could not be confirmed. Reconcile this attempt before trying again."
									: "Submitted; independent confirmation is still pending. No completed approval is claimed yet."}
				</output>
			)}
			{receipt && (
				<details className="text-xs text-[#687d6e]">
					<summary>Verification reference</summary>
					<p className="mt-2 break-all font-mono">{receipt}</p>
				</details>
			)}
		</section>
	);
}

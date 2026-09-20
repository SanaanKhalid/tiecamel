// @vitest-environment jsdom
import { randomBytes, randomUUID } from "node:crypto";
import { Keypair, Transaction } from "@solana/web3.js";
import {
	act,
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import {
	encodeApprovalIntent,
	privateEvidenceCommitment,
} from "@tiecamel/governance";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { SecureApprovalReview } from "../components/secure-approval-review";
import {
	type IndividualSigningAccount,
	signApprovalWithClient,
} from "../governance/passkey-approval";

// jsdom has a separate typed-array realm. Keep Node Buffer and the crypto
// library's instanceof checks in one realm without mocking any cryptography.
vi.hoisted(() =>
	vi.stubGlobal(
		"Uint8Array",
		Object.getPrototypeOf(Buffer.prototype).constructor,
	),
);
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);
function fixture() {
	const signer = Keypair.generate(),
		now = Date.now();
	const evidence = {
		responsibility: "Property tax response",
		documentName: "Official receipt.pdf",
		digest: randomBytes(32).toString("hex"),
		salt: randomBytes(32).toString("hex"),
	};
	const intent = encodeApprovalIntent({
		format: "tiecamel-approval-intent/v1",
		id: randomUUID(),
		organizationId: "nonprofit",
		membershipId: "reviewer",
		userId: "person",
		obligationId: "responsibility",
		appRevision: 7,
		signerIdentity: randomBytes(32).toString("hex"),
		signer: signer.publicKey.toBase58(),
		network: "devnet",
		genesisHash: Keypair.generate().publicKey.toBase58(),
		chainId: randomBytes(32).toString("hex"),
		caseId: randomBytes(32).toString("hex"),
		caseRevision: "2",
		policyVersion: "1",
		parent: randomBytes(32).toString("hex"),
		evidenceCommitment: privateEvidenceCommitment(
			evidence.digest,
			evidence.salt,
		).toString("hex"),
		feePayer: Keypair.generate().publicKey.toBase58(),
		blockhash: Keypair.generate().publicKey.toBase58(),
		lastValidBlockHeight: 900,
		createdAt: now,
		expiresAt: now + 120_000,
	});
	const account: IndividualSigningAccount = {
		subOrganizationId: randomUUID(),
		credentialId: randomBytes(32).toString("base64url"),
		rpId: "localhost",
		address: intent.signer,
		membershipId: intent.membershipId,
		userId: intent.userId,
	};
	const client = {
		signTransaction: vi.fn(async () => {
			const tx = Transaction.from(
				Buffer.from(intent.transactionBase64, "base64"),
			);
			tx.partialSign(signer);
			return {
				activity: {
					status: "ACTIVITY_STATUS_COMPLETED",
					result: {
						signTransactionResult: {
							signedTransaction: tx
								.serialize({ requireAllSignatures: false })
								.toString("hex"),
						},
					},
				},
			};
		}),
	};
	return { intent, account, evidence, signer, now, client };
}
describe("passkey approval adapter and review", () => {
	it("requests one exact Solana transaction from the individual's sub-organization", async () => {
		const f = fixture();
		await signApprovalWithClient(f.intent, f.account, f.client as never);
		expect(f.client.signTransaction).toHaveBeenCalledWith(
			expect.objectContaining({
				organizationId: f.account.subOrganizationId,
				parameters: {
					signWith: f.intent.signer,
					type: "TRANSACTION_TYPE_SOLANA",
					unsignedTransaction: Buffer.from(
						f.intent.transactionBase64,
						"base64",
					).toString("hex"),
				},
			}),
		);
	});
	it("rejects a mismatched individual identity without contacting the provider", async () => {
		const f = fixture();
		await expect(
			signApprovalWithClient(
				f.intent,
				{ ...f.account, membershipId: "other" },
				f.client as never,
			),
		).rejects.toThrow(/reviewer/);
		expect(f.client.signTransaction).not.toHaveBeenCalled();
	});
	it("does not confuse a pending provider activity with a signature", async () => {
		const f = fixture();
		f.client.signTransaction.mockResolvedValue({
			activity: { status: "ACTIVITY_STATUS_PENDING", result: {} },
		} as never);
		await expect(
			signApprovalWithClient(f.intent, f.account, f.client as never),
		).rejects.toThrow(/not completed/);
	});
	it("rejects a provider success response containing an unsigned transaction", async () => {
		const f = fixture();
		f.client.signTransaction.mockResolvedValue({
			activity: {
				status: "ACTIVITY_STATUS_COMPLETED",
				result: {
					signTransactionResult: {
						signedTransaction: Buffer.from(
							f.intent.transactionBase64,
							"base64",
						).toString("hex"),
					},
				},
			},
		});
		await expect(
			signApprovalWithClient(f.intent, f.account, f.client as never),
		).rejects.toThrow(/signature required/);
	});
	it("requires explicit review and labels submitted approvals as pending, not complete", async () => {
		const f = fixture(),
			sign = vi.fn().mockResolvedValue("signed"),
			submit = vi
				.fn()
				.mockResolvedValue({ status: "submitted", signature: "receipt" });
		render(<SecureApprovalReview {...f} sign={sign} submit={submit} />);
		const button = screen.getByRole("button", {
			name: "Confirm with my passkey",
		});
		expect((button as HTMLButtonElement).disabled).toBe(true);
		fireEvent.click(screen.getByRole("checkbox"));
		fireEvent.click(button);
		await waitFor(() =>
			expect(screen.getByRole("status").textContent).toContain(
				"confirmation is still pending",
			),
		);
		expect(submit).toHaveBeenCalledWith(f.intent.id, "signed");
	});
	it("blocks evidence changes and expired intents before prompting for a passkey", () => {
		const f = fixture(),
			sign = vi.fn(),
			submit = vi.fn();
		const view = render(
			<SecureApprovalReview
				{...f}
				evidence={{ ...f.evidence, digest: "0".repeat(64) }}
				sign={sign}
				submit={submit}
			/>,
		);
		expect(screen.getByRole("alert").textContent).toContain("does not match");
		view.rerender(
			<SecureApprovalReview
				{...f}
				intent={{
					...f.intent,
					createdAt: f.now - 200_000,
					expiresAt: f.now - 80_000,
				}}
				sign={sign}
				submit={submit}
			/>,
		);
		expect(screen.getByRole("alert").textContent).toContain("expired");
		expect(sign).not.toHaveBeenCalled();
	});
	it("does not invite a second signature after an uncertain submission", async () => {
		const f = fixture();
		render(
			<SecureApprovalReview
				{...f}
				sign={vi.fn().mockResolvedValue("signed")}
				submit={vi.fn().mockRejectedValue(new Error("Connection interrupted"))}
			/>,
		);
		fireEvent.click(screen.getByRole("checkbox"));
		fireEvent.click(
			screen.getByRole("button", { name: "Confirm with my passkey" }),
		);
		await waitFor(() =>
			expect(screen.getByRole("status").textContent).toContain(
				"Reconcile this attempt",
			),
		);
		expect(
			screen.queryByRole("button", { name: "Confirm with my passkey" }),
		).toBeNull();
	});
	it("drops a late signature when the reviewed intent changes and resets consent", async () => {
		const f = fixture(),
			next = fixture();
		let finish!: (value: string) => void;
		const sign = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					finish = resolve;
				}),
		);
		const submit = vi.fn();
		const view = render(
			<SecureApprovalReview {...f} sign={sign} submit={submit} />,
		);
		fireEvent.click(screen.getByRole("checkbox"));
		fireEvent.click(
			screen.getByRole("button", { name: "Confirm with my passkey" }),
		);
		view.rerender(
			<SecureApprovalReview {...next} sign={sign} submit={submit} />,
		);
		await act(async () => finish("old-signature"));
		expect(submit).not.toHaveBeenCalled();
		expect(screen.queryByRole("alert")).toBeNull();
		expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
			false,
		);
		expect(
			(
				screen.getByRole("button", {
					name: "Confirm with my passkey",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
	});
	it("never starts two concurrent passkey requests and discards a signature after unmount", async () => {
		const f = fixture();
		let finish!: (value: string) => void;
		const sign = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					finish = resolve;
				}),
		);
		const submit = vi.fn();
		const view = render(
			<SecureApprovalReview {...f} sign={sign} submit={submit} />,
		);
		fireEvent.click(screen.getByRole("checkbox"));
		const button = screen.getByRole("button", {
			name: "Confirm with my passkey",
		});
		fireEvent.click(button);
		fireEvent.click(button);
		expect(sign).toHaveBeenCalledTimes(1);
		view.unmount();
		await act(async () => finish("late-signature"));
		expect(submit).not.toHaveBeenCalled();
	});
});

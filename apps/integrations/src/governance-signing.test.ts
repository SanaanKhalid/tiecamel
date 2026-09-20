import { randomBytes, randomUUID } from "node:crypto";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import {
	assertIntentFresh,
	encodeApprovalIntent,
	inspectApprovalIntent,
	verifyReviewerSignature,
} from "@tiecamel/governance";
import { describe, expect, it, vi } from "vitest";
import {
	type ApprovalBinding,
	assertApprovalBinding,
	reconcileApprovalReceipt,
} from "./governance-signing.js";

function fixture() {
	const signer = Keypair.generate(),
		sponsor = Keypair.generate(),
		now = Date.now();
	const binding: ApprovalBinding = {
		organizationId: "org-a",
		membershipId: "member-a",
		userId: "user-a",
		obligationId: "case-a",
		appRevision: 4,
		signerIdentity: randomBytes(32).toString("hex"),
		signer: signer.publicKey.toBase58(),
		active: true,
		chainId: randomBytes(32).toString("hex"),
		caseId: randomBytes(32).toString("hex"),
		evidenceCommitment: randomBytes(32).toString("hex"),
	};
	const intent = encodeApprovalIntent({
		...binding,
		format: "tiecamel-approval-intent/v1",
		id: randomUUID(),
		network: "localnet",
		genesisHash: Keypair.generate().publicKey.toBase58(),
		caseRevision: "2",
		policyVersion: "1",
		parent: randomBytes(32).toString("hex"),
		feePayer: sponsor.publicKey.toBase58(),
		blockhash: Keypair.generate().publicKey.toBase58(),
		lastValidBlockHeight: 900,
		createdAt: now,
		expiresAt: now + 120_000,
	});
	const tx = inspectApprovalIntent(intent, now);
	tx.partialSign(signer);
	const signed = tx.serialize({ requireAllSignatures: false }).toString("hex");
	return { signer, sponsor, now, binding, intent, tx, signed };
}
describe("individual approval security boundary", () => {
	it("accepts only a valid reviewer signature over the exact approval message", () => {
		const f = fixture();
		expect(
			verifyReviewerSignature(f.intent, f.signed, f.now).verifySignatures(
				false,
			),
		).toBe(true);
		expect(() =>
			verifyReviewerSignature(
				f.intent,
				Buffer.from(f.intent.transactionBase64, "base64").toString("hex"),
				f.now,
			),
		).toThrow(/signature required/);
	});
	it("rejects a returned transaction with an added transfer even when the reviewer signed it", () => {
		const f = fixture();
		const malicious = inspectApprovalIntent(f.intent, f.now).add(
			SystemProgram.transfer({
				fromPubkey: f.signer.publicKey,
				toPubkey: f.sponsor.publicKey,
				lamports: 1,
			}),
		);
		malicious.partialSign(f.signer);
		expect(() =>
			verifyReviewerSignature(
				f.intent,
				malicious.serialize({ requireAllSignatures: false }).toString("hex"),
				f.now,
			),
		).toThrow(/different transaction/);
	});
	it("rejects a changed payer or blockhash in the provider response", () => {
		for (const field of ["feePayer", "recentBlockhash"] as const) {
			const f = fixture(),
				changed = inspectApprovalIntent(f.intent, f.now);
			if (field === "feePayer") changed.feePayer = Keypair.generate().publicKey;
			else changed.recentBlockhash = Keypair.generate().publicKey.toBase58();
			changed.signatures = [];
			changed.partialSign(f.signer);
			expect(() =>
				verifyReviewerSignature(
					f.intent,
					changed.serialize({ requireAllSignatures: false }).toString("hex"),
					f.now,
				),
			).toThrow(/different transaction/);
		}
	});
	it("rejects forged signatures, pre-signed requests and unexpected sponsor signatures", () => {
		const f = fixture();
		const forged = Transaction.from(Buffer.from(f.signed, "hex"));
		forged.addSignature(f.signer.publicKey, randomBytes(64));
		expect(() =>
			verifyReviewerSignature(
				f.intent,
				forged
					.serialize({ requireAllSignatures: false, verifySignatures: false })
					.toString("hex"),
				f.now,
			),
		).toThrow(/signature required/);
		expect(() =>
			inspectApprovalIntent(
				{
					...f.intent,
					transactionBase64: Buffer.from(f.signed, "hex").toString("base64"),
				},
				f.now,
			),
		).toThrow(/unsigned/);
		f.tx.partialSign(f.sponsor);
		expect(() =>
			verifyReviewerSignature(
				f.intent,
				f.tx.serialize().toString("hex"),
				f.now,
			),
		).toThrow(/Fee sponsor/);
	});
	it("expires by wall clock and block height and disallows invalid clocks", () => {
		const f = fixture();
		expect(() => assertIntentFresh(f.intent, f.intent.expiresAt)).toThrow(
			/expired/,
		);
		expect(() => assertIntentFresh(f.intent, f.now, 901)).toThrow(/expired/);
		expect(() => assertIntentFresh(f.intent, f.now - 1)).toThrow(/expired/);
		expect(() => assertIntentFresh(f.intent, Number.NaN)).toThrow(/clock/);
		expect(() =>
			inspectApprovalIntent({ ...f.intent, expiresAt: f.now + 120_001 }, f.now),
		).toThrow(/bounded/);
	});
	it("rejects intent metadata tampering and mismatched authenticated bindings", () => {
		const f = fixture();
		for (const key of ["parent", "evidenceCommitment", "caseId"] as const)
			expect(() =>
				inspectApprovalIntent(
					{ ...f.intent, [key]: randomBytes(32).toString("hex") },
					f.now,
				),
			).toThrow(/does not match/);
		for (const key of [
			"organizationId",
			"userId",
			"membershipId",
			"obligationId",
			"signerIdentity",
			"signer",
			"chainId",
			"caseId",
			"evidenceCommitment",
		] as const)
			expect(() =>
				assertApprovalBinding(f.intent, { ...f.binding, [key]: "changed" }),
			).toThrow(/context changed/);
		expect(() =>
			assertApprovalBinding(f.intent, { ...f.binding, appRevision: 5 }),
		).toThrow(/context changed/);
		expect(() =>
			assertApprovalBinding(f.intent, { ...f.binding, active: false }),
		).toThrow(/revoked/);
	});
	it("keeps unavailable and failed receipts distinct from finalized approvals", async () => {
		const f = fixture();
		const rpc = {
			getGenesisHash: vi.fn().mockResolvedValue(f.intent.genesisHash),
			getTransaction: vi.fn().mockResolvedValue(null),
		} as unknown as Parameters<typeof reconcileApprovalReceipt>[0];
		expect(
			(await reconcileApprovalReceipt(rpc, f.intent, "receipt")).status,
		).toBe("pending");
		vi.mocked(rpc.getTransaction).mockResolvedValue({
			meta: { err: { InstructionError: [0, "Custom"] } },
		} as never);
		expect(
			(await reconcileApprovalReceipt(rpc, f.intent, "receipt")).status,
		).toBe("failed");
		vi.mocked(rpc.getTransaction).mockRejectedValue(new Error("RPC offline"));
		await expect(
			reconcileApprovalReceipt(rpc, f.intent, "receipt"),
		).rejects.toThrow(/offline/);
	});
	it("matches finalized receipt bytes and network, including after the request expires", async () => {
		const f = fixture();
		const rpc = {
			getGenesisHash: vi.fn().mockResolvedValue(f.intent.genesisHash),
			getTransaction: vi.fn().mockResolvedValue({
				meta: { err: null },
				slot: 123,
				transaction: { message: f.tx.compileMessage() },
			}),
		} as unknown as Parameters<typeof reconcileApprovalReceipt>[0];
		expect(
			(await reconcileApprovalReceipt(rpc, f.intent, "receipt")).status,
		).toBe("finalized");
		vi.mocked(rpc.getGenesisHash).mockResolvedValue(
			Keypair.generate().publicKey.toBase58(),
		);
		await expect(
			reconcileApprovalReceipt(rpc, f.intent, "receipt"),
		).rejects.toThrow(/network/);
		vi.mocked(rpc.getGenesisHash).mockResolvedValue(f.intent.genesisHash);
		f.tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
		vi.mocked(rpc.getTransaction).mockResolvedValue({
			meta: { err: null },
			slot: 124,
			transaction: { message: f.tx.compileMessage() },
		} as never);
		await expect(
			reconcileApprovalReceipt(rpc, f.intent, "receipt"),
		).rejects.toThrow(/exact approval/);
	});
});

import { randomBytes } from "node:crypto";
import { Keypair, Transaction } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
	boardAddress,
	caseAction,
	caseAddress,
	decodeBoard,
	decodeCase,
	discriminator,
	GOVERNANCE_PROGRAM_ID,
	hash32,
	privateEvidenceCommitment,
	u64,
} from "./governance-client.js";
import {
	type CriticalProofBundle,
	verifyCriticalProof,
} from "./governance-verifier.js";

const bundle = (): CriticalProofBundle => ({
	format: "tiecamel-critical-proof/v1",
	programId: GOVERNANCE_PROGRAM_ID.toBase58(),
	chainId: randomBytes(32).toString("hex"),
	caseId: randomBytes(32).toString("hex"),
	caseRevision: "5",
	policyVersion: "1",
	contentSha256: randomBytes(32).toString("hex"),
	evidenceSalt: randomBytes(32).toString("hex"),
});
describe("independent critical proof verification", () => {
	it("never treats unavailable RPC data as verified", async () => {
		const rpc = {
			getAccountInfo: vi.fn().mockRejectedValue(new Error("offline")),
			getTransaction: vi.fn(),
		};
		expect((await verifyCriticalProof(rpc, bundle())).status).toBe(
			"unavailable",
		);
		rpc.getAccountInfo.mockResolvedValue(null);
		expect((await verifyCriticalProof(rpc, bundle())).status).toBe("pending");
	});
	it("rejects untrusted program identities before making a network request", async () => {
		const rpc = { getAccountInfo: vi.fn(), getTransaction: vi.fn() };
		expect(
			(
				await verifyCriticalProof(rpc, {
					...bundle(),
					programId: Keypair.generate().publicKey.toBase58(),
				})
			).status,
		).toBe("altered");
		expect(rpc.getAccountInfo).not.toHaveBeenCalled();
	});
	it("rejects accounts owned by a different program and malformed account data", async () => {
		const rpc = {
			getAccountInfo: vi.fn().mockResolvedValue({
				owner: Keypair.generate().publicKey,
				data: Buffer.alloc(512),
			}),
			getTransaction: vi.fn(),
		};
		expect((await verifyCriticalProof(rpc, bundle())).status).toBe("altered");
		rpc.getAccountInfo.mockResolvedValue({
			owner: GOVERNANCE_PROGRAM_ID,
			data: Buffer.alloc(512),
		});
		expect((await verifyCriticalProof(rpc, bundle())).status).toBe("altered");
	});
	it("uses salted commitments and rejects invalid digest encodings", () => {
		const b = bundle();
		expect(
			privateEvidenceCommitment(b.contentSha256, b.evidenceSalt),
		).not.toEqual(
			privateEvidenceCommitment(
				b.contentSha256,
				randomBytes(32).toString("hex"),
			),
		);
		expect(() =>
			privateEvidenceCommitment(b.contentSha256, "0".repeat(64)),
		).toThrow(/random/);
		expect(() => hash32("not-a-hash")).toThrow();
		expect(() => u64(-1n)).toThrow();
		expect(() => u64(2n ** 64n)).toThrow();
	});
	it("bounds account decoding and derives stable separate case addresses", () => {
		expect(() => decodeBoard(discriminator("account", "Board"))).toThrow(
			/Truncated/,
		);
		expect(() => decodeCase(Buffer.alloc(8))).toThrow(/discriminator/);
		const oversized = Buffer.alloc(44);
		discriminator("account", "Board").copy(oversized);
		oversized.writeUInt32LE(13, 40);
		expect(() => decodeBoard(oversized)).toThrow(/vector/);
		const chain = randomBytes(32),
			board = boardAddress(chain),
			id = randomBytes(32);
		expect(board.equals(boardAddress(chain))).toBe(true);
		expect(
			caseAddress(board, id).equals(caseAddress(board, randomBytes(32))),
		).toBe(false);
	});
	it("requires approvals to bind policy and marks the reviewer as a transaction signer", () => {
		const b = bundle(),
			board = boardAddress(hash32(b.chainId)),
			actor = Keypair.generate().publicKey;
		const input = {
			board,
			case: caseAddress(board, hash32(b.caseId)),
			actor,
			revision: 2n,
			parent: randomBytes(32),
			commitment: randomBytes(32),
		};
		expect(() => caseAction("approve_resolution", input)).toThrow(/policy/);
		const ix = caseAction("approve_resolution", {
			...input,
			policyVersion: 1n,
		});
		expect(ix.keys.find((k) => k.pubkey.equals(actor))?.isSigner).toBe(true);
		expect(ix.data).toHaveLength(88);
	});
	it("binds the receipt to the actual case account, not an unrelated extra account", async () => {
		const proof = { ...bundle(), finalizationSignature: "test-receipt" };
		const board = boardAddress(hash32(proof.chainId)),
			caseKey = caseAddress(board, hash32(proof.caseId));
		const actor = Keypair.generate().publicKey;
		const commitment = privateEvidenceCommitment(
			proof.contentSha256,
			proof.evidenceSalt,
		);
		const boardBytes = Buffer.concat([
			discriminator("account", "Board"),
			hash32(proof.chainId),
			Buffer.alloc(4),
			Buffer.from([2]),
			actor.toBuffer(),
			u64(1n),
			u64(6n),
			Buffer.alloc(32),
			Buffer.from([0]),
		]);
		const caseBytes = Buffer.concat([
			discriminator("account", "CriticalCase"),
			board.toBuffer(),
			hash32(proof.caseId),
			Buffer.alloc(96),
			commitment,
			u64(5n),
			u64(2n),
			u64(1n),
			Buffer.from([2]),
			Buffer.alloc(4),
			Buffer.from([0]),
		]);
		const ix = caseAction("finalize_resolution", {
			board,
			case: caseKey,
			actor,
			revision: 4n,
			parent: Buffer.alloc(32),
			commitment,
		});
		const compile = () =>
			new Transaction({
				feePayer: actor,
				recentBlockhash: Keypair.generate().publicKey.toBase58(),
			})
				.add(ix)
				.compileMessage();
		const rpc = {
			getAccountInfo: vi.fn(async (key) => ({
				owner: GOVERNANCE_PROGRAM_ID,
				data: key.equals(board) ? boardBytes : caseBytes,
			})),
			getTransaction: vi.fn().mockResolvedValue({
				meta: { err: null },
				transaction: { message: compile() },
			}),
		};
		// The mock is deliberately restricted to the RPC fields used by the verifier.
		expect(
			(
				await verifyCriticalProof(
					rpc as unknown as Parameters<typeof verifyCriticalProof>[0],
					proof,
				)
			).status,
		).toBe("verified");
		ix.keys[1] = {
			pubkey: Keypair.generate().publicKey,
			isSigner: false,
			isWritable: true,
		};
		ix.keys.push({ pubkey: caseKey, isSigner: false, isWritable: false });
		rpc.getTransaction.mockResolvedValue({
			meta: { err: null },
			transaction: { message: compile() },
		});
		expect(
			(
				await verifyCriticalProof(
					rpc as unknown as Parameters<typeof verifyCriticalProof>[0],
					proof,
				)
			).status,
		).toBe("altered");
		rpc.getTransaction.mockResolvedValue({
			meta: { err: null },
			transaction: { message: {} },
		});
		expect(
			(
				await verifyCriticalProof(
					rpc as unknown as Parameters<typeof verifyCriticalProof>[0],
					proof,
				)
			).status,
		).toBe("altered");
	});
});

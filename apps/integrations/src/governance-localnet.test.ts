import { randomBytes } from "node:crypto";
import {
	Connection,
	Keypair,
	sendAndConfirmTransaction,
	Transaction,
	type TransactionInstruction,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import {
	amendBoard,
	boardAddress,
	caseAction,
	caseAddress,
	decodeBoard,
	decodeCase,
	GOVERNANCE_PROGRAM_ID,
	initializeBoard,
	privateEvidenceCommitment,
	reassignCase,
	registerCase,
	reportingCheckpoint,
} from "./governance-client.js";
import {
	type CriticalProofBundle,
	verifyCriticalProof,
} from "./governance-verifier.js";

// Explicit opt-in: this suite spends only local-validator SOL, never a public network balance.
const rpcUrl = process.env.TIECAMEL_SOLANA_TEST_RPC;
describe.runIf(Boolean(rpcUrl))("deployed governance program", () => {
	it("enforces independent, revision-bound approval and verifies the finalized proof", async () => {
		if (!rpcUrl) throw new Error("Explicit local test RPC is required");
		const url = new URL(rpcUrl);
		if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
			throw new Error("This suite requires a loopback validator");
		const rpc = new Connection(rpcUrl, "confirmed");
		const [payer, owner, reviewer, director, service, alternate] = Array.from(
			{ length: 6 },
			() => Keypair.generate(),
		);
		const people = [owner, reviewer, director, alternate];
		const members = people.map((person, i) => ({
			key: person.publicKey,
			identity: randomBytes(32),
			director: i === 2,
		}));
		const chainId = randomBytes(32),
			caseId = randomBytes(32),
			board = boardAddress(chainId),
			caseKey = caseAddress(board, caseId);
		const contentSha256 = randomBytes(32).toString("hex"),
			evidenceSalt = randomBytes(32).toString("hex");
		const commitment = privateEvidenceCommitment(contentSha256, evidenceSalt);
		const airdrop = await rpc.requestAirdrop(payer.publicKey, 3_000_000_000);
		await rpc.confirmTransaction(
			{ signature: airdrop, ...(await rpc.getLatestBlockhash()) },
			"confirmed",
		);
		const send = (instruction: TransactionInstruction, signers: Keypair[]) =>
			sendAndConfirmTransaction(
				rpc,
				new Transaction().add(instruction),
				[payer, ...signers.filter((s) => !s.publicKey.equals(payer.publicKey))],
				{ commitment: "confirmed" },
			);
		const boardState = async () => {
			const account = await rpc.getAccountInfo(board);
			if (!account) throw new Error("Board account was not created");
			return decodeBoard(account.data);
		};
		const caseState = async () => {
			const account = await rpc.getAccountInfo(caseKey);
			if (!account) throw new Error("Case account was not created");
			return decodeCase(account.data);
		};
		const args = async (actor: Keypair) => ({
			board,
			case: caseKey,
			actor: actor.publicKey,
			revision: (await caseState()).revision,
			parent: (await boardState()).head,
			commitment,
			policyVersion: (await boardState()).policyVersion,
		});
		const action = async (
			name: "propose_resolution" | "approve_resolution" | "finalize_resolution",
			actor: Keypair,
		) => send(caseAction(name, await args(actor)), [actor]);
		const adoption = {
			chainId,
			members,
			threshold: 2,
			service: service.publicKey,
			payer: payer.publicKey,
			quorum: [reviewer.publicKey, director.publicKey],
		};
		await expect(
			send(initializeBoard({ ...adoption, quorum: [service.publicKey] }), [
				service,
			]),
		).rejects.toThrow(/QuorumRequired/);
		await expect(
			send(
				initializeBoard({
					...adoption,
					members: members.map((m, i) =>
						i === 3 ? { ...m, identity: members[0].identity } : m,
					),
				}),
				[reviewer, director],
			),
		).rejects.toThrow(/DuplicatePerson/);
		await send(initializeBoard(adoption), [reviewer, director]);
		expect((await boardState()).sequence).toBe(1n);
		await send(
			registerCase({
				board,
				caseId,
				ownerIdentity: members[0].identity,
				parent: (await boardState()).head,
				noticeCommitment: randomBytes(32),
				actor: service.publicKey,
				payer: payer.publicKey,
			}),
			[service],
		);
		await expect(action("propose_resolution", service)).rejects.toThrow(
			/Unauthorized/,
		);
		await action("propose_resolution", owner);
		await expect(action("approve_resolution", owner)).rejects.toThrow(
			/SelfApproval/,
		);
		await expect(action("approve_resolution", service)).rejects.toThrow(
			/Unauthorized/,
		);
		const stale = await args(director);
		await action("approve_resolution", reviewer);
		await expect(
			send(caseAction("approve_resolution", stale), [director]),
		).rejects.toThrow(/StaleParent/);
		await expect(action("approve_resolution", reviewer)).rejects.toThrow(
			/DuplicateApproval/,
		);
		await expect(action("finalize_resolution", service)).rejects.toThrow(
			/QuorumRequired/,
		);
		await action("approve_resolution", alternate);
		await expect(action("finalize_resolution", service)).rejects.toThrow(
			/DirectorRequired/,
		);
		// Replacing evidence invalidates every previous approval, even if bytes are identical.
		await action("propose_resolution", owner);
		expect((await caseState()).approvals).toHaveLength(0);
		await expect(action("finalize_resolution", service)).rejects.toThrow(
			/QuorumRequired/,
		);
		await action("approve_resolution", reviewer);
		await action("approve_resolution", director);
		const amendment = {
			board,
			proposer: service.publicKey,
			policyVersion: (await boardState()).policyVersion,
			parent: (await boardState()).head,
			members,
			threshold: 2,
			service: service.publicKey,
			quorum: [service.publicKey],
		};
		await expect(send(amendBoard(amendment), [service])).rejects.toThrow(
			/QuorumRequired/,
		);
		await expect(
			send(
				amendBoard({
					...amendment,
					threshold: 1,
					quorum: [reviewer.publicKey, director.publicKey],
				}),
				[service, reviewer, director],
			),
		).rejects.toThrow(/WeakPolicy/);
		await send(
			amendBoard({
				...amendment,
				quorum: [reviewer.publicKey, director.publicKey],
			}),
			[service, reviewer, director],
		);
		await expect(action("finalize_resolution", service)).rejects.toThrow(
			/StalePolicy/,
		);
		await action("propose_resolution", owner);
		// A quorum-authorized handover clears all approval authority over the old assignment.
		await action("approve_resolution", reviewer);
		await send(
			reassignCase({
				...(await args(service)),
				ownerIdentity: members[0].identity,
				quorum: [reviewer.publicKey, director.publicKey],
			}),
			[service, reviewer, director],
		);
		expect((await caseState()).approvals).toHaveLength(0);
		await action("approve_resolution", reviewer);
		await action("approve_resolution", director);
		const finalizationSignature = await action("finalize_resolution", service);
		expect((await caseState()).phase).toBe(2);
		await expect(action("propose_resolution", owner)).rejects.toThrow(
			/AlreadyResolved/,
		);
		const state = await caseState();
		// Wait for the actual signature to root, not an arbitrary timer or database flag.
		await rpc.confirmTransaction(
			{ signature: finalizationSignature, ...(await rpc.getLatestBlockhash()) },
			"finalized",
		);
		const bundle: CriticalProofBundle = {
			format: "tiecamel-critical-proof/v1",
			programId: GOVERNANCE_PROGRAM_ID.toBase58(),
			chainId: chainId.toString("hex"),
			caseId: caseId.toString("hex"),
			caseRevision: String(state.revision),
			policyVersion: String(state.policyVersion),
			contentSha256,
			evidenceSalt,
			finalizationSignature,
		};
		expect((await verifyCriticalProof(rpc, bundle)).status).toBe("verified");
		expect(
			(
				await verifyCriticalProof(rpc, {
					...bundle,
					contentSha256: randomBytes(32).toString("hex"),
				})
			).status,
		).toBe("altered");
		expect(
			(
				await verifyCriticalProof(rpc, {
					...bundle,
					caseRevision: String(state.revision - 1n),
				})
			).status,
		).toBe("outdated");
		expect(
			(
				await verifyCriticalProof(rpc, {
					...bundle,
					caseRevision: String(state.revision + 1n),
				})
			).status,
		).toBe("pending");
		expect(
			(
				await verifyCriticalProof(rpc, {
					...bundle,
					finalizationSignature: airdrop,
				})
			).status,
		).toBe("altered");
		// Reporting checkpoints also require board quorum, not merely the app's service signer.
		const report = {
			board,
			proposer: service.publicKey,
			policyVersion: (await boardState()).policyVersion,
			parent: (await boardState()).head,
			commitment: randomBytes(32),
			quorum: [service.publicKey],
		};
		await expect(send(reportingCheckpoint(report), [service])).rejects.toThrow(
			/QuorumRequired/,
		);
		await send(
			reportingCheckpoint({
				...report,
				quorum: [reviewer.publicKey, director.publicKey],
			}),
			[service, reviewer, director],
		);
	}, 120_000);
});

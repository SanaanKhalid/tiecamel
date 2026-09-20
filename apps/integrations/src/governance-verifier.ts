import type { Connection, PublicKey } from "@solana/web3.js";
import {
	boardAddress,
	caseAddress,
	decodeBoard,
	decodeCase,
	discriminator,
	GOVERNANCE_PROGRAM_ID,
	hash32,
	privateEvidenceCommitment,
} from "./governance-client.js";

export type CriticalProofBundle = {
	format: "tiecamel-critical-proof/v1";
	programId: string;
	chainId: string;
	caseId: string;
	caseRevision: string;
	policyVersion: string;
	contentSha256: string;
	evidenceSalt: string;
	finalizationSignature?: string;
};
export type ProofResult = {
	status: "verified" | "altered" | "outdated" | "unavailable" | "pending";
	reason: string;
};
type ProofRpc = Pick<Connection, "getAccountInfo" | "getTransaction">;
/** Independent verifier: only the bundle and a caller-selected trusted RPC are used. */
export async function verifyCriticalProof(
	rpc: ProofRpc,
	bundle: CriticalProofBundle,
): Promise<ProofResult> {
	let board: PublicKey,
		caseKey: PublicKey,
		commitment: Buffer,
		revision: bigint,
		policyVersion: bigint;
	try {
		if (
			bundle.format !== "tiecamel-critical-proof/v1" ||
			bundle.programId !== GOVERNANCE_PROGRAM_ID.toBase58()
		)
			throw new Error("Untrusted proof format or program identity");
		board = boardAddress(hash32(bundle.chainId));
		caseKey = caseAddress(board, hash32(bundle.caseId));
		commitment = privateEvidenceCommitment(
			bundle.contentSha256,
			bundle.evidenceSalt,
		);
		if (
			!/^[1-9][0-9]{0,19}$/.test(bundle.caseRevision) ||
			!/^[1-9][0-9]{0,19}$/.test(bundle.policyVersion)
		)
			throw new Error("Invalid proof versions");
		revision = BigInt(bundle.caseRevision);
		policyVersion = BigInt(bundle.policyVersion);
		if (revision > 0xffffffffffffffffn || policyVersion > 0xffffffffffffffffn)
			throw new Error("Invalid proof versions");
	} catch (error) {
		return {
			status: "altered",
			reason: error instanceof Error ? error.message : "Malformed proof",
		};
	}
	let accounts: Awaited<ReturnType<ProofRpc["getAccountInfo"]>>[];
	try {
		accounts = await Promise.all([
			rpc.getAccountInfo(board, "finalized"),
			rpc.getAccountInfo(caseKey, "finalized"),
		]);
	} catch {
		return {
			status: "unavailable",
			reason: "Independent RPC lookup failed; no verification claim is made",
		};
	}
	const [boardAccount, caseAccount] = accounts;
	if (!boardAccount || !caseAccount)
		return {
			status: "pending",
			reason:
				"The expected governance accounts are not finalized on this network",
		};
	if (
		!boardAccount.owner.equals(GOVERNANCE_PROGRAM_ID) ||
		!caseAccount.owner.equals(GOVERNANCE_PROGRAM_ID)
	)
		return {
			status: "altered",
			reason: "Account is not owned by the trusted governance program",
		};
	try {
		const currentBoard = decodeBoard(boardAccount.data);
		const currentCase = decodeCase(caseAccount.data);
		if (
			!currentBoard.chainId.equals(hash32(bundle.chainId)) ||
			!currentCase.board.equals(board) ||
			!currentCase.caseId.equals(hash32(bundle.caseId))
		)
			return {
				status: "altered",
				reason: "Proof targets do not match the derived governance accounts",
			};
		if (currentCase.revision > revision)
			return {
				status: "outdated",
				reason: "A newer case revision exists; obtain the current proof",
			};
		if (currentCase.revision < revision)
			return {
				status: "pending",
				reason: "The claimed case revision is not finalized yet",
			};
		if (
			!currentCase.evidenceCommitment.equals(commitment) ||
			currentCase.policyVersion !== policyVersion
		)
			return {
				status: "altered",
				reason: "Evidence or policy does not match the recorded commitment",
			};
		if (currentCase.phase !== 2 || !bundle.finalizationSignature)
			return {
				status: "pending",
				reason: "Independent closure has not been finalized",
			};
	} catch {
		return {
			status: "altered",
			reason: "The account data is not a valid governance record",
		};
	}
	let transaction: Awaited<ReturnType<ProofRpc["getTransaction"]>>;
	try {
		transaction = await rpc.getTransaction(bundle.finalizationSignature, {
			commitment: "finalized",
			maxSupportedTransactionVersion: 0,
		});
	} catch {
		return {
			status: "unavailable",
			reason: "Finalization transaction could not be independently retrieved",
		};
	}
	if (!transaction)
		return {
			status: "unavailable",
			reason:
				"Finalization transaction is not available from this RPC; use an archival endpoint",
		};
	if (!transaction.meta || transaction.meta.err)
		return {
			status: "altered",
			reason: "The supplied transaction did not succeed",
		};
	let matches = false;
	try {
		const message = transaction.transaction.message;
		const keys = message.getAccountKeys({
			accountKeysFromLookups: transaction.meta.loadedAddresses,
		});
		matches = message.compiledInstructions.some((instruction) => {
			const bytes = Buffer.from(instruction.data);
			// Exact account positions matter: an unrelated case can appear in remaining accounts.
			return (
				keys.get(instruction.programIdIndex)?.equals(GOVERNANCE_PROGRAM_ID) &&
				keys.get(instruction.accountKeyIndexes[0])?.equals(board) &&
				keys.get(instruction.accountKeyIndexes[1])?.equals(caseKey) &&
				bytes.length === 80 &&
				bytes
					.subarray(0, 8)
					.equals(discriminator("global", "finalize_resolution")) &&
				bytes.readBigUInt64LE(8) + 1n === revision &&
				bytes.subarray(48, 80).equals(commitment)
			);
		});
	} catch {
		return {
			status: "altered",
			reason: "Malformed finalization transaction response",
		};
	}
	if (!matches)
		return {
			status: "altered",
			reason:
				"Transaction does not finalize this exact case revision and evidence",
		};
	return {
		status: "verified",
		reason:
			"Finalized independent approvals and salted evidence commitment verified. This proves recorded governance, not the truth or legal sufficiency of the underlying document.",
	};
}

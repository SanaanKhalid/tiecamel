import { sha256 } from "@noble/hashes/sha256";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Buffer } from "./buffer.js";
import {
	boardAddress,
	caseAction,
	caseAddress,
	GOVERNANCE_PROGRAM_ID,
	hash32,
} from "./client.js";

/** The server stores this envelope. Never trust an envelope round-tripped from a client. */
export type ApprovalIntent = {
	format: "tiecamel-approval-intent/v1";
	id: string;
	organizationId: string;
	membershipId: string;
	userId: string;
	obligationId: string;
	appRevision: number;
	signerIdentity: string;
	network: "devnet" | "localnet";
	genesisHash: string;
	chainId: string;
	caseId: string;
	caseRevision: string;
	policyVersion: string;
	parent: string;
	evidenceCommitment: string;
	signer: string;
	feePayer: string;
	blockhash: string;
	lastValidBlockHeight: number;
	createdAt: number;
	expiresAt: number;
	messageSha256: string;
	transactionBase64: string;
};

export const MAX_APPROVAL_AGE_MS = 120_000;
export function messageDigest(message: Uint8Array) {
	return Buffer.from(sha256(message)).toString("hex");
}
function version(value: string) {
	if (!/^[1-9][0-9]{0,19}$/.test(value) || BigInt(value) > 0xffffffffffffffffn)
		throw new Error("Invalid approval version");
	return BigInt(value);
}
export function approvalTransaction(
	intent: Omit<ApprovalIntent, "messageSha256" | "transactionBase64">,
) {
	if (
		intent.format !== "tiecamel-approval-intent/v1" ||
		!["devnet", "localnet"].includes(intent.network)
	)
		throw new Error("Unsupported approval intent");
	for (const value of [
		intent.id,
		intent.organizationId,
		intent.membershipId,
		intent.userId,
		intent.obligationId,
	])
		if (!value || value.length > 200)
			throw new Error("Invalid approval identity");
	if (
		!Number.isSafeInteger(intent.appRevision) ||
		intent.appRevision < 1 ||
		!Number.isSafeInteger(intent.lastValidBlockHeight) ||
		intent.lastValidBlockHeight < 1
	)
		throw new Error("Invalid approval revision or expiry height");
	if (
		!Number.isSafeInteger(intent.createdAt) ||
		!Number.isSafeInteger(intent.expiresAt) ||
		intent.expiresAt <= intent.createdAt ||
		intent.expiresAt - intent.createdAt > MAX_APPROVAL_AGE_MS
	)
		throw new Error("Approval expiration must be bounded");
	hash32(intent.signerIdentity);
	new PublicKey(intent.genesisHash);
	const signer = new PublicKey(intent.signer),
		feePayer = new PublicKey(intent.feePayer);
	if (signer.equals(feePayer))
		throw new Error("Reviewer and fee sponsor must be separate");
	const board = boardAddress(hash32(intent.chainId));
	return new Transaction({
		feePayer,
		recentBlockhash: new PublicKey(intent.blockhash).toBase58(),
	}).add(
		caseAction("approve_resolution", {
			board,
			case: caseAddress(board, hash32(intent.caseId)),
			actor: signer,
			revision: version(intent.caseRevision),
			parent: hash32(intent.parent),
			commitment: hash32(intent.evidenceCommitment),
			policyVersion: version(intent.policyVersion),
		}),
	);
}

export function encodeApprovalIntent(
	fields: Omit<ApprovalIntent, "messageSha256" | "transactionBase64">,
): ApprovalIntent {
	const tx = approvalTransaction(fields);
	return {
		...fields,
		messageSha256: messageDigest(tx.serializeMessage()),
		transactionBase64: tx
			.serialize({ requireAllSignatures: false, verifySignatures: false })
			.toString("base64"),
	};
}

export function assertIntentFresh(
	intent: ApprovalIntent,
	now: number,
	blockHeight?: number,
) {
	if (
		!Number.isSafeInteger(now) ||
		(blockHeight !== undefined &&
			(!Number.isSafeInteger(blockHeight) || blockHeight < 0))
	)
		throw new Error("Invalid approval clock or block height");
	if (
		now < intent.createdAt ||
		now >= intent.expiresAt ||
		(blockHeight !== undefined && blockHeight > intent.lastValidBlockHeight)
	)
		throw new Error("Approval expired; refresh and review again");
}

/** Reject arbitrary transfers, added instructions, changed payers and swapped network messages. */
export function inspectApprovalIntent(
	intent: ApprovalIntent,
	now: number,
): Transaction {
	assertIntentFresh(intent, now);
	const expected = approvalTransaction(intent);
	if (
		!/^[A-Za-z0-9+/]+={0,2}$/.test(intent.transactionBase64) ||
		intent.transactionBase64.length > 1800
	)
		throw new Error("Malformed approval transaction");
	const tx = Transaction.from(Buffer.from(intent.transactionBase64, "base64"));
	if (
		!tx.serializeMessage().equals(expected.serializeMessage()) ||
		messageDigest(expected.serializeMessage()) !== intent.messageSha256
	)
		throw new Error("Approval transaction does not match the reviewed intent");
	if (tx.signatures.some((s) => s.signature !== null))
		throw new Error("Approval request must be unsigned");
	return tx;
}

/** A provider's success status is not a signature. Verify actual Ed25519 message signatures. */
export function verifyReviewerSignature(
	intent: ApprovalIntent,
	signedTransactionHex: string,
	now: number,
): Transaction {
	const expected = inspectApprovalIntent(intent, now);
	if (
		!/^[a-f0-9]+$/i.test(signedTransactionHex) ||
		signedTransactionHex.length % 2 ||
		signedTransactionHex.length > 2464
	)
		throw new Error("Malformed signed transaction");
	const signed = Transaction.from(Buffer.from(signedTransactionHex, "hex"));
	if (!signed.serializeMessage().equals(expected.serializeMessage()))
		throw new Error("Signer returned a different transaction");
	const reviewer = signed.signatures.find(
		(s) => s.publicKey.toBase58() === intent.signer,
	);
	if (!reviewer?.signature || !signed.verifySignatures(false))
		throw new Error("Valid independent reviewer signature required");
	if (
		signed.signatures.some(
			(s) => s.publicKey.toBase58() !== intent.signer && s.signature !== null,
		)
	)
		throw new Error("Fee sponsor must sign only after server validation");
	if (!signed.instructions[0]?.programId.equals(GOVERNANCE_PROGRAM_ID))
		throw new Error("Untrusted program");
	return signed;
}

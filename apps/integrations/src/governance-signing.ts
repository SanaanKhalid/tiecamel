import { randomUUID } from "node:crypto";
import { type Connection, PublicKey, type Signer } from "@solana/web3.js";
import {
	type ApprovalIntent,
	assertIntentFresh,
	boardAddress,
	caseAddress,
	decodeBoard,
	decodeCase,
	encodeApprovalIntent,
	GOVERNANCE_PROGRAM_ID,
	hash32,
	inspectApprovalIntent,
	MAX_APPROVAL_AGE_MS,
	messageDigest,
	verifyReviewerSignature,
} from "@tiecamel/governance";
import bs58 from "bs58";

/** Must originate from current authenticated membership + managed evidence, never request JSON. */
export type ApprovalBinding = {
	organizationId: string;
	membershipId: string;
	userId: string;
	obligationId: string;
	appRevision: number;
	signerIdentity: string;
	signer: string;
	active: boolean;
	chainId: string;
	caseId: string;
	evidenceCommitment: string;
};
export type SigningNetwork = {
	network: "devnet" | "localnet";
	genesisHash: string;
	feePayer: string;
};
type SigningRpc = Pick<
	Connection,
	| "getGenesisHash"
	| "getMultipleAccountsInfoAndContext"
	| "getLatestBlockhash"
	| "getBlockHeight"
	| "sendRawTransaction"
	| "getTransaction"
>;

async function currentChain(
	rpc: SigningRpc,
	binding: ApprovalBinding,
	config: SigningNetwork,
) {
	if (!binding.active) throw new Error("Active signing membership required");
	if (!["localnet", "devnet"].includes(config.network))
		throw new Error("Live mainnet signing is not enabled");
	if ((await rpc.getGenesisHash()) !== config.genesisHash)
		throw new Error("RPC network does not match the adopted network");
	const boardKey = boardAddress(hash32(binding.chainId)),
		caseKey = caseAddress(boardKey, hash32(binding.caseId));
	const snapshot = await rpc.getMultipleAccountsInfoAndContext(
		[boardKey, caseKey],
		{ commitment: "finalized" },
	);
	const [boardAccount, caseAccount] = snapshot.value;
	if (
		!boardAccount?.owner.equals(GOVERNANCE_PROGRAM_ID) ||
		!caseAccount?.owner.equals(GOVERNANCE_PROGRAM_ID)
	)
		throw new Error("Adopted governance accounts are unavailable");
	const board = decodeBoard(boardAccount.data),
		record = decodeCase(caseAccount.data);
	if (
		!board.chainId.equals(hash32(binding.chainId)) ||
		!record.board.equals(boardKey) ||
		!record.caseId.equals(hash32(binding.caseId))
	)
		throw new Error("Wrong governance account binding");
	const member = board.members.find(
		(member) => member.key.toBase58() === binding.signer,
	);
	if (!member || !member.identity.equals(hash32(binding.signerIdentity)))
		throw new Error("Signing key is not on the adopted roster");
	if (
		member.identity.equals(record.ownerIdentity) ||
		member.identity.equals(record.submitterIdentity)
	)
		throw new Error("Owner and submitter cannot approve their own evidence");
	if (
		record.phase !== 1 ||
		record.policyVersion !== board.policyVersion ||
		!record.evidenceCommitment.equals(hash32(binding.evidenceCommitment))
	)
		throw new Error("Evidence or policy changed; resubmit and review again");
	if (
		record.approvals.some((approval) =>
			approval.identity.equals(member.identity),
		)
	)
		throw new Error("Reviewer has already approved this evidence");
	if (!board.service.equals(new PublicKey(config.feePayer)))
		throw new Error("Fee sponsor is not the adopted service key");
	return { board, record, slot: snapshot.context.slot };
}

export async function prepareApprovalIntent(
	rpc: SigningRpc,
	binding: ApprovalBinding,
	config: SigningNetwork,
	now = Date.now(),
): Promise<ApprovalIntent> {
	const { board, record, slot } = await currentChain(rpc, binding, config);
	const block = await rpc.getLatestBlockhash({
		commitment: "finalized",
		minContextSlot: slot,
	});
	return encodeApprovalIntent({
		format: "tiecamel-approval-intent/v1",
		id: randomUUID(),
		organizationId: binding.organizationId,
		membershipId: binding.membershipId,
		userId: binding.userId,
		obligationId: binding.obligationId,
		appRevision: binding.appRevision,
		signerIdentity: binding.signerIdentity,
		network: config.network,
		genesisHash: config.genesisHash,
		chainId: binding.chainId,
		caseId: binding.caseId,
		caseRevision: String(record.revision),
		policyVersion: String(board.policyVersion),
		parent: board.head.toString("hex"),
		evidenceCommitment: binding.evidenceCommitment,
		signer: binding.signer,
		feePayer: config.feePayer,
		blockhash: block.blockhash,
		lastValidBlockHeight: block.lastValidBlockHeight,
		createdAt: now,
		expiresAt: now + MAX_APPROVAL_AGE_MS,
	});
}

export function assertApprovalBinding(
	intent: ApprovalIntent,
	current: ApprovalBinding,
) {
	if (!current.active) throw new Error("Signing membership has been revoked");
	for (const key of [
		"organizationId",
		"membershipId",
		"userId",
		"obligationId",
		"appRevision",
		"signerIdentity",
		"signer",
		"chainId",
		"caseId",
		"evidenceCommitment",
	] as const) {
		if (intent[key] !== current[key])
			throw new Error(
				"Approval context changed; review the current record again",
			);
	}
}

/** Persist/claim the trusted intent atomically before calling; this adapter is not an auth boundary. */
export async function sponsorAndSubmitApproval(
	rpc: SigningRpc,
	intent: ApprovalIntent,
	signedHex: string,
	current: ApprovalBinding,
	sponsor: Signer,
	now = Date.now(),
) {
	assertApprovalBinding(intent, current);
	const signed = verifyReviewerSignature(intent, signedHex, now);
	if (sponsor.publicKey.toBase58() !== intent.feePayer)
		throw new Error("Wrong fee sponsor");
	const chain = await currentChain(rpc, current, {
		network: intent.network,
		genesisHash: intent.genesisHash,
		feePayer: intent.feePayer,
	});
	if (
		String(chain.record.revision) !== intent.caseRevision ||
		String(chain.board.policyVersion) !== intent.policyVersion ||
		chain.board.head.toString("hex") !== intent.parent
	)
		throw new Error("On-chain state changed; obtain a new reviewed intent");
	const blockHeight = await rpc.getBlockHeight("confirmed");
	assertIntentFresh(intent, Math.max(Date.now(), now), blockHeight);
	signed.partialSign(sponsor);
	const bytes = signed.serialize();
	if (!signed.signature) throw new Error("Sponsor signature was not produced");
	const signature = bs58.encode(signed.signature);
	try {
		const response = await rpc.sendRawTransaction(bytes, {
			skipPreflight: false,
			maxRetries: 0,
			preflightCommitment: "confirmed",
		});
		if (response !== signature)
			return { status: "uncertain" as const, signature };
		return { status: "submitted" as const, signature };
	} catch {
		// Timeout can occur after acceptance. Reconcile this exact signature; never fabricate a fresh approval.
		return { status: "uncertain" as const, signature };
	}
}

export async function reconcileApprovalReceipt(
	rpc: SigningRpc,
	intent: ApprovalIntent,
	signature: string,
) {
	// Expiry stops new submissions, not verification of a transaction finalized earlier.
	const expected = inspectApprovalIntent(intent, intent.createdAt);
	if ((await rpc.getGenesisHash()) !== intent.genesisHash)
		throw new Error("Wrong verification network");
	const transaction = await rpc.getTransaction(signature, {
		commitment: "finalized",
		maxSupportedTransactionVersion: 0,
	});
	if (!transaction) return { status: "pending" as const, signature };
	if (!transaction.meta || transaction.meta.err)
		return { status: "failed" as const, signature };
	if (
		messageDigest(transaction.transaction.message.serialize()) !==
			intent.messageSha256 ||
		!Buffer.from(transaction.transaction.message.serialize()).equals(
			expected.serializeMessage(),
		)
	)
		throw new Error("Receipt does not match this exact approval intent");
	return { status: "finalized" as const, signature, slot: transaction.slot };
}

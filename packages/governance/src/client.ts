import { sha256 } from "@noble/hashes/sha256";
import {
	type AccountMeta,
	PublicKey,
	SystemProgram,
	TransactionInstruction,
} from "@solana/web3.js";
import { Buffer } from "./buffer.js";

export const GOVERNANCE_PROGRAM_ID = new PublicKey(
	"4G9rXL6BLXEKWM9QT6YWSBpXaTFBGmYbLB77P3vpZtxD",
);
export type BoardMember = {
	key: PublicKey;
	identity: Buffer;
	director: boolean;
};
export function hash32(hex: string): Buffer {
	if (!/^[a-f0-9]{64}$/.test(hex))
		throw new Error("Expected 32-byte lowercase hex value");
	return Buffer.from(hex, "hex");
}
export function discriminator(namespace: "global" | "account", name: string) {
	return Buffer.from(sha256(`${namespace}:${name}`)).subarray(0, 8);
}
export function u64(value: bigint) {
	if (value < 0n || value > 0xffffffffffffffffn) throw new Error("Invalid u64");
	const b = Buffer.alloc(8);
	b.writeBigUInt64LE(value, 0);
	return b;
}
function bytes32(bytes: Uint8Array) {
	if (bytes.length !== 32) throw new Error("Expected exactly 32 bytes");
	return Buffer.from(bytes);
}
function encodeMembers(members: BoardMember[]) {
	if (members.length > 12)
		throw new Error("At most 12 roster members are supported");
	const length = Buffer.alloc(4);
	length.writeUInt32LE(members.length, 0);
	return Buffer.concat([
		length,
		...members.map((m) =>
			Buffer.concat([
				m.key.toBuffer(),
				bytes32(m.identity),
				Buffer.from([m.director ? 1 : 0]),
			]),
		),
	]);
}
const meta = (
	pubkey: PublicKey,
	isSigner = false,
	isWritable = false,
): AccountMeta => ({ pubkey, isSigner, isWritable });
function ix(
	name: string,
	keys: AccountMeta[],
	data: Buffer[],
	programId = GOVERNANCE_PROGRAM_ID,
) {
	return new TransactionInstruction({
		programId,
		keys,
		data: Buffer.concat([discriminator("global", name), ...data]),
	});
}
export function boardAddress(
	chainId: Buffer,
	programId = GOVERNANCE_PROGRAM_ID,
) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("board"), bytes32(chainId)],
		programId,
	)[0];
}
export function caseAddress(
	board: PublicKey,
	caseId: Buffer,
	programId = GOVERNANCE_PROGRAM_ID,
) {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("case"), board.toBuffer(), bytes32(caseId)],
		programId,
	)[0];
}
export function initializeBoard(input: {
	chainId: Buffer;
	members: BoardMember[];
	threshold: number;
	service: PublicKey;
	payer: PublicKey;
	quorum: PublicKey[];
}) {
	return ix(
		"initialize_board",
		[
			meta(boardAddress(input.chainId), false, true),
			meta(input.payer, true, true),
			meta(SystemProgram.programId),
			...input.quorum.map((key) => meta(key, true)),
		],
		[
			bytes32(input.chainId),
			encodeMembers(input.members),
			Buffer.from([input.threshold]),
			input.service.toBuffer(),
		],
	);
}
export function registerCase(input: {
	board: PublicKey;
	caseId: Buffer;
	ownerIdentity: Buffer;
	parent: Buffer;
	noticeCommitment: Buffer;
	actor: PublicKey;
	payer: PublicKey;
}) {
	return ix(
		"register_case",
		[
			meta(input.board, false, true),
			meta(caseAddress(input.board, input.caseId), false, true),
			meta(input.actor, true),
			meta(input.payer, true, true),
			meta(SystemProgram.programId),
		],
		[
			bytes32(input.caseId),
			bytes32(input.ownerIdentity),
			bytes32(input.parent),
			bytes32(input.noticeCommitment),
		],
	);
}
export type CaseActionInput = {
	board: PublicKey;
	case: PublicKey;
	actor: PublicKey;
	revision: bigint;
	parent: Buffer;
	commitment: Buffer;
	policyVersion?: bigint;
};
export function caseAction(
	name: "propose_resolution" | "approve_resolution" | "finalize_resolution",
	input: CaseActionInput,
) {
	if (name === "approve_resolution" && input.policyVersion === undefined)
		throw new Error("Approval must bind the adopted policy version");
	return ix(
		name,
		[
			meta(input.board, false, true),
			meta(input.case, false, true),
			meta(input.actor, true),
		],
		[
			u64(input.revision),
			bytes32(input.parent),
			bytes32(input.commitment),
			...(name === "approve_resolution"
				? [u64(input.policyVersion ?? 0n)]
				: []),
		],
	);
}
export function amendBoard(input: {
	board: PublicKey;
	proposer: PublicKey;
	policyVersion: bigint;
	parent: Buffer;
	members: BoardMember[];
	threshold: number;
	service: PublicKey;
	quorum: PublicKey[];
}) {
	return ix(
		"amend_board",
		[
			meta(input.board, false, true),
			meta(input.proposer, true),
			...input.quorum.map((key) => meta(key, true)),
		],
		[
			u64(input.policyVersion),
			bytes32(input.parent),
			encodeMembers(input.members),
			Buffer.from([input.threshold]),
			input.service.toBuffer(),
		],
	);
}
export function reportingCheckpoint(input: {
	board: PublicKey;
	proposer: PublicKey;
	policyVersion: bigint;
	parent: Buffer;
	commitment: Buffer;
	quorum: PublicKey[];
}) {
	return ix(
		"append_reporting_checkpoint",
		[
			meta(input.board, false, true),
			meta(input.proposer, true),
			...input.quorum.map((key) => meta(key, true)),
		],
		[
			u64(input.policyVersion),
			bytes32(input.parent),
			bytes32(input.commitment),
		],
	);
}
export function reassignCase(input: {
	board: PublicKey;
	case: PublicKey;
	actor: PublicKey;
	revision: bigint;
	parent: Buffer;
	ownerIdentity: Buffer;
	quorum: PublicKey[];
}) {
	return ix(
		"reassign_case",
		[
			meta(input.board, false, true),
			meta(input.case, false, true),
			meta(input.actor, true),
			...input.quorum.map((key) => meta(key, true)),
		],
		[u64(input.revision), bytes32(input.parent), bytes32(input.ownerIdentity)],
	);
}
class Reader {
	private offset = 8;
	constructor(
		private readonly data: Buffer,
		name: string,
	) {
		if (
			!Buffer.from(data.subarray(0, 8)).equals(discriminator("account", name))
		)
			throw new Error("Unexpected governance account discriminator");
	}
	bytes(length: number) {
		if (this.offset + length > this.data.length)
			throw new Error("Truncated governance account");
		const value = Buffer.from(
			this.data.subarray(this.offset, this.offset + length),
		);
		this.offset += length;
		return value;
	}
	key() {
		return new PublicKey(this.bytes(32));
	}
	u64() {
		return this.bytes(8).readBigUInt64LE();
	}
	byte() {
		return this.bytes(1)[0];
	}
	count() {
		const value = this.bytes(4).readUInt32LE();
		if (value > 12) throw new Error("Invalid governance vector size");
		return value;
	}
}
export function decodeBoard(data: Buffer) {
	const r = new Reader(data, "Board");
	const chainId = r.bytes(32);
	const count = r.count();
	const members = Array.from({ length: count }, () => ({
		key: r.key(),
		identity: r.bytes(32),
		director: r.byte() === 1,
	}));
	return {
		chainId,
		members,
		threshold: r.byte(),
		service: r.key(),
		policyVersion: r.u64(),
		sequence: r.u64(),
		head: r.bytes(32),
		bump: r.byte(),
	};
}
export function decodeCase(data: Buffer) {
	const r = new Reader(data, "CriticalCase");
	const board = r.key(),
		caseId = r.bytes(32),
		ownerIdentity = r.bytes(32),
		submitterIdentity = r.bytes(32),
		noticeCommitment = r.bytes(32),
		evidenceCommitment = r.bytes(32),
		revision = r.u64(),
		evidenceRevision = r.u64(),
		policyVersion = r.u64(),
		phase = r.byte();
	if (phase > 2) throw new Error("Unknown case phase");
	const approvals = Array.from({ length: r.count() }, () => ({
		key: r.key(),
		identity: r.bytes(32),
		evidenceRevision: r.u64(),
		policyVersion: r.u64(),
	}));
	return {
		board,
		caseId,
		ownerIdentity,
		submitterIdentity,
		noticeCommitment,
		evidenceCommitment,
		revision,
		evidenceRevision,
		policyVersion,
		phase,
		approvals,
		bump: r.byte(),
	};
}
/** Store the random salt off-chain with the private evidence, never alongside a private hash on-chain. */
export function privateEvidenceCommitment(
	contentSha256: string,
	saltHex: string,
) {
	const salt = hash32(saltHex);
	if (salt.equals(Buffer.alloc(32)))
		throw new Error("A fresh random evidence salt is required");
	return Buffer.from(
		sha256(
			Buffer.concat([
				Buffer.from("tiecamel:private-evidence:v1"),
				salt,
				hash32(contentSha256),
			]),
		),
	);
}

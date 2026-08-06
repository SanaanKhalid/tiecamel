import { DefaultAzureCredential } from "@azure/identity";
import { SecretClient } from "@azure/keyvault-secrets";
import {
	BlobServiceClient,
	type BlockBlobClient,
} from "@azure/storage-blob";
import { createHash } from "node:crypto";
import {
	Connection,
	Keypair,
	PublicKey,
	sendAndConfirmTransaction,
	Transaction,
	TransactionInstruction,
} from "@solana/web3.js";
import type { IntegrityAnchorCommand } from "./contracts.js";

const MEMO_PROGRAM_ID = new PublicKey(
	"MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
);

export function integrityMemo(commitment: string) {
	const normalized = commitment.toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(normalized)) {
		throw new Error("A Solana integrity commitment must be a SHA-256 hash.");
	}
	return `tiecamel:commit:v2:${normalized}`;
}

export async function anchorIntegrity(command: IntegrityAnchorCommand) {
	const expectedMemo =
		command.proofFormat === "tiecamel-repository-commit/v2"
			? integrityMemo(command.commitment)
			: `tiecamel:v1:${command.commitment.toLowerCase()}`;
	if (command.memo !== expectedMemo) {
		throw new Error("Anchor memo does not match the integrity commitment.");
	}
	await sealCommitManifests(command);
	const configuredNetwork =
		(process.env.SOLANA_NETWORK as "devnet" | "mainnet-beta" | undefined) ??
		"devnet";
	if (configuredNetwork !== command.network) {
		throw new Error(
			`Anchor requested ${command.network}, but this worker is configured for ${configuredNetwork}.`,
		);
	}
	const prior = await loadReceipt(command.idempotencyKey);
	if (prior) return prior;
	const connection = new Connection(requiredEnv("SOLANA_RPC_URL"), "confirmed");
	const payer = await loadPayer();
	const balance = await connection.getBalance(payer.publicKey, "confirmed");
	const minimumLamports = Number(
		process.env.SOLANA_MINIMUM_SIGNER_BALANCE_LAMPORTS ?? "10000000",
	);
	if (balance < minimumLamports) {
		throw new Error(
			`Solana signer balance is below the configured safety threshold (${balance} lamports).`,
		);
	}
	const instruction = new TransactionInstruction({
		keys: [],
		programId: MEMO_PROGRAM_ID,
		data: Buffer.from(command.memo, "utf8"),
	});
	const signature = await sendAndConfirmTransaction(
		connection,
		new Transaction().add(instruction),
		[payer],
		{ commitment: "confirmed", maxRetries: 5 },
	);
	const transaction = await connection.getParsedTransaction(signature, {
		commitment: "confirmed",
		maxSupportedTransactionVersion: 0,
	});
	const observedMemo = transaction?.transaction.message.instructions
		.map((instruction) => {
			if (!("parsed" in instruction)) return undefined;
			return instruction.program === "spl-memo"
				? String(instruction.parsed)
				: undefined;
		})
		.find(Boolean);
	if (observedMemo !== command.memo) {
		throw new Error("Confirmed Solana transaction did not contain the expected commit memo.");
	}
	const cluster = command.network === "devnet" ? "?cluster=devnet" : "";
	const result = {
		signature,
		slot: transaction?.slot ?? 0,
		explorerUrl: `https://explorer.solana.com/tx/${signature}${cluster}`,
		observedMemo,
	};
	await storeReceipt(command.idempotencyKey, result);
	return result;
}

async function loadPayer() {
	const vault = new SecretClient(
		requiredEnv("AZURE_KEY_VAULT_URL"),
		new DefaultAzureCredential(),
	);
	const secret = await vault.getSecret(
		requiredEnv("SOLANA_KEY_VAULT_SECRET_NAME"),
	);
	if (!secret.value)
		throw new Error("Solana signer is missing from Key Vault.");
	let bytes: Uint8Array;
	try {
		const parsed = JSON.parse(secret.value) as
			| number[]
			| { secretKey?: number[] };
		const values = Array.isArray(parsed) ? parsed : parsed.secretKey;
		if (!values) throw new Error("Missing secretKey");
		bytes = Uint8Array.from(values);
	} catch {
		bytes = Uint8Array.from(Buffer.from(secret.value, "base64"));
	}
	if (bytes.length !== 64) {
		throw new Error("Solana signer must contain a 64-byte secret key.");
	}
	return Keypair.fromSecretKey(bytes);
}

function requiredEnv(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is required`);
	return value;
}

async function loadReceipt(idempotencyKey: string) {
	const blob = receiptBlob(idempotencyKey);
	if (!(await blob.exists())) return null;
	const response = await blob.downloadToBuffer();
	return JSON.parse(response.toString("utf8")) as {
		signature: string;
		slot: number;
		explorerUrl: string;
		observedMemo: string;
	};
}

async function storeReceipt(
	idempotencyKey: string,
	result: {
		signature: string;
		slot: number;
		explorerUrl: string;
		observedMemo: string;
	},
) {
	const blob = receiptBlob(idempotencyKey);
	const body = JSON.stringify(result);
	try {
		await blob.upload(body, Buffer.byteLength(body), {
			conditions: { ifNoneMatch: "*" },
			blobHTTPHeaders: { blobContentType: "application/json" },
			metadata: { idempotencykeyhash: receiptName(idempotencyKey) },
		});
	} catch (error) {
		if (
			typeof error !== "object" ||
			error === null ||
			!("statusCode" in error) ||
			error.statusCode !== 412
		) {
			throw error;
		}
	}
}

async function sealCommitManifests(command: IntegrityAnchorCommand) {
	if (!command.commitManifest || !command.treeManifest) return;
	const commitHash = createHash("sha256")
		.update(command.commitManifest)
		.digest("hex");
	if (commitHash !== command.commitment) {
		throw new Error("Commit manifest hash does not match the requested commitment.");
	}
	const parsed = JSON.parse(command.commitManifest) as { treeSha256?: string };
	const treeHash = createHash("sha256")
		.update(command.treeManifest)
		.digest("hex");
	if (parsed.treeSha256 !== treeHash) {
		throw new Error("Tree manifest hash does not match the commit manifest.");
	}
	const service = new BlobServiceClient(
		requiredEnv("AZURE_STORAGE_BLOB_URL"),
		new DefaultAzureCredential(),
	);
	const container = service.getContainerClient("evidence");
	const prefix = `repository-commits/${command.commitment}`;
	await Promise.all([
		uploadImmutableJson(
			container.getBlockBlobClient(`${prefix}/commit.json`),
			command.commitManifest,
		),
		uploadImmutableJson(
			container.getBlockBlobClient(`${prefix}/tree.json`),
			command.treeManifest,
		),
	]);
}

async function uploadImmutableJson(
	blob: BlockBlobClient,
	body: string,
) {
	try {
		await blob.upload(body, Buffer.byteLength(body), {
			conditions: { ifNoneMatch: "*" },
			blobHTTPHeaders: { blobContentType: "application/json" },
		});
	} catch (error) {
		if (
			typeof error !== "object" ||
			error === null ||
			!("statusCode" in error) ||
			error.statusCode !== 412
		) {
			throw error;
		}
	}
}

function receiptBlob(idempotencyKey: string) {
	const service = new BlobServiceClient(
		requiredEnv("AZURE_STORAGE_BLOB_URL"),
		new DefaultAzureCredential(),
	);
	return service
		.getContainerClient("processed")
		.getBlockBlobClient(
			`integrity-receipts/${receiptName(idempotencyKey)}.json`,
		);
}

function receiptName(idempotencyKey: string) {
	return createHash("sha256").update(idempotencyKey).digest("hex");
}

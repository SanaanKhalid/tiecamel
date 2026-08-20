import { Connection, PublicKey } from "@solana/web3.js";

const USDC_MINTS = {
	"mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
	devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const;

export type SolanaFinanceSyncRequest = {
	network: "devnet" | "mainnet-beta";
	ownerAddress: string;
	mintAddress: string;
	beforeSignature?: string;
};

export type SolanaFinanceRpc = Pick<
	Connection,
	| "getParsedTokenAccountsByOwner"
	| "getSignaturesForAddress"
	| "getParsedTransactions"
>;

export async function syncSolanaFinance(
	request: SolanaFinanceSyncRequest,
	rpc?: SolanaFinanceRpc,
) {
	if (request.mintAddress !== USDC_MINTS[request.network]) {
		throw new Error(
			`Only native Circle USDC is supported on ${request.network}.`,
		);
	}
	const owner = new PublicKey(request.ownerAddress);
	const mint = new PublicKey(request.mintAddress);
	const connection =
		rpc ?? new Connection(rpcUrl(request.network), "confirmed");
	const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
		owner,
		{ mint },
		"confirmed",
	);
	const observedBalanceBaseUnits = tokenAccounts.value.reduce(
		(total, account) => {
			const parsed = account.account.data.parsed as {
				info?: { tokenAmount?: { amount?: string } };
			};
			const amount = Number(parsed.info?.tokenAmount?.amount ?? "0");
			if (!Number.isSafeInteger(amount)) {
				throw new Error("USDC balance exceeds the supported integer range.");
			}
			const next = total + amount;
			if (!Number.isSafeInteger(next)) {
				throw new Error("USDC balance exceeds the supported integer range.");
			}
			return next;
		},
		0,
	);
	const signatures = new Map<
		string,
		{ signature: string; blockTime?: number | null; err: unknown }
	>();
	for (const account of tokenAccounts.value) {
		const history = await connection.getSignaturesForAddress(
			account.pubkey,
			{
				limit: 50,
				before: request.beforeSignature,
			},
			"confirmed",
		);
		for (const item of history) signatures.set(item.signature, item);
	}
	const ordered = [...signatures.values()]
		.filter((item) => !item.err)
		.sort((left, right) => (right.blockTime ?? 0) - (left.blockTime ?? 0))
		.slice(0, 100);
	const transfers: Array<{
		externalId: string;
		signature: string;
		postedAt: number;
		direction: "inbound" | "outbound";
		amountBaseUnits: number;
	}> = [];
	for (let offset = 0; offset < ordered.length; offset += 25) {
		const batch = ordered.slice(offset, offset + 25);
		const transactions = await connection.getParsedTransactions(
			batch.map((item) => item.signature),
			{ commitment: "confirmed", maxSupportedTransactionVersion: 0 },
		);
		for (let index = 0; index < transactions.length; index += 1) {
			const transaction = transactions[index];
			const signature = batch[index];
			if (!transaction?.meta || !signature) continue;
			const pre = ownerTokenBalance(
				transaction.meta.preTokenBalances,
				request.ownerAddress,
				request.mintAddress,
			);
			const post = ownerTokenBalance(
				transaction.meta.postTokenBalances,
				request.ownerAddress,
				request.mintAddress,
			);
			const delta = post - pre;
			if (!delta) continue;
			transfers.push({
				externalId: `${signature.signature}:usdc-net`,
				signature: signature.signature,
				postedAt: (transaction.blockTime ?? signature.blockTime ?? 0) * 1000,
				direction: delta > 0 ? "inbound" : "outbound",
				amountBaseUnits: Math.abs(delta),
			});
		}
	}
	return {
		cursor: ordered.at(-1)?.signature ?? request.beforeSignature,
		observedBalanceBaseUnits,
		fetchedAt: Date.now(),
		transfers,
		sourceHealth: { status: "healthy" as const },
	};
}

export function ownerTokenBalance(
	balances:
		| Array<{
				owner?: string;
				mint: string;
				uiTokenAmount: { amount: string };
		  }>
		| null
		| undefined,
	owner: string,
	mint: string,
) {
	return (balances ?? [])
		.filter((balance) => balance.owner === owner && balance.mint === mint)
		.reduce((total, balance) => {
			const amount = Number(balance.uiTokenAmount.amount);
			if (!Number.isSafeInteger(amount)) {
				throw new Error(
					"USDC transaction exceeds the supported integer range.",
				);
			}
			const next = total + amount;
			if (!Number.isSafeInteger(next)) {
				throw new Error(
					"USDC transaction exceeds the supported integer range.",
				);
			}
			return next;
		}, 0);
}

function rpcUrl(network: "devnet" | "mainnet-beta") {
	const networkSpecific =
		network === "mainnet-beta"
			? process.env.SOLANA_MAINNET_RPC_URL
			: process.env.SOLANA_DEVNET_RPC_URL;
	if (networkSpecific) return networkSpecific;
	if (process.env.SOLANA_NETWORK === network && process.env.SOLANA_RPC_URL) {
		return process.env.SOLANA_RPC_URL;
	}
	throw new Error(`A ${network} Solana RPC URL is not configured.`);
}

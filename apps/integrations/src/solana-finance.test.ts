import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";
import {
	ownerTokenBalance,
	syncSolanaFinance,
	type SolanaFinanceRpc,
} from "./solana-finance.js";

const ownerAddress = "11111111111111111111111111111111";
const mintAddress = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const tokenAccount = new PublicKey(
	"SysvarRent111111111111111111111111111111111",
);

describe("read-only Solana financial sync", () => {
	it("discovers token accounts, deduplicates signatures, filters failures, and nets owner deltas", async () => {
		const getParsedTokenAccountsByOwner = vi.fn().mockResolvedValue({
			value: [tokenAccountResult(1_500_000), tokenAccountResult(500_000)],
		});
		const getSignaturesForAddress = vi.fn().mockResolvedValue([
			{ signature: "newest", blockTime: 30, err: null },
			{ signature: "outbound", blockTime: 20, err: null },
			{
				signature: "failed",
				blockTime: 10,
				err: { InstructionError: [0, "failed"] },
			},
		]);
		const getParsedTransactions = vi
			.fn()
			.mockImplementation(async (signatures: string[]) =>
				signatures.map((signature) => {
					if (signature === "newest")
						return parsedTransaction(1_000_000, 1_250_000, 30);
					if (signature === "outbound")
						return parsedTransaction(1_250_000, 1_100_000, 20);
					return null;
				}),
			);
		const rpc = {
			getParsedTokenAccountsByOwner,
			getSignaturesForAddress,
			getParsedTransactions,
		} as unknown as SolanaFinanceRpc;

		const result = await syncSolanaFinance(
			{
				network: "devnet",
				ownerAddress,
				mintAddress,
				beforeSignature: "older-page-cursor",
			},
			rpc,
		);

		expect(result.observedBalanceBaseUnits).toBe(2_000_000);
		expect(result.cursor).toBe("outbound");
		expect(result.transfers).toEqual([
			{
				externalId: "newest:usdc-net",
				signature: "newest",
				postedAt: 30_000,
				direction: "inbound",
				amountBaseUnits: 250_000,
			},
			{
				externalId: "outbound:usdc-net",
				signature: "outbound",
				postedAt: 20_000,
				direction: "outbound",
				amountBaseUnits: 150_000,
			},
		]);
		expect(getSignaturesForAddress).toHaveBeenCalledTimes(2);
		expect(getSignaturesForAddress.mock.calls[0]?.[1]).toMatchObject({
			before: "older-page-cursor",
		});
		expect(getParsedTransactions).toHaveBeenCalledTimes(1);
		expect(result.sourceHealth.status).toBe("healthy");
	});

	it("rejects unsupported mints before making an RPC request", async () => {
		const rpc = {
			getParsedTokenAccountsByOwner: vi.fn(),
			getSignaturesForAddress: vi.fn(),
			getParsedTransactions: vi.fn(),
		} as unknown as SolanaFinanceRpc;
		await expect(
			syncSolanaFinance(
				{
					network: "devnet",
					ownerAddress,
					mintAddress: PublicKey.default.toBase58(),
				},
				rpc,
			),
		).rejects.toThrow(/Only native Circle USDC/);
		expect(rpc.getParsedTokenAccountsByOwner).not.toHaveBeenCalled();
	});

	it("rejects unsafe multi-account balance totals", () => {
		expect(() =>
			ownerTokenBalance(
				[
					{
						owner: ownerAddress,
						mint: mintAddress,
						uiTokenAmount: { amount: String(Number.MAX_SAFE_INTEGER) },
					},
					{
						owner: ownerAddress,
						mint: mintAddress,
						uiTokenAmount: { amount: "1" },
					},
				],
				ownerAddress,
				mintAddress,
			),
		).toThrow(/supported integer range/);
	});
});

function tokenAccountResult(amount: number) {
	return {
		pubkey: tokenAccount,
		account: {
			data: { parsed: { info: { tokenAmount: { amount: String(amount) } } } },
		},
	};
}

function parsedTransaction(pre: number, post: number, blockTime: number) {
	return {
		blockTime,
		meta: {
			preTokenBalances: [tokenBalance(pre)],
			postTokenBalances: [tokenBalance(post)],
		},
	};
}

function tokenBalance(amount: number) {
	return {
		owner: ownerAddress,
		mint: mintAddress,
		uiTokenAmount: { amount: String(amount) },
	};
}

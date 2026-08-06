import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery, query } from "./_generated/server";
import { sha256Hex } from "./lib/canonical";

export const getBundle = internalQuery({
	args: { commitSha256: v.string() },
	handler: async (ctx, args) => {
		const commit = await ctx.db
			.query("repositoryCommits")
			.withIndex("by_commit_sha256", (q) =>
				q.eq("commitSha256", args.commitSha256.toLowerCase()),
			)
			.unique();
		if (!commit) return null;
		const [repository, version, anchor] = await Promise.all([
			ctx.db.get(commit.repositoryId),
			ctx.db.get(commit.recordVersionId),
			ctx.db
				.query("integrityAnchors")
				.withIndex("by_repository_commit", (q) =>
					q.eq("repositoryCommitId", commit._id),
				)
				.unique(),
		]);
		const [organization, record] = await Promise.all([
			repository ? ctx.db.get(repository.organizationId) : null,
			version ? ctx.db.get(version.recordId) : null,
		]);
		return { commit, repository, organization, version, record, anchor };
	},
});

export const getPublicProof = query({
	args: { commitSha256: v.string() },
	handler: async (ctx, args) => {
		const commit = await ctx.db
			.query("repositoryCommits")
			.withIndex("by_commit_sha256", (q) =>
				q.eq("commitSha256", args.commitSha256.toLowerCase()),
			)
			.unique();
		if (!commit) return null;
		const [repository, anchor] = await Promise.all([
			ctx.db.get(commit.repositoryId),
			ctx.db
				.query("integrityAnchors")
				.withIndex("by_repository_commit", (q) =>
					q.eq("repositoryCommitId", commit._id),
				)
				.unique(),
		]);
		if (!repository) return null;
		const computedCommitSha256 = await sha256Hex(commit.commitManifest);
		const computedTreeSha256 = await sha256Hex(commit.treeManifest);
		const common = {
			commitSha256: commit.commitSha256,
			parentCommitSha256: commit.parentCommitSha256,
			treeSha256: commit.treeSha256,
			createdAt: commit.createdAt,
			chainId: `tc-${String(repository._id).slice(-12)}`,
			verification: {
				commitMatches: computedCommitSha256 === commit.commitSha256,
				treeMatches: computedTreeSha256 === commit.treeSha256,
				status: anchor?.status ?? "queued",
				network: anchor?.network ?? "devnet",
				signature: anchor?.signature,
				explorerUrl: anchor?.explorerUrl,
				observedMemo: anchor?.observedMemo,
			},
		};
		if (repository.visibility !== "public") {
			return { visibility: "opaque" as const, ...common };
		}
		const [organization, version] = await Promise.all([
			ctx.db.get(repository.organizationId),
			ctx.db.get(commit.recordVersionId),
		]);
		const record = version ? await ctx.db.get(version.recordId) : null;
		return {
			visibility: "public" as const,
			...common,
			organization: organization?.name,
			repository: repository.name,
			record: record?.title,
			version: version?.version,
			manifest: commit.commitManifest,
		};
	},
});

export const verifyLive = action({
	args: { commitSha256: v.string() },
	handler: async (
		ctx,
		args,
	): Promise<{
		verified: boolean;
		commitMatches: boolean;
		treeMatches: boolean;
		onChainMatches: boolean;
		status: string;
		network?: string;
		signature?: string;
		observedMemo?: string;
	}> => {
		const bundle = await ctx.runQuery(internal.verification.getBundle, args);
		if (!bundle) {
			return {
				verified: false,
				commitMatches: false,
				treeMatches: false,
				onChainMatches: false,
				status: "not-found",
			};
		}
		const commitMatches =
			(await sha256Hex(bundle.commit.commitManifest)) ===
			bundle.commit.commitSha256;
		const treeMatches =
			(await sha256Hex(bundle.commit.treeManifest)) ===
			bundle.commit.treeSha256;
		if (!bundle.anchor?.signature) {
			return {
				verified: false,
				commitMatches,
				treeMatches,
				onChainMatches: false,
				status: bundle.anchor?.status ?? "unanchored",
				network: bundle.anchor?.network,
			};
		}
		const rpcUrl =
			bundle.anchor.network === "mainnet-beta"
				? (process.env.SOLANA_MAINNET_RPC_URL ?? process.env.SOLANA_RPC_URL)
				: (process.env.SOLANA_DEVNET_RPC_URL ?? process.env.SOLANA_RPC_URL);
		if (!rpcUrl) throw new Error("Solana verification RPC is not configured");
		const response = await fetch(rpcUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "getTransaction",
				params: [
					bundle.anchor.signature,
					{
						commitment: "confirmed",
						encoding: "jsonParsed",
						maxSupportedTransactionVersion: 0,
					},
				],
			}),
		});
		if (!response.ok) throw new Error("Solana RPC verification failed");
		const payload = (await response.json()) as {
			result?: {
				transaction?: {
					message?: {
						instructions?: Array<{
							program?: string;
							parsed?: string;
						}>;
					};
				};
			};
		};
		const observedMemo =
			payload.result?.transaction?.message?.instructions?.find(
				(instruction) => instruction.program === "spl-memo",
			)?.parsed;
		const expectedMemo = `tiecamel:commit:v2:${bundle.commit.commitSha256}`;
		const onChainMatches = observedMemo === expectedMemo;
		return {
			verified: commitMatches && treeMatches && onChainMatches,
			commitMatches,
			treeMatches,
			onChainMatches,
			status: onChainMatches ? "verified" : "mismatch",
			network: bundle.anchor.network,
			signature: bundle.anchor.signature,
			observedMemo,
		};
	},
});

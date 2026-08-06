import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRepositoryAccess } from "./lib/platformAuth";

export const list = query({
	args: {
		repositoryId: v.id("repositories"),
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"read",
			args.demoSessionToken,
		);
		const commits = await ctx.db
			.query("repositoryCommits")
			.withIndex("by_repository", (q) =>
				q.eq("repositoryId", args.repositoryId),
			)
			.order("desc")
			.collect();
		return Promise.all(
			commits.map(async (commit) => {
				const [change, version, membership, anchor] = await Promise.all([
					ctx.db.get(commit.changeRequestId),
					ctx.db.get(commit.recordVersionId),
					ctx.db.get(commit.createdBy),
					ctx.db
						.query("integrityAnchors")
						.withIndex("by_repository_commit", (q) =>
							q.eq("repositoryCommitId", commit._id),
						)
						.unique(),
				]);
				const record = version ? await ctx.db.get(version.recordId) : null;
				const user = membership ? await ctx.db.get(membership.userId) : null;
				return {
					...commit,
					changeTitle: change?.title ?? "Accepted change",
					recordTitle: record?.title ?? "Record",
					version: version?.version,
					createdByName: user?.name ?? "Unknown member",
					anchor: anchor
						? {
								status: anchor.status,
								network: anchor.network,
								signature: anchor.signature,
								explorerUrl: anchor.explorerUrl,
							}
						: null,
				};
			}),
		);
	},
});

export const get = query({
	args: {
		repositoryId: v.id("repositories"),
		commitSha256: v.string(),
		demoSessionToken: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await requireRepositoryAccess(
			ctx,
			args.repositoryId,
			"read",
			args.demoSessionToken,
		);
		const commit = await ctx.db
			.query("repositoryCommits")
			.withIndex("by_commit_sha256", (q) =>
				q.eq("commitSha256", args.commitSha256),
			)
			.unique();
		if (!commit || commit.repositoryId !== args.repositoryId) return null;
		const [change, version, anchor] = await Promise.all([
			ctx.db.get(commit.changeRequestId),
			ctx.db.get(commit.recordVersionId),
			ctx.db
				.query("integrityAnchors")
				.withIndex("by_repository_commit", (q) =>
					q.eq("repositoryCommitId", commit._id),
				)
				.unique(),
		]);
		const record = version ? await ctx.db.get(version.recordId) : null;
		const tree = JSON.parse(commit.treeManifest) as {
			records: Array<{
				recordId: string;
				recordVersionId: string;
				contentSha256: string;
			}>;
		};
		return {
			...commit,
			change,
			version,
			record,
			tree: tree.records,
			anchor,
		};
	},
});

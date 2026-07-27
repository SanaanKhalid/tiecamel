import { v } from "convex/values";
import { query } from "./_generated/server";
import { publicAnchor } from "./integrity";

export const getRepositoryProjection = query({
	args: { organizationSlug: v.string(), repositorySlug: v.string() },
	handler: async (ctx, args) => {
		const snapshots = await ctx.db
			.query("publicRepositorySnapshots")
			.withIndex("by_public_slug", (q) =>
				q
					.eq("organizationSlug", args.organizationSlug)
					.eq("repositorySlug", args.repositorySlug),
			)
			.collect();
		if (!snapshots.length) return null;
		const ordered = snapshots.sort((a, b) => a.version - b.version);
		const latest = ordered.at(-1);
		if (!latest) return null;
		const records = new Map<
			string,
			{
				id: string;
				title: string;
				collection: string;
				version: number;
				summary: string;
				sha256: string;
				publishedAt: number;
				integrity?: ReturnType<typeof publicAnchor>;
			}
		>();
		const activity: Array<{
			id: string;
			changeNumber: number;
			title: string;
			publishedAt: number;
		}> = [];
		for (const snapshot of ordered) {
			const payload = snapshot.payload as {
				record?: {
					id: string;
					title: string;
					collection: string;
					version: number;
					summary: string;
					sha256: string;
					publishedAt: number;
				};
				change?: { number: number; title: string };
			};
			if (payload.record) {
				const anchor = snapshot.integrityAnchorId
					? await ctx.db.get(snapshot.integrityAnchorId)
					: null;
				records.set(payload.record.id, {
					...payload.record,
					integrity: anchor ? publicAnchor(anchor) : undefined,
				});
			}
			if (payload.change) {
				activity.unshift({
					id: String(snapshot._id),
					changeNumber: payload.change.number,
					title: payload.change.title,
					publishedAt: snapshot.publishedAt,
				});
			}
		}
		const latestPayload = latest.payload as {
			repository?: { name: string; description: string };
		};
		return {
			organizationSlug: args.organizationSlug,
			repositorySlug: args.repositorySlug,
			repository: latestPayload.repository ?? {
				name: args.repositorySlug,
				description: "Approved public accountability records.",
			},
			snapshotVersion: latest.version,
			snapshotSha256: latest.sha256,
			records: [...records.values()],
			activity: activity.slice(0, 20),
			publishedAt: latest.publishedAt,
		};
	},
});

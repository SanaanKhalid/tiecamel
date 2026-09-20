import { internalQuery } from "./_generated/server";
export const governance = internalQuery({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();
		const names = ["responsibilities", "notification-delivery"];
		const checks = await Promise.all(
			names.map(async (name) => {
				const row = await ctx.db
					.query("governanceMonitor")
					.withIndex("by_name", (q) => q.eq("name", name))
					.unique();
				return {
					name,
					state: !row
						? "unknown"
						: now - row.lastSweepAt > 15 * 60_000
							? "stale"
							: "current",
					lastCompletedAt: row?.lastSweepAt ?? null,
				};
			}),
		);
		return {
			ok: checks.every((entry) => entry.state === "current"),
			checks,
			scope:
				"Worker heartbeat only; this is not a guarantee of delivery or compliance.",
		};
	},
});

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requirePlatformSession } from "./lib/platformAuth";

export const markRead = mutation({
	args: { notificationId: v.id("platformNotifications") },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx);
		const notification = await ctx.db.get(args.notificationId);
		if (
			!notification ||
			notification.organizationId !== session.membership.organizationId ||
			notification.membershipId !== session.membership._id
		) {
			throw new Error("Notification not found");
		}
		if (!notification.readAt) {
			await ctx.db.patch(notification._id, { readAt: Date.now() });
		}
	},
});

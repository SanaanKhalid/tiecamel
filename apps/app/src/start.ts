import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createStart } from "@tanstack/react-start";

const clerkConfigured = Boolean(
	process.env.VITE_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);

export const startInstance = createStart(() => ({
	requestMiddleware: clerkConfigured ? [clerkMiddleware()] : [],
}));

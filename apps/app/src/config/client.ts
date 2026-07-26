export type ClientConfig = {
	id: string;
	name: string;
	shortName: string;
	supportEmail: string;
	landingUrl: string;
	accent: string;
	demoMode: boolean;
	authConfigured: boolean;
	convexConfigured: boolean;
};

const env = import.meta.env;

export const clientConfig: ClientConfig = {
	id: env.VITE_TIECAMEL_CLIENT_ID || "demo-nonprofit",
	name: env.VITE_TIECAMEL_CLIENT_NAME || "TieCamel Demo Foundation",
	shortName: env.VITE_TIECAMEL_CLIENT_SHORT_NAME || "Demo Foundation",
	supportEmail: env.VITE_TIECAMEL_SUPPORT_EMAIL || "support@tiecamel.com",
	landingUrl: env.VITE_TIECAMEL_LANDING_URL || "http://localhost:4321",
	accent: env.VITE_TIECAMEL_ACCENT || "#092d2a",
	demoMode: env.VITE_TIECAMEL_DEMO_MODE !== "false",
	authConfigured: Boolean(env.VITE_CLERK_PUBLISHABLE_KEY),
	convexConfigured: Boolean(env.VITE_CONVEX_URL),
};

export const runtimeConfig = {
	clerkPublishableKey: env.VITE_CLERK_PUBLISHABLE_KEY || "",
	convexUrl: env.VITE_CONVEX_URL || "",
};

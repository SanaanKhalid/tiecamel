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
// A public demonstration must never inherit a developer's backend or identity.
export const publicDemoMode = env.MODE === "public-demo";
export const operationalTestMode = env.MODE === "operational-test";
export const operationalTestConfigured =
	Boolean(env.VITE_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) &&
	env.VITE_CONVEX_URL === "https://careful-setter-342.convex.cloud";

export const clientConfig: ClientConfig = {
	id: env.VITE_TIECAMEL_CLIENT_ID || "demo-nonprofit",
	name: env.VITE_TIECAMEL_CLIENT_NAME || "TieCamel Demo Foundation",
	shortName: env.VITE_TIECAMEL_CLIENT_SHORT_NAME || "Demo Foundation",
	supportEmail: env.VITE_TIECAMEL_SUPPORT_EMAIL || "support@tiecamel.com",
	landingUrl: env.VITE_TIECAMEL_LANDING_URL || "http://localhost:4321",
	accent: env.VITE_TIECAMEL_ACCENT || "#092d2a",
	demoMode:
		!operationalTestMode &&
		(publicDemoMode || env.VITE_TIECAMEL_DEMO_MODE !== "false"),
	authConfigured: !publicDemoMode && Boolean(env.VITE_CLERK_PUBLISHABLE_KEY),
	convexConfigured: !publicDemoMode && Boolean(env.VITE_CONVEX_URL),
};

export const runtimeConfig = {
	clerkPublishableKey: publicDemoMode
		? ""
		: env.VITE_CLERK_PUBLISHABLE_KEY || "",
	convexUrl: publicDemoMode ? "" : env.VITE_CONVEX_URL || "",
};

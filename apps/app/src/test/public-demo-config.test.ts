import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("public demo configuration", () => {
	it("ignores inherited backend and sign-in settings even if demo was disabled", async () => {
		vi.resetModules();
		vi.stubEnv("MODE", "public-demo");
		vi.stubEnv("VITE_CONVEX_URL", "https://unexpected.example");
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "unexpected-key");
		vi.stubEnv("VITE_TIECAMEL_DEMO_MODE", "false");
		const { clientConfig, runtimeConfig, publicDemoMode } = await import(
			"../config/client"
		);
		expect(publicDemoMode).toBe(true);
		expect(clientConfig).toMatchObject({
			demoMode: true,
			authConfigured: false,
			convexConfigured: false,
		});
		expect(runtimeConfig).toEqual({ clerkPublishableKey: "", convexUrl: "" });
	});
	it("preserves explicitly configured non-demo environments", async () => {
		vi.resetModules();
		vi.stubEnv("MODE", "production");
		vi.stubEnv("VITE_CONVEX_URL", "https://configured.example");
		vi.stubEnv("VITE_CLERK_PUBLISHABLE_KEY", "configured-key");
		vi.stubEnv("VITE_TIECAMEL_DEMO_MODE", "false");
		const { clientConfig, runtimeConfig } = await import("../config/client");
		expect(clientConfig).toMatchObject({
			demoMode: false,
			authConfigured: true,
			convexConfigured: true,
		});
		expect(runtimeConfig.convexUrl).toBe("https://configured.example");
	});
});

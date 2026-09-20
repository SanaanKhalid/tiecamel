// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeProviders } from "../components/runtime-providers";
import { usePlatform } from "../platform/store";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("@tanstack/react-router", async (original) => ({
	...(await original<typeof import("@tanstack/react-router")>()),
	useRouterState: () => route.pathname,
}));
vi.mock("../config/client", () => ({
	publicDemoMode: true,
	// Deliberately inconsistent: the boundary must still avoid live providers.
	clientConfig: {
		demoMode: true,
		convexConfigured: true,
		authConfigured: true,
	},
	runtimeConfig: {
		convexUrl: "https://unexpected.example",
		clerkPublishableKey: "invalid",
	},
}));
afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.unstubAllGlobals();
});
function SampleWorkspace() {
	const platform = usePlatform();
	return <p>{platform.organization.name}</p>;
}
describe("public demo runtime boundary", () => {
	it("does not server-render browser-specific sample clocks or saved data", () => {
		route.pathname = "/";
		const html = renderToString(
			<RuntimeProviders>
				<SampleWorkspace />
			</RuntimeProviders>,
		);
		expect(html).toContain("Loading the sample workspace");
		expect(html).toContain("Interactive demo");
		expect(html).not.toContain("TieCamel Demo Foundation");
	});
	it.each([
		"/",
		"/icn/overview",
		"/public/icn/transparency",
	])("keeps %s labeled and browser-only", (pathname) => {
		route.pathname = pathname;
		const request = vi.fn();
		vi.stubGlobal("fetch", request);
		render(
			<RuntimeProviders>
				<SampleWorkspace />
			</RuntimeProviders>,
		);
		expect(screen.getByLabelText("Public demo notice").textContent).toContain(
			"No server uploads, real alerts, or on-chain approvals",
		);
		expect(screen.getByText("TieCamel Demo Foundation")).toBeTruthy();
		expect(request).not.toHaveBeenCalled();
	});
	it("does not mount live verification components in a public demo", () => {
		route.pathname = "/verify/sample-hash";
		function LiveProof(): never {
			throw new Error("Must not mount a live proof");
		}
		render(
			<RuntimeProviders>
				<LiveProof />
			</RuntimeProviders>,
		);
		expect(
			screen.getByRole("heading", { name: /Live verification is unavailable/ }),
		).toBeTruthy();
	});
});

// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeProviders } from "../components/runtime-providers";

vi.mock("../config/client", () => ({
	operationalTestMode: true,
	operationalTestConfigured: false,
	publicDemoMode: false,
	clientConfig: {
		demoMode: true,
		authConfigured: false,
		convexConfigured: false,
	},
	runtimeConfig: { clerkPublishableKey: "", convexUrl: "" },
}));
afterEach(cleanup);
describe("operational test runtime boundary", () => {
	it("fails closed without mounting application routes or a sample workspace", () => {
		function MustNotMount(): never {
			throw new Error("Application must stay unmounted");
		}
		render(
			<RuntimeProviders>
				<MustNotMount />
			</RuntimeProviders>,
		);
		expect(screen.getByRole("alert").textContent).toContain(
			"No sample workspace has been substituted",
		);
		expect(screen.getByRole("note").textContent).toContain(
			"critical closure remains disabled",
		);
	});
});

// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GovernancePage } from "../components/governance-page";
import { PlatformProvider, usePlatform } from "../platform/store";

afterEach(() => {
	cleanup();
	localStorage.clear();
});
function Persona() {
	const platform = usePlatform();
	return (
		<select
			aria-label="Demo reviewer"
			value={platform.viewerId}
			onChange={(event) => platform.switchViewer(event.target.value)}
		>
			{platform.members.map((person) => (
				<option key={person.id} value={person.id}>
					{person.name}
				</option>
			))}
		</select>
	);
}
function renderWorkspace() {
	render(
		<PlatformProvider>
			<Persona />
			<GovernancePage />
		</PlatformProvider>,
	);
}
describe("nonprofit responsibility workflow", () => {
	it("explains the demo boundary and never calls an unknown monitor healthy", () => {
		renderWorkspace();
		expect(screen.getByText(/Approvals are simulated/)).toBeTruthy();
		expect(screen.getByText("not yet observed")).toBeTruthy();
	});
	it("keeps acknowledgement, pending exemption, review and closure separate", async () => {
		renderWorkspace();
		fireEvent.click(
			screen.getByRole("button", { name: /Property tax notice needs/ }),
		);
		fireEvent.click(
			screen.getByRole("button", {
				name: "Acknowledge receipt — not resolution",
			}),
		);
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "You acknowledged this notice" }),
			).toBeTruthy(),
		);
		expect(
			screen.getByRole("button", { name: "I checked the source and deadline" }),
		).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", { name: "I checked the source and deadline" }),
		);
		await waitFor(() =>
			expect(
				screen.queryByRole("button", {
					name: "I checked the source and deadline",
				}),
			).toBeNull(),
		);
		fireEvent.change(screen.getByLabelText(/Exemption application/), {
			target: { value: "pending" },
		});
		await waitFor(() =>
			expect(screen.getByText("Record updated.")).toBeTruthy(),
		);
		fireEvent.click(screen.getByText("Submit closure evidence"));
		fireEvent.click(
			screen.getByRole("button", {
				name: "Use clearly labelled sample evidence",
			}),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Submit for independent review" }),
		);
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Simulate independent approval" }),
			).toBeTruthy(),
		);
		// The president submitted this evidence and cannot approve it even though a director.
		fireEvent.click(
			screen.getByRole("button", { name: "Simulate independent approval" }),
		);
		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain("cannot approve"),
		);
		expect(
			(
				screen.getByRole("button", {
					name: "Finalize reviewed resolution",
				}) as HTMLButtonElement
			).disabled,
		).toBe(true);
		fireEvent.change(screen.getByLabelText("Demo reviewer"), {
			target: { value: "member-maya" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Simulate independent approval" }),
		);
		await waitFor(() =>
			expect(screen.getByText(/1\/2 independent approvals/)).toBeTruthy(),
		);
		fireEvent.change(screen.getByLabelText("Demo reviewer"), {
			target: { value: "member-daniel" },
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Simulate independent approval" }),
		);
		await waitFor(() =>
			expect(
				(
					screen.getByRole("button", {
						name: "Finalize reviewed resolution",
					}) as HTMLButtonElement
				).disabled,
			).toBe(false),
		);
		fireEvent.click(
			screen.getByRole("button", { name: "Finalize reviewed resolution" }),
		);
		await waitFor(() =>
			expect(
				screen.getByText("Resolved after independent review (simulated)"),
			).toBeTruthy(),
		);
	});
	it("offers human-readable deadline and assignment inputs", () => {
		renderWorkspace();
		fireEvent.click(screen.getByRole("button", { name: "Register a notice" }));
		expect(screen.getByLabelText("Accountable owner")).toBeTruthy();
		expect(screen.getByLabelText("Backup officer")).toBeTruthy();
		const deadline = screen.getByLabelText(/Actual deadline \(/);
		expect(deadline.getAttribute("type")).toBe("datetime-local");
	});
	it("advances only the labelled local demo clock", () => {
		renderWorkspace();
		fireEvent.click(
			screen.getByRole("button", { name: /Property tax notice needs/ }),
		);
		fireEvent.click(screen.getByRole("button", { name: "Simulate 48 hours" }));
		const detail = screen.getByRole("region", {
			name: "Responsibility details",
		});
		expect(within(detail).getByText(/Escalation level 3/)).toBeTruthy();
	});
});

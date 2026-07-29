// @vitest-environment jsdom

import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangeDetailPage } from "../components/change-detail-page";
import { IssueDetailPage } from "../components/issue-detail-page";
import { OrganizationPage } from "../components/organization-page";
import { PublicRepositoryPage } from "../components/public-repository-page";
import { RepositoryPage } from "../components/repository-page";
import { WorkPlatformPage } from "../components/work-platform-page";
import { PlatformProvider, usePlatform } from "../platform/store";

afterEach(() => {
	cleanup();
	window.localStorage.clear();
});

async function renderPlatform(node: React.ReactNode) {
	const rootRoute = createRootRoute({
		component: () => (
			<PlatformProvider>
				<Outlet />
			</PlatformProvider>
		),
	});
	const testRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => node,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([testRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();

	return render(<RouterProvider router={router} />);
}

function DemoViewerProbe() {
	const platform = usePlatform();
	const viewer = platform.members.find(
		(member) => member.id === platform.viewerId,
	);
	return (
		<div>
			<p>
				{viewer?.name} — {viewer?.title}
			</p>
			<button
				type="button"
				onClick={() => platform.switchViewer("member-amina")}
			>
				Switch to Treasurer
			</button>
		</div>
	);
}

function RepositoryMutationProbe() {
	const platform = usePlatform();
	return (
		<div>
			<p>
				{platform.repositories.map((repository) => repository.name).join(",")}
			</p>
			<button
				type="button"
				onClick={() =>
					platform.createRepository({
						name: "Programs",
						slug: "programs",
						prefix: "PROG",
						description: "Program operations and accepted records.",
						visibility: "members",
						minimumApprovals: 2,
					})
				}
			>
				Create programs repository
			</button>
		</div>
	);
}

describe("TieCamel repository platform", () => {
	it("switches the active demo board member", async () => {
		await renderPlatform(<DemoViewerProbe />);

		expect(screen.getByText("Muhammad Rahman — President")).toBeTruthy();
		fireEvent.click(
			screen.getByRole("button", { name: "Switch to Treasurer" }),
		);
		expect(screen.getByText("Amina Razzak — Treasurer")).toBeTruthy();
	});

	it("renders ICN repositories and organization attention", async () => {
		await renderPlatform(<OrganizationPage />);

		expect(
			screen.getByRole("heading", { name: "Islamic Center of Naperville" }),
		).toBeTruthy();
		expect(screen.getByText("Governance")).toBeTruthy();
		expect(screen.getByText("Compliance")).toBeTruthy();
		expect(screen.getByText("Funding")).toBeTruthy();
		expect(screen.getByText("Transparency")).toBeTruthy();
		expect(
			screen.getByRole("heading", { name: "Needs attention" }),
		).toBeTruthy();
	});

	it("creates a governed repository in the demo workspace", async () => {
		await renderPlatform(<RepositoryMutationProbe />);
		fireEvent.click(
			screen.getByRole("button", { name: "Create programs repository" }),
		);
		await waitFor(() => expect(screen.getByText(/Programs/)).toBeTruthy());
	});

	it("lists issues across repositories and switches to a Kanban board", async () => {
		await renderPlatform(<WorkPlatformPage />);

		expect(
			screen.getByText("Review the updated 2026 property tax notice"),
		).toBeTruthy();
		expect(
			screen.getByText("Approve youth enrichment grant allocation"),
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Board view" }));
		expect(screen.getByRole("region", { name: "To do" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "In progress" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "In review" })).toBeTruthy();
		expect(screen.getByRole("region", { name: "Done" })).toBeTruthy();
	});

	it("creates an issue with repository, assignee, location, and due date", async () => {
		await renderPlatform(<WorkPlatformPage />);

		fireEvent.click(screen.getByRole("button", { name: "New issue" }));
		fireEvent.change(screen.getByLabelText("Repository"), {
			target: { value: "repo-compliance" },
		});
		fireEvent.change(screen.getByLabelText("Issue type"), {
			target: { value: "obligation" },
		});
		fireEvent.change(screen.getByLabelText("Title"), {
			target: { value: "Complete annual fire inspection" },
		});
		fireEvent.change(screen.getByLabelText("Description"), {
			target: {
				value:
					"Schedule the inspection and accept the signed inspection report.",
			},
		});
		fireEvent.change(screen.getByLabelText("Assignee"), {
			target: { value: "member-daniel" },
		});
		fireEvent.change(screen.getByLabelText("Location"), {
			target: { value: "location-main" },
		});
		fireEvent.change(screen.getByLabelText("Due date"), {
			target: { value: "2026-09-01" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Create issue" }));

		await waitFor(() =>
			expect(screen.getByText("Complete annual fire inspection")).toBeTruthy(),
		);
	});

	it("moves issues with the accessible status control", async () => {
		await renderPlatform(<WorkPlatformPage />);
		fireEvent.click(screen.getByRole("button", { name: "Board view" }));
		fireEvent.change(
			screen.getByLabelText("Move File state charitable registration"),
			{ target: { value: "in-progress" } },
		);

		await waitFor(() =>
			expect(
				within(screen.getByRole("region", { name: "In progress" })).getByText(
					"File state charitable registration",
				),
			).toBeTruthy(),
		);
	});

	it("adds issue discussion without losing issue metadata", async () => {
		await renderPlatform(
			<IssueDetailPage repositorySlug="compliance" issueNumber={42} />,
		);

		fireEvent.change(screen.getByLabelText("Comment"), {
			target: { value: "Counsel confirmed the revised response date." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Comment" }));

		await waitFor(() =>
			expect(
				screen.getByText("Counsel confirmed the revised response date."),
			).toBeTruthy(),
		);
		expect(screen.getByText("Main Campus")).toBeTruthy();
		expect(screen.getByText("Close to breach")).toBeTruthy();
	});

	it("shows only comparison data produced for the change request", async () => {
		await renderPlatform(
			<ChangeDetailPage repositorySlug="compliance" changeNumber={23} />,
		);

		fireEvent.click(screen.getByRole("button", { name: /Changes/ }));
		expect(screen.getByText("Balance due")).toBeTruthy();
		expect(screen.getAllByText("$18,420.00").length).toBeGreaterThan(0);
		expect(screen.getAllByText("$21,860.00").length).toBeGreaterThan(0);
		expect(screen.getByText("Text comparison")).toBeTruthy();
		expect(screen.getByText("Visual comparison")).toBeTruthy();
		expect(
			screen.getByText(
				"No rendered page comparison is available for this revision.",
			),
		).toBeTruthy();
		expect(screen.queryByText("Accepted · May notice")).toBeNull();
	});

	it("explains when a first record has no comparison baseline", async () => {
		await renderPlatform(
			<ChangeDetailPage repositorySlug="governance" changeNumber={9} />,
		);

		fireEvent.click(screen.getByRole("button", { name: /Changes/ }));
		expect(
			screen.getAllByText("This is the first version of this record.").length,
		).toBe(2);
		expect(screen.queryByText("$18,420.00")).toBeNull();
	});

	it("adds a durable change-request conversation comment", async () => {
		await renderPlatform(
			<ChangeDetailPage repositorySlug="compliance" changeNumber={23} />,
		);
		fireEvent.change(screen.getByLabelText("Change request comment"), {
			target: { value: "Please confirm the parcel number on page two." },
		});
		fireEvent.click(screen.getByRole("button", { name: "Comment" }));
		await waitFor(() =>
			expect(
				screen.getByText("Please confirm the parcel number on page two."),
			).toBeTruthy(),
		);
		expect(screen.getAllByText("Internal").length).toBeGreaterThan(0);
	});

	it("creates a change request without linking an issue", async () => {
		await renderPlatform(
			<RepositoryPage repositorySlug="compliance" tab="changes" />,
		);
		fireEvent.click(screen.getByRole("button", { name: "New change" }));
		fireEvent.change(screen.getByLabelText("Title"), {
			target: { value: "Accept unlinked test record" },
		});
		fireEvent.change(screen.getByLabelText("Summary"), {
			target: {
				value: "A change request may stand on its own without an issue.",
			},
		});
		expect(
			(screen.getByLabelText("Linked issue (optional)") as HTMLSelectElement)
				.value,
		).toBe("");
		fireEvent.click(
			screen.getByRole("button", { name: "Open change request" }),
		);
		await waitFor(() =>
			expect(screen.getByText("Accept unlinked test record")).toBeTruthy(),
		);
		expect(
			screen.queryByText("This repository requires a linked issue"),
		).toBeNull();
	});

	it("keeps approval separate from idempotent publication and finalizes a record", async () => {
		await renderPlatform(
			<ChangeDetailPage repositorySlug="compliance" changeNumber={23} />,
		);

		const accept = screen.getByRole("button", { name: "Approve & publish" });
		expect((accept as HTMLButtonElement).disabled).toBe(true);
		fireEvent.change(screen.getByLabelText("Review summary"), {
			target: {
				value: "The deadline warning and revised balance are understood.",
			},
		});
		fireEvent.click(screen.getByRole("button", { name: "Approve" }));

		await waitFor(() =>
			expect(
				(
					screen.getByRole("button", {
						name: "Approve & publish",
					}) as HTMLButtonElement
				).disabled,
			).toBe(false),
		);
		fireEvent.click(screen.getByRole("button", { name: "Approve & publish" }));

		await waitFor(() =>
			expect(screen.getByText("Change accepted")).toBeTruthy(),
		);
		expect(
			screen.getByText(
				"Published successfully. A new immutable TieCamel record version was created.",
			),
		).toBeTruthy();
		expect(screen.getByText("Publication succeeded")).toBeTruthy();
	});

	it("keeps private compliance records out of the public repository projection", async () => {
		await renderPlatform(
			<PublicRepositoryPage
				organizationSlug="icn"
				repositorySlug="transparency"
			/>,
		);

		expect(screen.getByText("Q1 2026 transparency report")).toBeTruthy();
		expect(screen.queryByText("Main Campus property tax notice")).toBeNull();
		expect(
			screen.getByText(/generated only from approved public snapshots/i),
		).toBeTruthy();
	});

	it("updates repository protection rules", async () => {
		await renderPlatform(
			<RepositoryPage repositorySlug="compliance" tab="settings" />,
		);
		const approvals = screen.getByLabelText("Minimum independent approvals");
		fireEvent.change(approvals, { target: { value: "3" } });
		fireEvent.click(screen.getByRole("button", { name: "Save rules" }));

		await waitFor(() =>
			expect(screen.getByText("Protection rules saved.")).toBeTruthy(),
		);
	});

	it("configures an optional fixed Google Shared Drive destination", async () => {
		await renderPlatform(
			<RepositoryPage repositorySlug="compliance" tab="settings" />,
		);
		fireEvent.click(screen.getByRole("radio", { name: /Google Drive/ }));
		fireEvent.change(screen.getByLabelText("Shared Drive ID"), {
			target: { value: "drive-icn" },
		});
		fireEvent.change(screen.getByLabelText("Fixed folder ID"), {
			target: { value: "folder-compliance" },
		});
		fireEvent.change(screen.getByLabelText("Display path"), {
			target: { value: "ICN Shared Drive / Compliance" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Save destination" }));
		await waitFor(() =>
			expect(
				screen.getByText("Fixed Google Drive destination saved."),
			).toBeTruthy(),
		);
		expect(
			screen.getByText(/Publishers cannot redirect individual change requests/),
		).toBeTruthy();
		fireEvent.change(screen.getByLabelText("Google file ID"), {
			target: { value: "google-file-1" },
		});
		fireEvent.change(screen.getByLabelText("File name"), {
			target: { value: "legacy-tax-notice.pdf" },
		});
		fireEvent.change(screen.getByLabelText("Administrator attestation"), {
			target: {
				value:
					"This is the accepted pre-TieCamel record provided by the administrator.",
			},
		});
		fireEvent.click(
			screen.getByRole("button", { name: "Queue baseline import" }),
		);
		await waitFor(() =>
			expect(screen.getByText(/Legacy baseline queued/)).toBeTruthy(),
		);
	});

	it("changes a repository to public without exposing drafts", async () => {
		await renderPlatform(
			<RepositoryPage repositorySlug="compliance" tab="settings" />,
		);
		fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
		fireEvent.click(screen.getByRole("button", { name: "Save repository" }));
		await waitFor(() =>
			expect(screen.getByText("Repository settings saved.")).toBeTruthy(),
		);
		expect(
			screen.getByText(/Drafts, internal comments, private reviews/i),
		).toBeTruthy();
		expect(
			screen.getByRole("link", { name: "Preview public repository" }),
		).toBeTruthy();
	});
});

import { createFileRoute } from "@tanstack/react-router";
import { WorkPlatformPage } from "../components/work-platform-page";

export const Route = createFileRoute("/_app/work")({
	validateSearch: (search: Record<string, unknown>) => ({
		new: search.new === "issue" ? "issue" : undefined,
	}),
	component: WorkPlatformPage,
});

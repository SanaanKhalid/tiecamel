import { createFileRoute } from "@tanstack/react-router";
import { WorkPlatformPage } from "../components/work-platform-page";

export const Route = createFileRoute("/_app/work")({
	component: WorkPlatformPage,
});

import { createFileRoute } from "@tanstack/react-router";
import { GovernancePage } from "../components/governance-page";
import { OrganizationPage } from "../components/organization-page";
import { publicDemoMode } from "../config/client";

export const Route = createFileRoute("/_app/")({
	component: publicDemoMode ? DemoOverview : OrganizationPage,
});

function DemoOverview() {
	return <GovernancePage tab="overview" />;
}

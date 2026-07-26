import { createFileRoute } from "@tanstack/react-router";
import { OrganizationSettingsPage } from "../components/organization-settings-page";

export const Route = createFileRoute("/_app/settings")({
	component: OrganizationSettingsPage,
});

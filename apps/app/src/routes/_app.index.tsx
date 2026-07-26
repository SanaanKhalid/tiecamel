import { createFileRoute } from "@tanstack/react-router";
import { OrganizationPage } from "../components/organization-page";

export const Route = createFileRoute("/_app/")({
	component: OrganizationPage,
});

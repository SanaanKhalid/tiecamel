import { createFileRoute } from "@tanstack/react-router";
import { GovernancePage } from "../components/governance-page";
export const Route = createFileRoute("/_app/$organization/responsibilities")({
	component: () => <GovernancePage tab="responsibilities" />,
});

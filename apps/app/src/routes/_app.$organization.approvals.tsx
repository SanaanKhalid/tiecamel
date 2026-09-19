import { createFileRoute } from "@tanstack/react-router";
import { GovernancePage } from "../components/governance-page";
export const Route = createFileRoute("/_app/$organization/approvals")({
	component: () => <GovernancePage tab="approvals" />,
});

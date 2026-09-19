import { createFileRoute } from "@tanstack/react-router";
import { PublicGovernancePage } from "../components/governance-page";
export const Route = createFileRoute("/public/$organization/community")({
	component: Page,
});
function Page() {
	const { organization } = Route.useParams();
	return <PublicGovernancePage organizationSlug={organization} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { RepositoryPage } from "../components/repository-page";

export const Route = createFileRoute("/_app/$organization/$repository/issues/")(
	{
		component: RepositoryIssuesRoute,
	},
);

function RepositoryIssuesRoute() {
	const { repository } = Route.useParams();
	return <RepositoryPage repositorySlug={repository} tab="issues" />;
}

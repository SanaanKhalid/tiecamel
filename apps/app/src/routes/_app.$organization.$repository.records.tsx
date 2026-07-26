import { createFileRoute } from "@tanstack/react-router";
import { RepositoryPage } from "../components/repository-page";

export const Route = createFileRoute("/_app/$organization/$repository/records")(
	{
		component: RepositoryRecordsRoute,
	},
);

function RepositoryRecordsRoute() {
	const { repository } = Route.useParams();
	return <RepositoryPage repositorySlug={repository} tab="records" />;
}

import { createFileRoute } from "@tanstack/react-router";
import { RepositoryPage } from "../components/repository-page";

export const Route = createFileRoute("/_app/$organization/$repository/")({
	component: RepositoryRoute,
});

function RepositoryRoute() {
	const { repository } = Route.useParams();
	return <RepositoryPage repositorySlug={repository} tab="overview" />;
}

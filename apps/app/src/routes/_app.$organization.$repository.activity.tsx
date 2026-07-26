import { createFileRoute } from "@tanstack/react-router";
import { RepositoryPage } from "../components/repository-page";

export const Route = createFileRoute(
	"/_app/$organization/$repository/activity",
)({
	component: RepositoryActivityRoute,
});

function RepositoryActivityRoute() {
	const { repository } = Route.useParams();
	return <RepositoryPage repositorySlug={repository} tab="activity" />;
}

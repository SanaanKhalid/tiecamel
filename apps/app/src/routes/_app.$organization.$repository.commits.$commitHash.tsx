import { createFileRoute } from "@tanstack/react-router";
import { CommitDetailPage } from "../components/commit-detail-page";

export const Route = createFileRoute(
	"/_app/$organization/$repository/commits/$commitHash",
)({
	component: CommitRoute,
});

function CommitRoute() {
	const { repository, commitHash } = Route.useParams();
	return (
		<CommitDetailPage repositorySlug={repository} commitHash={commitHash} />
	);
}

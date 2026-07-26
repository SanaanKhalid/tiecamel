import { createFileRoute } from "@tanstack/react-router";
import { IssueDetailPage } from "../components/issue-detail-page";

export const Route = createFileRoute(
	"/_app/$organization/$repository/issues/$issueNumber",
)({
	component: IssueRoute,
});

function IssueRoute() {
	const { repository, issueNumber } = Route.useParams();
	return (
		<IssueDetailPage
			repositorySlug={repository}
			issueNumber={Number(issueNumber)}
		/>
	);
}

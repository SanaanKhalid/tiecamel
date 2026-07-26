import { createFileRoute } from "@tanstack/react-router";
import { ChangeDetailPage } from "../components/change-detail-page";

export const Route = createFileRoute(
	"/_app/$organization/$repository/changes/$changeNumber",
)({
	component: ChangeRoute,
});

function ChangeRoute() {
	const { repository, changeNumber } = Route.useParams();
	return (
		<ChangeDetailPage
			repositorySlug={repository}
			changeNumber={Number(changeNumber)}
		/>
	);
}

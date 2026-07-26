import { createFileRoute } from "@tanstack/react-router";
import { PublicRepositoryPage } from "../components/public-repository-page";

export const Route = createFileRoute("/public/$organization/$repository")({
	component: PublicRepositoryRoute,
	head: ({ params }) => ({
		meta: [
			{ title: `${params.organization}/${params.repository} · TieCamel` },
			{
				name: "description",
				content: "Approved public records, issues, and accountability history.",
			},
		],
		links: [
			{
				rel: "canonical",
				href: `https://app.tiecamel.com/public/${params.organization}/${params.repository}`,
			},
		],
	}),
});

function PublicRepositoryRoute() {
	const { organization, repository } = Route.useParams();
	return (
		<PublicRepositoryPage
			organizationSlug={organization}
			repositorySlug={repository}
		/>
	);
}

import { createFileRoute } from "@tanstack/react-router";
import { PublicFinancialPage } from "../components/public-financial-page";

export const Route = createFileRoute("/public/$organization/financials")({
	component: PublicFinancialRoute,
	head: ({ params }) => ({
		meta: [
			{ title: `${params.organization} financial transparency · TieCamel` },
			{
				name: "description",
				content:
					"Approved public financial scope, balances, inflows, expenditures, and verification history.",
			},
		],
	}),
});

function PublicFinancialRoute() {
	const { organization } = Route.useParams();
	return <PublicFinancialPage organizationSlug={organization} />;
}

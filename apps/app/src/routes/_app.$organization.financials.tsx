import { createFileRoute } from "@tanstack/react-router";
import { FinancialPage } from "../components/financial-page";

export const Route = createFileRoute("/_app/$organization/financials")({
	component: FinancialPage,
});

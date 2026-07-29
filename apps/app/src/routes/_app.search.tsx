import { createFileRoute } from "@tanstack/react-router";
import { SearchPlatformPage } from "../components/search-platform-page";

export const Route = createFileRoute("/_app/search")({
	validateSearch: (search: Record<string, unknown>) => ({
		q: typeof search.q === "string" ? search.q : "",
	}),
	component: SearchPlatformPage,
});

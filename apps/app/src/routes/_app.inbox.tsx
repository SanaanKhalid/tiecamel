import { createFileRoute } from "@tanstack/react-router";
import { InboxPageV2 } from "../components/inbox-page-v2";

export const Route = createFileRoute("/_app/inbox")({
	component: InboxPageV2,
});

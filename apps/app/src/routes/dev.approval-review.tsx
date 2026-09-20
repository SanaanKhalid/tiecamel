import { createFileRoute, notFound } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const Preview = import.meta.env.DEV
	? lazy(() => import("../components/approval-review-preview"))
	: null;
export const Route = createFileRoute("/dev/approval-review")({
	component: Page,
});
function Page() {
	if (!Preview) throw notFound();
	return (
		<Suspense fallback={<p>Loading development preview…</p>}>
			<Preview />
		</Suspense>
	);
}

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval(
	"responsibility escalation sweep",
	{ minutes: 5 },
	internal.governance.sweep,
	{},
);
export default crons;

import { useConvex, useMutation, useQuery } from "convex/react";
import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	ClipboardCheck,
	Clock3,
	FileUp,
	Globe2,
	LockKeyhole,
	Plus,
	ShieldCheck,
	Users,
} from "lucide-react";
import {
	cloneElement,
	type FormEvent,
	type ReactElement,
	useEffect,
	useId,
	useMemo,
	useState,
} from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { clientConfig } from "../config/client";
import {
	applyCommand,
	type Command,
	closureReadiness,
	communitySummary,
	createResponsibility,
	DAY,
	escalationFor,
	type NewResponsibility,
	type Person,
	type Responsibility,
	riskFor,
} from "../governance/model";
import {
	type CaseEntry,
	type PreviewState,
	previewRoster,
	previewSeed,
} from "../governance/preview";
import { usePlatform } from "../platform/store";

export type GovernanceTab =
	| "overview"
	| "responsibilities"
	| "approvals"
	| "community";
type Summary = ReturnType<typeof communitySummary>;
type Actions = {
	processedDocuments?: { name: string; reference: string; digest: string }[];
	openDocument?: (reference: string) => Promise<void>;
	register: (input: NewResponsibility) => Promise<void>;
	act: (entry: CaseEntry, command: Command) => Promise<void>;
	exportHistory: (entry: CaseEntry) => Promise<void>;
	upload?: (entry: CaseEntry, file: File) => Promise<void>;
	advance?: () => void;
	seed?: () => Promise<void>;
};
const card =
	"rounded-2xl border border-[#dce5e0] bg-white shadow-[0_2px_8px_#173b2a04]";
const field =
	"w-full rounded-lg border border-[#ccd8d2] bg-white px-3 py-2.5 text-sm text-[#183b30] outline-none focus:border-[#167455] focus:ring-2 focus:ring-[#167455]/15";
const button =
	"inline-flex items-center justify-center gap-2 rounded-lg bg-[#155d46] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0b4834] disabled:cursor-not-allowed disabled:opacity-50";
const secondary =
	"inline-flex items-center justify-center gap-2 rounded-lg border border-[#ccd8d2] bg-white px-3 py-2 text-sm font-medium text-[#244d3d] hover:bg-[#f1f6f3] disabled:opacity-50";
function download(value: unknown, filename: string) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}
export function GovernancePage({ tab = "overview" }: { tab?: GovernanceTab }) {
	const platform = usePlatform();
	const isMember =
		platform.members.find((person) => person.id === platform.viewerId)?.role ===
		"verified-member";
	if (isMember)
		return (
			<PublicGovernancePage organizationSlug={platform.organization.slug} />
		);
	return clientConfig.convexConfigured && import.meta.env.MODE !== "test" ? (
		<LiveGovernancePage tab={tab} />
	) : (
		<PreviewGovernancePage tab={tab} />
	);
}
function LiveGovernancePage({ tab }: { tab: GovernanceTab }) {
	const platform = usePlatform();
	const scope = {
		organizationId: platform.organization.id as Id<"organizations">,
		demoSessionToken: platform.demoSessionToken,
	};
	const workspace = useQuery(api.governance.workspace, scope);
	const register = useMutation(api.governance.register);
	const act = useMutation(api.governance.act);
	const seed = useMutation(api.governance.seedDemo);
	const convex = useConvex();
	if (!workspace)
		return (
			<div className="p-8" aria-busy="true">
				Loading responsibilities…
			</div>
		);
	const repository =
		platform.repositories.find((entry) => entry.kind === "compliance") ??
		platform.repositories[0];
	const actions: Actions = {
		processedDocuments: platform.changeRequests.flatMap((change) =>
			change.revisions
				.flatMap((revision) => revision.files)
				.filter(
					(file) => file.processingStatus === "ready" && file.azureBlobRef,
				)
				.map((file) => ({
					name: file.name,
					reference: file.azureBlobRef ?? "",
					digest: file.sha256,
				})),
		),
		openDocument: async (reference) => {
			const url = await platform.requestDocumentUrl(reference);
			window.open(url, "_blank", "noopener,noreferrer");
		},
		register: async (input) => {
			// Persist the responsibility even when the document repository is not provisioned.
			await register({ ...scope, input });
		},
		seed: workspace.demo
			? async () => {
					await seed(scope);
				}
			: undefined,
		act: async (entry, command) => {
			await act({
				...scope,
				obligationId: entry.id as Id<"obligations">,
				expectedRevision: entry.state.revision,
				command,
			});
		},
		exportHistory: async (entry) => {
			const events = await convex.query(api.governance.history, {
				...scope,
				obligationId: entry.id as Id<"obligations">,
			});
			download(
				{
					format: "tiecamel-governance-history/v1",
					warning:
						"Private board export. Database hash chain; not a secure-signing or on-chain receipt.",
					state: entry.state,
					events,
				},
				`responsibility-${entry.id}.json`,
			);
		},
		upload: repository
			? async (entry, file) => {
					await platform.createChangeRequest({
						repositoryId: repository.id,
						title: `Responsibility evidence: ${entry.state.title}`,
						summary: `Evidence for responsibility ${entry.id}. This upload does not close the responsibility.`,
						linkedIssueId: entry.linkedIssueId,
						locationIds: [],
						labelIds: [],
						file,
						publicAfterMerge: false,
					});
				}
			: undefined,
	};
	return (
		<GovernanceWorkspace
			tab={tab}
			cases={workspace.cases}
			roster={workspace.roster}
			viewerId={workspace.viewerId}
			summary={workspace.summary}
			now={workspace.serverTime}
			demo={workspace.demo}
			actions={actions}
			alertCount={workspace.alerts.length}
			publications={workspace.publications}
		/>
	);
}
function PreviewGovernancePage({ tab }: { tab: GovernanceTab }) {
	const platform = usePlatform();
	const roster = useMemo(
		() => previewRoster(platform.members),
		[platform.members],
	);
	const [data, setData] = useState<PreviewState>(() =>
		previewSeed(roster, Date.now()),
	);
	const [loaded, setLoaded] = useState(false);
	const key = `tiecamel:governance-preview:v1:${platform.organization.id}`;
	useEffect(() => {
		try {
			const stored = localStorage.getItem(key);
			if (stored) {
				const parsed = JSON.parse(stored) as PreviewState;
				if (
					Array.isArray(parsed.cases) &&
					Array.isArray(parsed.events) &&
					Number.isFinite(parsed.now)
				)
					setData(parsed);
			}
		} catch {
			/* An invalid local demo must not block the workspace. */
		}
		setLoaded(true);
	}, [key]);
	useEffect(() => {
		if (loaded) localStorage.setItem(key, JSON.stringify(data));
	}, [data, key, loaded]);
	const actions: Actions = {
		register: async (input) => {
			const state = createResponsibility(input, roster, data.now);
			setData((current) => ({
				...current,
				cases: [...current.cases, { id: crypto.randomUUID(), state }],
			}));
		},
		act: async (entry, command) => {
			const actor = roster.find((person) => person.id === platform.viewerId);
			if (!actor) throw new Error("Choose a demo officer to continue");
			const current = data.cases.find((item) => item.id === entry.id);
			if (!current || current.state.revision !== entry.state.revision)
				throw new Error("This record changed; review the latest version");
			const next = applyCommand(
				current.state,
				command,
				actor,
				roster,
				data.now,
			);
			setData((previous) => ({
				...previous,
				publications:
					command.type === "approve-disclosure" && next.disclosure
						? [
								...(previous.publications ?? []),
								{
									text: next.disclosure.text,
									approvedAt: data.now,
									revision: next.revision,
								},
							]
						: previous.publications,
				cases: previous.cases.map((item) =>
					item.id === entry.id ? { ...item, state: next } : item,
				),
				events: [
					...previous.events,
					{
						caseId: entry.id,
						kind: command.type,
						by: actor.name,
						at: data.now,
						revision: next.revision,
					},
				],
			}));
		},
		exportHistory: async (entry) =>
			download(
				{
					demo: true,
					state: entry.state,
					events: data.events.filter((event) => event.caseId === entry.id),
				},
				"simulated-responsibility-history.json",
			),
		advance: () =>
			setData((current) => ({ ...current, now: current.now + 2 * DAY })),
	};
	return (
		<GovernanceWorkspace
			tab={tab}
			cases={data.cases}
			roster={roster}
			viewerId={platform.viewerId}
			summary={communitySummary(
				data.cases.map((entry) => entry.state),
				data.now,
			)}
			now={data.now}
			demo
			actions={actions}
			alertCount={0}
			publications={data.publications ?? []}
		/>
	);
}
export function GovernanceWorkspace({
	tab,
	cases,
	roster,
	viewerId,
	summary,
	now,
	demo,
	actions,
	alertCount,
	publications = [],
}: {
	tab: GovernanceTab;
	cases: CaseEntry[];
	roster: Person[];
	viewerId: string;
	summary: Summary;
	now: number;
	demo: boolean;
	actions: Actions;
	alertCount: number;
	publications?: { text: string; approvedAt: number; revision: number }[];
}) {
	const [selectedId, setSelectedId] = useState<string>();
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [busy, setBusy] = useState(false);
	const selected = cases.find((entry) => entry.id === selectedId);
	const visible = cases
		.filter((entry) => tab !== "approvals" || entry.state.phase === "review")
		.sort(
			(a, b) =>
				Number(a.state.phase === "resolved") -
					Number(b.state.phase === "resolved") || a.state.dueAt - b.state.dueAt,
		);
	async function run(action: () => Promise<void>, success = "Record updated.") {
		setBusy(true);
		setError("");
		setNotice("");
		try {
			await action();
			setNotice(success);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Unable to save. Please try again.",
			);
		} finally {
			setBusy(false);
		}
	}
	return (
		<div className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 sm:px-7 lg:px-9">
			<div className="flex flex-wrap items-end justify-between gap-4">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[.16em] text-[#668074]">
						BOARD ASSURANCE / {tab}
					</p>
					<h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#153e2d]">
						{tab === "overview"
							? "Nothing important should go quiet."
							: tab === "approvals"
								? "Independent review"
								: tab === "community"
									? "Accountability, shared carefully."
									: "Every responsibility has a next step."}
					</h1>
					<p className="mt-2 max-w-2xl text-sm leading-6 text-[#65766e]">
						Notice the risk. Assign responsibility. Verify the response. Keep
						your board and community informed.
					</p>
				</div>
				<button
					className={button}
					type="button"
					onClick={() => {
						setAdding(!adding);
						setSelectedId(undefined);
					}}
				>
					<Plus className="size-4" /> Register a notice
				</button>
			</div>
			{demo && (
				<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2d4a1] bg-[#fffbeb] px-4 py-3 text-sm text-[#745b22]">
					<span>
						<strong>Demonstration workspace.</strong> Approvals are simulated.
						No real alerts or secure signatures are sent. Use sample data only.
					</span>
					{actions.advance && (
						<button
							type="button"
							className={secondary}
							onClick={actions.advance}
						>
							Simulate 48 hours
						</button>
					)}
					{actions.seed && cases.length === 0 && (
						<button
							className={secondary}
							disabled={busy}
							type="button"
							onClick={() =>
								void run(async () => {
									await actions.seed?.();
								}, "Sample responsibilities loaded.")
							}
						>
							Load sample responsibilities
						</button>
					)}
				</div>
			)}
			{!demo && (
				<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
					Secure individual approvals are awaiting provisioning. Critical
					responsibilities remain open until that safeguard is ready.
				</div>
			)}
			{error && (
				<div
					role="alert"
					className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
				>
					{error}
				</div>
			)}
			{notice && (
				<output className="block rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
					{notice}
				</output>
			)}
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<Metric
					title="Open responsibilities"
					value={summary.unresolved}
					icon={ClipboardCheck}
				/>
				<Metric
					title="Past the actual deadline"
					value={summary.overdue}
					icon={AlertTriangle}
					warning={summary.overdue > 0}
				/>
				<Metric
					title="Need human confirmation"
					value={summary.awaitingConfirmation}
					icon={Users}
				/>
				<Metric
					title="Evidence awaiting review"
					value={cases.filter((entry) => entry.state.phase === "review").length}
					icon={ShieldCheck}
				/>
			</div>
			<div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#65766e]">
				<span className="inline-flex items-center gap-2">
					<Clock3 className="size-4" /> Escalation monitor:{" "}
					<strong
						className={
							summary.monitoring === "current"
								? "text-emerald-700"
								: "text-amber-800"
						}
					>
						{summary.monitoring === "unknown"
							? "not yet observed"
							: summary.monitoring}
					</strong>
					{summary.lastSweepAt &&
						` · Last completed scan ${new Date(summary.lastSweepAt).toLocaleString()}`}
				</span>
				<span>
					{demo ? "Demonstration clock" : "Server time"}:{" "}
					{new Date(now).toLocaleString()} · {alertCount} board alert records
				</span>
			</div>
			{adding && (
				<NoticeForm
					roster={roster}
					now={now}
					busy={busy}
					onCancel={() => setAdding(false)}
					onSubmit={(input) =>
						run(async () => {
							await actions.register(input);
							setAdding(false);
						}, "Notice registered. Confirm the source and deadline to begin the response workflow.")
					}
				/>
			)}
			{tab === "community" ? (
				<CommunityPanel summary={summary} publications={publications} />
			) : (
				<div
					className={`grid items-start gap-5 ${selected ? "xl:grid-cols-[minmax(280px,.8fr)_minmax(0,1.4fr)]" : ""}`}
				>
					<section
						className={`${card} overflow-hidden`}
						aria-label="Responsibilities"
					>
						<div className="flex items-center justify-between border-b border-[#e2eae5] p-5">
							<h2 className="font-semibold text-[#193e2d]">
								{tab === "approvals"
									? "Evidence ready for review"
									: "Responsibility register"}
							</h2>
							<span className="text-xs text-[#718176]">
								{visible.length} records
							</span>
						</div>
						{visible.length === 0 ? (
							<div className="p-10 text-center text-sm text-[#6a7b71]">
								{tab === "approvals"
									? "No evidence is awaiting review. Submitting a response alone does not create a closure approval."
									: "Register your first notice to establish an owner, backup, deadline and evidence requirement."}
							</div>
						) : (
							visible.map((entry) => (
								<button
									key={entry.id}
									type="button"
									onClick={() => {
										setSelectedId(entry.id);
										setAdding(false);
										setError("");
										setNotice("");
									}}
									className={`flex w-full gap-3 border-b border-[#edf1ee] p-5 text-left last:border-b-0 hover:bg-[#f5f9f6] ${selectedId === entry.id ? "bg-[#f0f7f2]" : ""}`}
								>
									<div
										className={`mt-1 grid size-9 shrink-0 place-items-center rounded-xl ${entry.state.critical && entry.state.phase !== "resolved" ? "bg-[#fff0e5] text-[#b65928]" : "bg-[#e9f3ec] text-[#377755]"}`}
									>
										{entry.state.phase === "resolved" ? (
											<CheckCircle2 className="size-4" />
										) : (
											<ClipboardCheck className="size-4" />
										)}
									</div>
									<div className="min-w-0 flex-1">
										<div className="mb-2 flex flex-wrap items-center gap-2">
											<RiskBadge state={entry.state} now={now} />
											{entry.state.critical && (
												<span className="text-[10px] font-semibold uppercase tracking-wider text-[#926344]">
													Critical · full board visibility
												</span>
											)}
										</div>
										<h3 className="break-words text-sm font-semibold leading-6 text-[#1a3c2c]">
											{entry.state.title}
										</h3>
										<p className="mt-1 text-xs leading-5 text-[#738279]">
											{roster.find(
												(person) => person.id === entry.state.ownerId,
											)?.name ?? "Owner unavailable"}{" "}
											· Due{" "}
											{formatDate(entry.state.dueAt, entry.state.timezone)}
										</p>
										<p className="mt-2 text-xs text-[#49745b]">
											{nextStep(entry.state)}{" "}
											<ArrowRight className="ml-1 inline size-3" />
										</p>
									</div>
								</button>
							))
						)}
					</section>
					{selected && (
						<ResponsibilityDetail
							key={selected.id}
							entry={selected}
							roster={roster}
							viewerId={viewerId}
							now={now}
							demo={demo}
							busy={busy}
							processedDocuments={actions.processedDocuments ?? []}
							openDocument={
								actions.openDocument
									? (reference) =>
											run(async () => {
												await actions.openDocument?.(reference);
											}, "Document opened in a separate tab.")
									: undefined
							}
							act={(command) => run(() => actions.act(selected, command))}
							exportHistory={() =>
								run(
									() => actions.exportHistory(selected),
									"Private history exported. Store it securely.",
								)
							}
							upload={
								actions.upload
									? (file) =>
											run(async () => {
												await actions.upload?.(selected, file);
											}, "Uploaded to Documents for processing. The responsibility is still open; review and submit the processed evidence separately.")
									: undefined
							}
						/>
					)}
				</div>
			)}
			<div className="flex gap-3 rounded-xl bg-[#eaf1ed] p-4 text-xs leading-5 text-[#63766a]">
				<LockKeyhole className="mt-0.5 size-4 shrink-0" />
				<p>
					These controls cover responsibilities your organization has
					registered. They do not certify legal compliance or discover every
					obligation. Acknowledgements, pending exemptions and delivery receipts
					never count as resolution.
				</p>
			</div>
		</div>
	);
}
function Metric({
	title,
	value,
	icon: Icon,
	warning,
}: {
	title: string;
	value: number;
	icon: typeof ClipboardCheck;
	warning?: boolean;
}) {
	return (
		<div className={`${card} p-4 sm:p-5`}>
			<div className="flex items-start justify-between gap-2">
				<span className="text-xs leading-5 text-[#6c7d72]">{title}</span>
				<Icon
					className={`size-4 shrink-0 ${warning ? "text-[#bd632b]" : "text-[#73957e]"}`}
				/>
			</div>
			<div
				className={`mt-3 text-3xl font-semibold ${warning ? "text-[#b45528]" : "text-[#1b4933]"}`}
			>
				{value}
			</div>
		</div>
	);
}
function formatDate(timestamp: number, timezone: string) {
	return new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		timeZoneName: "short",
	}).format(timestamp);
}
function RiskBadge({ state, now }: { state: Responsibility; now: number }) {
	const risk = riskFor(state, now);
	return (
		<span
			className={`rounded-md px-2 py-1 text-[11px] font-semibold ${risk === "overdue" ? "bg-red-100 text-red-800" : risk === "resolved" ? "bg-emerald-100 text-emerald-800" : "bg-[#f0e9d9] text-[#806233]"}`}
		>
			{risk.replaceAll("-", " ")}
		</span>
	);
}
function nextStep(state: Responsibility) {
	return state.phase === "intake"
		? "Confirm source and deadline"
		: state.phase === "resolved"
			? "Evidence independently reviewed"
			: state.phase === "review"
				? "Review current evidence"
				: !state.response
					? "Record a documented response"
					: "Submit closure evidence";
}

function NoticeForm({
	roster,
	now,
	onSubmit,
	onCancel,
	busy,
}: {
	roster: Person[];
	now: number;
	onSubmit: (input: NewResponsibility) => Promise<void>;
	onCancel: () => void;
	busy: boolean;
}) {
	const people = roster.filter(
		(person) => person.active && person.role !== "member",
	);
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	const defaultDate = (offset: number) => {
		const date = new Date(now + offset);
		return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
			.toISOString()
			.slice(0, 16);
	};
	function submit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		void onSubmit({
			title: String(form.get("title")),
			category: String(form.get("category")) as NewResponsibility["category"],
			critical: form.get("critical") === "on",
			source: String(form.get("source")),
			sourceExcerpt: String(form.get("excerpt")),
			ownerId: String(form.get("owner")),
			backupId: String(form.get("backup")),
			reviewerId: String(form.get("reviewer")),
			dueAt: new Date(String(form.get("deadline"))).getTime(),
			nextCheckAt: new Date(String(form.get("nextCheck"))).getTime(),
			timezone,
			expectedEvidence: String(form.get("evidence")),
		});
	}
	return (
		<form className={`${card} space-y-5 p-5 sm:p-7`} onSubmit={submit}>
			<div>
				<h2 className="text-lg font-semibold">Register a notice</h2>
				<p className="mt-1 text-sm text-[#6e7b72]">
					Everything starts unconfirmed. An officer must verify the source and
					the actual deadline.
				</p>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				<Label text="What needs attention?">
					<input
						name="title"
						required
						maxLength={180}
						className={field}
						placeholder="Property tax payment remains due"
					/>
				</Label>
				<Label text="Responsibility type">
					<select name="category" className={field}>
						<option value="tax">Property tax / exemption</option>
						<option value="filing">Required filing</option>
						<option value="insurance">Insurance</option>
						<option value="grant">Grant commitment</option>
						<option value="other">Other responsibility</option>
					</select>
				</Label>
				<Label text="Source / issuing authority">
					<input
						name="source"
						required
						maxLength={1000}
						className={field}
						placeholder="County treasurer, notice dated September 19"
					/>
				</Label>
				<Label text={`Actual deadline (${timezone})`}>
					<input
						type="datetime-local"
						name="deadline"
						required
						defaultValue={defaultDate(7 * DAY)}
						className={field}
					/>
				</Label>
				<Label text="Exact supporting text from the notice">
					<textarea
						name="excerpt"
						required
						maxLength={4000}
						className={field}
						placeholder="Copy the sentence that establishes the obligation and due date."
						rows={3}
					/>
				</Label>
				<Label text="What evidence will demonstrate completion?">
					<textarea
						name="evidence"
						required
						maxLength={1000}
						className={field}
						placeholder="Paid-in-full receipt that identifies this parcel and tax period."
						rows={3}
					/>
				</Label>
				{[
					["owner", "Accountable owner", 0],
					["backup", "Backup officer", 1],
					["reviewer", "Oversight reviewer", 2],
				].map(([name, label, index]) => (
					<Label key={name} text={String(label)}>
						<select
							name={String(name)}
							className={field}
							defaultValue={people[Number(index)]?.id}
							required
						>
							{people.map((person) => (
								<option key={person.id} value={person.id}>
									{person.name} · {person.role}
								</option>
							))}
						</select>
					</Label>
				))}
				<Label text={`Next follow-up (${timezone})`}>
					<input
						name="nextCheck"
						type="datetime-local"
						required
						defaultValue={defaultDate(DAY)}
						className={field}
					/>
				</Label>
			</div>
			<label className="flex items-start gap-3 rounded-xl bg-[#fff7e7] p-4 text-sm">
				<input
					type="checkbox"
					name="critical"
					defaultChecked
					className="mt-1"
				/>
				<span>
					<strong>Critical responsibility</strong>
					<br />
					Full-board visibility and two independent closure approvals, including
					a director.
				</span>
			</label>
			<p className="text-xs text-[#7b8079]">
				Use the actual source deadline converted to the displayed time zone. If
				the deadline is uncertain, register it conservatively and leave the
				notice unconfirmed; do not treat a pending application as an extension.
			</p>
			<div className="flex gap-3">
				<button type="submit" className={button} disabled={busy}>
					Register for confirmation
				</button>
				<button type="button" className={secondary} onClick={onCancel}>
					Cancel
				</button>
			</div>
		</form>
	);
}
function Label({
	text,
	children,
}: {
	text: string;
	children: ReactElement<{ id?: string }>;
}) {
	const id = useId();
	return (
		<label
			htmlFor={id}
			className="block space-y-2 text-xs font-semibold text-[#526b5c]"
		>
			<span>{text}</span>
			{cloneElement(children, { id })}
		</label>
	);
}
function ResponsibilityDetail({
	entry,
	roster,
	viewerId,
	now,
	demo,
	busy,
	act,
	exportHistory,
	upload,
	processedDocuments,
	openDocument,
}: {
	entry: CaseEntry;
	roster: Person[];
	viewerId: string;
	now: number;
	demo: boolean;
	busy: boolean;
	act: (command: Command) => Promise<void>;
	exportHistory: () => Promise<void>;
	upload?: (file: File) => Promise<void>;
	processedDocuments: { name: string; reference: string; digest: string }[];
	openDocument?: (reference: string) => Promise<void>;
}) {
	const state = entry.state;
	const readiness = closureReadiness(state, roster);
	const name = (id: string) =>
		roster.find((person) => person.id === id)?.name ?? "Former officer";
	const [response, setResponse] = useState("");
	const [reference, setReference] = useState("");
	const [digest, setDigest] = useState("");
	const [evidenceNote, setEvidenceNote] = useState("");
	const [outcome, setOutcome] = useState<
		NonNullable<Responsibility["evidence"]>["outcome"]
	>(state.category === "tax" ? "liability-settled" : "obligation-completed");
	const [disclosure, setDisclosure] = useState("");
	const isClosed = state.phase === "resolved";
	return (
		<section
			className={`${card} min-w-0 space-y-6 p-5 sm:p-6`}
			aria-label="Responsibility details"
		>
			<div>
				<div className="flex flex-wrap items-center justify-between gap-3">
					<RiskBadge state={state} now={now} />
					<span className="text-xs text-[#819086]">
						Version {state.revision} · Policy {state.policyVersion}
					</span>
				</div>
				<h2 className="mt-3 text-xl font-semibold leading-7 text-[#173c29]">
					{state.title}
				</h2>
				<p className="mt-2 text-sm font-medium text-[#a35e32]">
					Actual deadline: {formatDate(state.dueAt, state.timezone)}
				</p>
			</div>
			<div className="grid gap-3 rounded-xl bg-[#f3f7f4] p-4 text-xs sm:grid-cols-3">
				{[
					["Owner", state.ownerId],
					["Backup", state.backupId],
					["Oversight", state.reviewerId],
				].map(([label, id]) => (
					<div key={label}>
						<span className="block text-[#7a8d7f]">{label}</span>
						<strong className="mt-1 block text-[#335940]">{name(id)}</strong>
					</div>
				))}
			</div>
			<div>
				<h3 className="text-sm font-semibold">1. Source and responsibility</h3>
				<p className="mt-2 break-words text-sm text-[#62736a]">
					{state.source}
				</p>
				<blockquote className="mt-3 border-l-2 border-[#a6bfac] pl-3 text-sm leading-6 text-[#617267]">
					{state.sourceExcerpt}
				</blockquote>
				<p className="mt-3 text-xs leading-5 text-[#6f7f74]">
					<strong>Required closure evidence:</strong> {state.expectedEvidence}
					<br />
					<strong>Next check:</strong>{" "}
					{formatDate(state.nextCheckAt, state.timezone)}
				</p>
				{state.phase === "intake" && (
					<button
						className={`${button} mt-4`}
						type="button"
						disabled={busy}
						onClick={() => void act({ type: "confirm" })}
					>
						I checked the source and deadline
					</button>
				)}
				{upload && !isClosed && (
					<label className={`${secondary} mt-3 cursor-pointer`}>
						<FileUp className="size-4" /> Attach notice / evidence
						<input
							type="file"
							accept="application/pdf,image/png,image/jpeg"
							className="sr-only"
							disabled={busy}
							onChange={(event) => {
								const file = event.target.files?.[0];
								if (file) void upload(file);
								event.target.value = "";
							}}
						/>
					</label>
				)}
			</div>
			{!isClosed && (
				<div className="border-t border-[#e5ece7] pt-5">
					<h3 className="text-sm font-semibold">
						2. Board awareness and response
					</h3>
					<p className="mt-2 text-xs leading-5 text-[#6c7e70]">
						{state.acknowledgedBy.length} acknowledgements · Escalation level{" "}
						{escalationFor(state, now)}
						<br />
						Critical risks go to the owner, backup and full board. At 24 hours
						without owner acknowledgement the backup is activated. At 48 hours
						without a documented response, oversight is escalated.
					</p>
					<button
						className={`${secondary} mt-3`}
						type="button"
						disabled={busy || state.acknowledgedBy.includes(viewerId)}
						onClick={() => void act({ type: "acknowledge" })}
					>
						{state.acknowledgedBy.includes(viewerId)
							? "You acknowledged this notice"
							: "Acknowledge receipt — not resolution"}
					</button>
					{state.response && (
						<div className="mt-3 rounded-lg bg-[#eef5f0] p-3 text-sm">
							<p>{state.response.note}</p>
							<p className="mt-1 text-xs text-[#6c7e70]">
								Recorded by {name(state.response.by)}
							</p>
						</div>
					)}
					<form
						className="mt-3 space-y-3"
						onSubmit={(event) => {
							event.preventDefault();
							void act({ type: "respond", note: response });
						}}
					>
						<Label text="What action is being taken?">
							<textarea
								className={field}
								rows={3}
								required
								value={response}
								maxLength={4000}
								onChange={(event) => setResponse(event.target.value)}
								placeholder="Who contacted the county, what was confirmed, and what happens next?"
							/>
						</Label>
						<button
							className={secondary}
							disabled={busy || !response.trim()}
							type="submit"
						>
							Record response
						</button>
					</form>
					{state.category === "tax" && (
						<div className="mt-4">
							<Label text="Exemption application (separate from payment liability)">
								<select
									className={field}
									value={state.exemption}
									disabled={busy}
									onChange={(event) =>
										void act({
											type: "exemption",
											status: event.target.value as Responsibility["exemption"],
										})
									}
								>
									<option value="not-applicable">
										Not applicable / not filed
									</option>
									<option value="pending">
										Pending — liability still open
									</option>
									<option value="approved">
										Approved — coverage evidence still required
									</option>
								</select>
							</Label>
						</div>
					)}
				</div>
			)}
			<div className="border-t border-[#e5ece7] pt-5">
				<h3 className="text-sm font-semibold">
					3. Evidence and independent approval
				</h3>
				<p className="mt-2 text-xs leading-5 text-[#6c7e70]">
					{state.critical
						? "Two different reviewers, including a director, must approve. Neither the owner nor the evidence submitter may approve."
						: "An independent reviewer must approve the completion evidence."}{" "}
					Changing evidence clears earlier approvals.
				</p>
				{state.evidence && (
					<div className="mt-3 space-y-2 rounded-xl border border-[#dce6de] bg-[#f8faf8] p-4 text-sm">
						<strong>Evidence revision {state.evidence.revision}</strong>
						<p>{state.evidence.note}</p>
						<p className="break-all text-xs text-[#65796a]">
							{state.evidence.reference}
						</p>
						{openDocument && (
							<button
								type="button"
								className={secondary}
								onClick={() =>
									void openDocument(state.evidence?.reference ?? "")
								}
							>
								Open exact evidence document
							</button>
						)}
						<details className="text-xs">
							<summary className="cursor-pointer text-[#557b60]">
								Document fingerprint
							</summary>
							<code className="mt-2 block break-all">
								{state.evidence.digest}
							</code>
						</details>
						<p className="text-xs">
							Submitted by {name(state.evidence.submittedBy)}
						</p>
						<div className="flex flex-wrap gap-2">
							{state.approvals.map((approval) => (
								<span
									key={approval.by}
									className="rounded bg-[#dfefe3] px-2 py-1 text-xs text-[#396b45]"
								>
									{name(approval.by)} approved
								</span>
							))}
						</div>
						<p className="text-xs font-medium">
							{readiness.count}/{readiness.required} independent approvals ·
							Director{" "}
							{readiness.hasDirector
								? "included"
								: "still required for critical closure"}
						</p>
					</div>
				)}
				{!isClosed && state.phase !== "intake" && (
					<details className="mt-4 rounded-xl border border-[#dce6de] p-4">
						<summary className="cursor-pointer text-sm font-semibold">
							{state.evidence
								? "Replace closure evidence"
								: "Submit closure evidence"}
						</summary>
						<form
							className="mt-4 space-y-3"
							onSubmit={(event) => {
								event.preventDefault();
								void act({
									type: "evidence",
									reference,
									digest,
									note: evidenceNote,
									outcome,
								});
							}}
						>
							<Label text="Document reference">
								<select
									required
									className={field}
									value={reference}
									onChange={(event) => {
										setReference(event.target.value);
										setDigest(
											processedDocuments.find(
												(file) => file.reference === event.target.value,
											)?.digest ?? "",
										);
									}}
								>
									<option value="">Select a processed document</option>
									{demo && (
										<option value="demo://paid-in-full-receipt">
											Sample receipt (simulation only)
										</option>
									)}
									{processedDocuments.map((file) => (
										<option key={file.reference} value={file.reference}>
											{file.name}
										</option>
									))}
								</select>
							</Label>
							<details>
								<summary className="cursor-pointer text-xs text-[#6e7f72]">
									Document fingerprint (filled automatically)
								</summary>
								<Label text="SHA-256 document fingerprint">
									<input
										required
										readOnly
										pattern="[a-f0-9]{64}"
										className={`${field} font-mono`}
										value={digest}
										onChange={(event) => setDigest(event.target.value)}
										placeholder="64 lowercase hexadecimal characters"
									/>
								</Label>
							</details>
							{demo && (
								<button
									className={secondary}
									type="button"
									onClick={() => {
										setDigest("a".repeat(64));
										setReference("demo://paid-in-full-receipt");
										setEvidenceNote(
											"Demonstration receipt covers the complete liability and current tax period.",
										);
									}}
								>
									Use clearly labelled sample evidence
								</button>
							)}
							<Label text="What does this document prove?">
								<textarea
									className={field}
									required
									rows={3}
									maxLength={4000}
									value={evidenceNote}
									onChange={(event) => setEvidenceNote(event.target.value)}
								/>
							</Label>
							<Label text="Proposed outcome">
								<select
									className={field}
									value={outcome}
									onChange={(event) =>
										setOutcome(event.target.value as typeof outcome)
									}
								>
									{state.category === "tax" ? (
										<>
											<option value="liability-settled">
												Liability paid or otherwise settled
											</option>
											<option value="exemption-approved">
												Approved exemption covers this liability
											</option>
										</>
									) : (
										<option value="obligation-completed">
											Obligation completed
										</option>
									)}
								</select>
							</Label>
							<button className={button} disabled={busy} type="submit">
								Submit for independent review
							</button>
						</form>
					</details>
				)}
				{state.phase === "review" && (
					<div className="mt-4 flex flex-wrap gap-3">
						<button
							className={secondary}
							disabled={busy || (!demo && state.critical)}
							type="button"
							onClick={() => void act({ type: "approve" })}
						>
							{demo
								? "Simulate independent approval"
								: "Approve current evidence"}
						</button>
						<button
							className={button}
							disabled={busy || !readiness.ready || (!demo && state.critical)}
							type="button"
							onClick={() => void act({ type: "resolve" })}
						>
							Finalize reviewed resolution
						</button>
					</div>
				)}
				{isClosed && (
					<p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-800">
						<CheckCircle2 className="size-4" /> Resolved after independent
						review{demo ? " (simulated)" : ""}
					</p>
				)}
			</div>
			<div className="border-t border-[#e5ece7] pt-5">
				<h3 className="text-sm font-semibold">4. Community update</h3>
				<p className="mt-2 text-xs leading-5 text-[#6c7e70]">
					Limited status counts are automatic. Detailed updates require a
					different director's approval. Do not include private notices, donor
					details or privileged advice.
				</p>
				{state.disclosure && (
					<div className="mt-3 rounded-lg bg-[#f2f5ef] p-3 text-sm">
						<p>{state.disclosure.text}</p>
						<p className="mt-2 text-xs font-semibold">
							{state.disclosure.approvedBy
								? `Publication approved by ${name(state.disclosure.approvedBy)}`
								: "Private draft · not published"}
						</p>
						{!state.disclosure.approvedBy && (
							<button
								className={`${secondary} mt-3`}
								type="button"
								disabled={busy}
								onClick={() => void act({ type: "approve-disclosure" })}
							>
								Approve redacted update for publication
							</button>
						)}
					</div>
				)}
				<form
					className="mt-3 space-y-3"
					onSubmit={(event) => {
						event.preventDefault();
						void act({ type: "propose-disclosure", text: disclosure });
					}}
				>
					<Label text="Propose a redacted community update">
						<textarea
							required
							maxLength={2000}
							className={field}
							rows={3}
							value={disclosure}
							onChange={(event) => setDisclosure(event.target.value)}
							placeholder="The board has assigned an owner and is reviewing supporting evidence."
						/>
					</Label>
					<button
						className={secondary}
						type="submit"
						disabled={busy || !disclosure.trim()}
					>
						Send update for approval
					</button>
				</form>
			</div>
			<button
				type="button"
				className={secondary}
				disabled={busy}
				onClick={() => void exportHistory()}
			>
				Export private review history
			</button>
		</section>
	);
}
export function CommunityPanel({
	summary,
	publications,
}: {
	summary: Summary;
	publications: { text: string; approvedAt: number; revision: number }[];
}) {
	return (
		<section className={`${card} p-6 sm:p-8`}>
			<Globe2 className="size-7 text-[#467d57]" />
			<h2 className="mt-3 text-xl font-semibold text-[#21482f]">
				Community assurance summary
			</h2>
			<p className="mt-2 max-w-xl text-sm leading-6 text-[#708073]">
				A limited view of registered responsibilities. No private notices,
				officer names, document contents or financial details are included in
				these automatic counts.
			</p>
			<dl className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
				{[
					["Registered", summary.registered],
					["Unresolved", summary.unresolved],
					["Overdue", summary.overdue],
					["Updates restricted / awaiting review", summary.restrictedUpdates],
				].map(([label, value]) => (
					<div key={label}>
						<dt className="text-xs leading-5 text-[#768677]">{label}</dt>
						<dd className="mt-1 text-2xl font-semibold text-[#315a3c]">
							{value}
						</dd>
					</div>
				))}
			</dl>
			<p className="mt-6 rounded-xl bg-[#f6f4e8] p-4 text-xs leading-5 text-[#807342]">
				Monitoring: {summary.monitoring}.{" "}
				{summary.lastSweepAt
					? `Last completed scan: ${new Date(summary.lastSweepAt).toLocaleString()}.`
					: "No completed monitoring scan has been observed."}{" "}
				{summary.scope}
			</p>
			<h3 className="mt-7 text-sm font-semibold">Approved board updates</h3>
			{publications.length === 0 ? (
				<p className="mt-3 text-sm text-[#788579]">
					No detailed update has been approved for publication yet. Restricted
					updates do not mean there are no risks.
				</p>
			) : (
				publications.map((publication) => (
					<article
						key={`${publication.approvedAt}-${publication.revision}-${publication.text}`}
						className="mt-4 rounded-xl border border-[#dfe8df] p-4"
					>
						<p className="whitespace-pre-wrap text-sm leading-6">
							{publication.text}
						</p>
						<p className="mt-2 text-xs text-[#718070]">
							Approved {new Date(publication.approvedAt).toLocaleString()} ·
							Record version {publication.revision}
						</p>
					</article>
				))
			)}
		</section>
	);
}
export function PublicGovernancePage({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	if (clientConfig.convexConfigured && import.meta.env.MODE !== "test")
		return <LivePublicGovernance organizationSlug={organizationSlug} />;
	return (
		<div className="mx-auto max-w-4xl space-y-5 p-6">
			<h1 className="text-2xl font-semibold">Community transparency</h1>
			<p className="text-sm">
				Local demonstration only. Public reporting becomes available when an
				organization is connected.
			</p>
			<CommunityPanel
				summary={communitySummary([], Date.now())}
				publications={[]}
			/>
		</div>
	);
}
function LivePublicGovernance({
	organizationSlug,
}: {
	organizationSlug: string;
}) {
	const result = useQuery(api.governance.community, { organizationSlug });
	if (result === undefined)
		return (
			<div className="p-8" aria-busy="true">
				Loading community summary…
			</div>
		);
	if (!result)
		return (
			<div className="p-8">
				No public community summary is available for this organization.
			</div>
		);
	return (
		<div className="mx-auto max-w-4xl space-y-5 p-6">
			<h1 className="text-2xl font-semibold">{result.organization}</h1>
			{result.demo && (
				<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
					Demonstration data — not a real organization's compliance report.
				</p>
			)}
			<CommunityPanel
				summary={result.summary}
				publications={result.publications}
			/>
		</div>
	);
}

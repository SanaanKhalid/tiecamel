import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Person } from "../governance/model";
import { usePlatform } from "../platform/store";
import { NoticeForm } from "./governance-page";
import { PilotReadiness } from "./pilot-readiness";

const button =
	"rounded-lg border border-[#cbdacf] bg-white px-3 py-2 text-xs font-semibold text-[#315e40] disabled:opacity-50";
const input =
	"w-full rounded-lg border border-[#cbdacf] bg-white px-3 py-2 text-sm";
export function GovernanceOperations({
	roster,
	now,
}: {
	roster: Person[];
	now: number;
}) {
	const platform = usePlatform();
	const scope = {
		organizationId: platform.organization.id as Id<"organizations">,
		demoSessionToken: platform.demoSessionToken,
	};
	const inbox = useQuery(api.inbound.inbox, scope);
	const delivery = useQuery(api.delivery.status, scope);
	const contact = useQuery(api.delivery.myContact, scope);
	const readiness = useQuery(api.readiness.status, scope);
	const enableInbox = useMutation(api.inbound.enable);
	const retryMail = useMutation(api.inbound.retryRetrieval);
	const retryDelivery = useMutation(api.delivery.retryBlocked);
	const setConsent = useMutation(api.delivery.setWhatsAppConsent);
	const verifyPhone = useAction(api.delivery.verifyPhone);
	const register = useMutation(api.governance.register);
	const [selected, setSelected] = useState<string>();
	const [phone, setPhone] = useState("");
	const [code, setCode] = useState("");
	const [consent, setAgreed] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	async function run(work: () => Promise<unknown>, success: string) {
		setBusy(true);
		setError("");
		setMessage("");
		try {
			await work();
			setMessage(success);
		} catch (caught) {
			setError(
				caught instanceof Error
					? caught.message
					: "Operation could not be completed",
			);
		} finally {
			setBusy(false);
		}
	}
	const selectedNotice = inbox?.notices.find(
		(notice) => notice._id === selected,
	);
	return (
		<section
			className="mx-auto max-w-[1440px] space-y-4 px-4 pb-8 sm:px-7 lg:px-9"
			aria-label="Notice intake and delivery operations"
		>
			<PilotReadiness readiness={readiness} />
			{error && (
				<p
					role="alert"
					className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
				>
					{error}
				</p>
			)}
			{message && (
				<output className="block rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
					{message}
				</output>
			)}
			<details className="rounded-2xl border border-[#dce5e0] bg-white p-5">
				<summary className="cursor-pointer font-semibold text-[#31563d]">
					Forwarded notices ·{" "}
					{inbox?.notices.filter((notice) => notice.status !== "linked")
						.length ?? 0}{" "}
					awaiting attention
				</summary>
				<div className="mt-4 space-y-4 text-sm text-[#687d6e]">
					<p>
						Forward notices to the organization's dedicated inbox. Incoming
						email is untrusted: it cannot create approvals, change a deadline or
						close a responsibility.
					</p>
					{inbox?.address ? (
						<p className="break-all rounded-lg bg-[#f0f5f1] p-3 font-mono text-xs">
							{inbox.address}
						</p>
					) : (
						<button
							type="button"
							className={button}
							disabled={
								busy || !inbox?.configured || !!platform.demoSessionToken
							}
							onClick={() =>
								void run(() => enableInbox(scope), "Forwarding inbox enabled.")
							}
						>
							{inbox?.configured
								? "Enable organization notice inbox"
								: "Inbound email is awaiting configuration"}
						</button>
					)}
					{inbox?.notices.map((notice) => (
						<article
							key={notice._id}
							className="space-y-2 rounded-xl border border-[#e0e8e1] p-4"
						>
							<div className="flex flex-wrap justify-between gap-2">
								<h3 className="font-semibold text-[#3d5b45]">
									{notice.subject}
								</h3>
								<span className="text-xs">{notice.status}</span>
							</div>
							<p className="break-words text-xs">
								From: {notice.sender} · {notice.attachmentCount} attachments
							</p>
							<p className="whitespace-pre-wrap break-words text-xs leading-5">
								{notice.excerpt.slice(0, 800)}
							</p>
							{notice.attachmentCount > 0 && (
								<p className="text-xs text-amber-800">
									Attachments are not automatically trusted. Upload the original
									notice through the managed Documents workflow before using it
									as closure evidence.
								</p>
							)}
							{notice.error && (
								<p className="text-xs text-red-700">{notice.error}</p>
							)}
							{notice.status === "unconfirmed" && (
								<button
									className={button}
									type="button"
									onClick={() => setSelected(notice._id)}
								>
									Assign responsibility and confirm source
								</button>
							)}
							{notice.status === "failed" && (
								<button
									className={button}
									type="button"
									disabled={busy}
									onClick={() =>
										void run(
											() => retryMail({ ...scope, id: notice._id }),
											"Retrieval queued.",
										)
									}
								>
									Retry retrieval
								</button>
							)}
						</article>
					))}
				</div>
			</details>
			{selectedNotice && (
				<NoticeForm
					roster={roster}
					now={now}
					busy={busy}
					initial={{
						title: selectedNotice.subject.slice(0, 180),
						source: `Forwarded notice from ${selectedNotice.sender}`,
						sourceExcerpt: selectedNotice.excerpt.slice(0, 4000),
					}}
					onCancel={() => setSelected(undefined)}
					onSubmit={(value) =>
						run(async () => {
							await register({
								...scope,
								input: value,
								inboundNoticeId: selectedNotice._id,
							});
							setSelected(undefined);
						}, "Responsibility registered. The source and deadline still need human confirmation.")
					}
				/>
			)}
			<details className="rounded-2xl border border-[#dce5e0] bg-white p-5">
				<summary className="cursor-pointer font-semibold text-[#31563d]">
					Alert delivery · {delivery?.enabled ? "enabled" : "not enabled"}
				</summary>
				<div className="mt-4 space-y-4 text-sm text-[#687d6e]">
					<p>
						Email and WhatsApp delivery are tracked separately. “Accepted” means
						the provider accepted the request—not that the officer saw it.
						Reading an alert is not acknowledgement.
					</p>
					<p className="text-xs">
						Worker:{" "}
						{!delivery?.lastWorkerAt
							? "not yet observed"
							: now - delivery.lastWorkerAt > 15 * 60_000
								? "stale — investigate immediately"
								: "recently observed"}
						. Recent delivery attempts are shown below; the responsibility
						remains visible even when external messaging fails.
					</p>
					<div className="space-y-2">
						{delivery?.rows.slice(0, 20).map((row) => (
							<div
								key={row.id}
								className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-[#f5f7f4] p-3 text-xs"
							>
								<div>
									<strong>
										{row.channel} · {row.status}
									</strong>
									<p className="mt-1">
										{roster.find((person) => person.id === row.membershipId)
											?.name ?? "Former member"}{" "}
										· {row.attempts} attempts
									</p>
									{row.error && (
										<p className="mt-1 text-amber-800">{row.error}</p>
									)}
								</div>
								{["blocked", "failed"].includes(row.status) && (
									<button
										className={button}
										type="button"
										disabled={busy}
										onClick={() =>
											void run(
												() => retryDelivery({ ...scope, id: row.id }),
												"Retry queued; delivery is not yet confirmed.",
											)
										}
									>
										Retry after fixing cause
									</button>
								)}
							</div>
						))}
					</div>
					<div className="border-t border-[#dce5e0] pt-4">
						<h3 className="font-semibold text-[#31563d]">Your alert contact</h3>
						<p className="mt-2 text-xs">
							Email: {contact?.email}. WhatsApp:{" "}
							{contact?.contact?.whatsappVerifiedAt &&
							contact.contact.whatsappConsentedAt
								? "verified and opted in"
								: "not ready"}
							.
						</p>
						<form
							className="mt-3 grid gap-3 sm:grid-cols-2"
							onSubmit={(event) => {
								event.preventDefault();
								void run(
									() => setConsent({ ...scope, number: phone, consent }),
									"Preference saved. Verify ownership before WhatsApp alerts can be delivered.",
								);
							}}
						>
							<label className="space-y-1 text-xs">
								<span>Your WhatsApp number (international format)</span>
								<input
									type="tel"
									className={input}
									value={phone}
									onChange={(event) => setPhone(event.target.value)}
									placeholder="+15551234567"
									required
								/>
							</label>
							<label className="flex items-center gap-2 text-xs">
								<input
									type="checkbox"
									required
									checked={consent}
									onChange={(event) => setAgreed(event.target.checked)}
								/>
								I agree to receive board responsibility alerts on my own
								WhatsApp number.
							</label>
							<button
								type="submit"
								className={button}
								disabled={busy || !!platform.demoSessionToken}
							>
								Save consent
							</button>
							{contact?.contact?.whatsappConsentedAt && (
								<button
									type="button"
									className={button}
									disabled={busy}
									onClick={() =>
										void run(
											() =>
												setConsent({
													...scope,
													number: contact.contact?.whatsappNumber ?? "",
													consent: false,
												}),
											"WhatsApp consent withdrawn. Email and board visibility remain active.",
										)
									}
								>
									Withdraw WhatsApp consent
								</button>
							)}
						</form>
						<div className="mt-3 flex flex-wrap items-end gap-3">
							<button
								type="button"
								className={button}
								disabled={busy || !!platform.demoSessionToken}
								onClick={() =>
									void run(
										() => verifyPhone(scope),
										"Verification requested. Check WhatsApp for the code.",
									)
								}
							>
								Send ownership verification
							</button>
							<label className="space-y-1 text-xs">
								<span>Verification code</span>
								<input
									className={input}
									inputMode="numeric"
									value={code}
									onChange={(event) => setCode(event.target.value)}
								/>
							</label>
							<button
								type="button"
								className={button}
								disabled={busy || !code || !!platform.demoSessionToken}
								onClick={() =>
									void run(async () => {
										const result = await verifyPhone({ ...scope, code });
										if (!result.verified)
											throw new Error("Code not yet verified");
									}, "WhatsApp ownership verified.")
								}
							>
								Verify code
							</button>
						</div>
					</div>
				</div>
			</details>
		</section>
	);
}

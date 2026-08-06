import {
	Building2,
	CheckCircle2,
	Cloud,
	Database,
	ExternalLink,
	MapPin,
	RefreshCcw,
	ShieldCheck,
	Users,
} from "lucide-react";
import { useState } from "react";
import { clientConfig } from "../config/client";
import { usePlatform } from "../platform/store";
import { Avatar } from "./platform-ui";

export function OrganizationSettingsPage() {
	const platform = usePlatform();
	const [notice, setNotice] = useState("");
	const viewer = platform.members.find(
		(member) => member.id === platform.viewerId,
	);
	if (
		!viewer ||
		!["organization-owner", "organization-admin"].includes(viewer.role)
	) {
		return (
			<div className="mx-auto max-w-[800px] px-4 py-12">
				<div className="rounded-lg border border-[#d0d7de] bg-white p-8 text-center">
					<ShieldCheck className="mx-auto size-8 text-[#656d76]" />
					<h1 className="mt-3 text-xl font-semibold">
						Organization administrator access required
					</h1>
					<p className="mt-2 text-sm text-[#656d76]">
						Only organization owners and administrators can manage provider
						connections and service identities.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 lg:px-8">
			<div className="border-b border-[#d0d7de] pb-5">
				<h1 className="text-2xl font-semibold">Organization settings</h1>
				<p className="mt-1 text-sm text-[#656d76]">
					Manage repositories, teams, locations, access, and platform readiness
					for {platform.organization.name}.
				</p>
			</div>

			<div className="mt-6 grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
				<nav className="space-y-1 text-sm">
					<a
						href="#profile"
						className="flex items-center gap-2 rounded-md bg-[#d0d7de]/45 px-3 py-2 font-semibold"
					>
						<Building2 className="size-4" /> Profile
					</a>
					<a
						href="#teams"
						className="flex items-center gap-2 rounded-md px-3 py-2 text-[#656d76] hover:bg-[#f6f8fa]"
					>
						<Users className="size-4" /> Teams and access
					</a>
					<a
						href="#locations"
						className="flex items-center gap-2 rounded-md px-3 py-2 text-[#656d76] hover:bg-[#f6f8fa]"
					>
						<MapPin className="size-4" /> Locations
					</a>
					<a
						href="#integrations"
						className="flex items-center gap-2 rounded-md px-3 py-2 text-[#656d76] hover:bg-[#f6f8fa]"
					>
						<Cloud className="size-4" /> Record integrations
					</a>
					<a
						href="#services"
						className="flex items-center gap-2 rounded-md px-3 py-2 text-[#656d76] hover:bg-[#f6f8fa]"
					>
						<Database className="size-4" /> System status
					</a>
				</nav>

				<div className="space-y-6">
					<section
						id="profile"
						className="rounded-md border border-[#d0d7de] bg-white"
					>
						<div className="border-b border-[#d8dee4] p-4">
							<h2 className="font-semibold">Organization profile</h2>
						</div>
						<dl className="divide-y divide-[#d8dee4] text-sm">
							<Setting
								label="Organization"
								value={platform.organization.name}
							/>
							<Setting
								label="Short name"
								value={platform.organization.shortName}
							/>
							<Setting
								label="Canonical URL"
								value={`/${platform.organization.slug}`}
								mono
							/>
							<Setting
								label="Current demo view"
								value={viewer ? `${viewer.name} — ${viewer.title}` : "Member"}
							/>
						</dl>
					</section>

					<section
						id="teams"
						className="rounded-md border border-[#d0d7de] bg-white"
					>
						<div className="flex items-center justify-between border-b border-[#d8dee4] p-4">
							<div>
								<h2 className="font-semibold">Teams and reviewers</h2>
								<p className="mt-0.5 text-xs text-[#656d76]">
									Repository rules refer to teams rather than hardcoded titles.
								</p>
							</div>
							<span className="text-xs text-[#656d76]">
								{platform.members.length} members
							</span>
						</div>
						<div className="divide-y divide-[#d8dee4]">
							{platform.teams.map((team) => {
								const members = platform.members.filter((member) =>
									member.teamIds.includes(team.id),
								);
								return (
									<article
										key={team.id}
										className="flex items-center gap-4 p-4"
									>
										<span className="grid size-9 place-items-center rounded-md bg-[#eaeef2]">
											<Users className="size-4 text-[#656d76]" />
										</span>
										<div className="min-w-0 flex-1">
											<h3 className="font-semibold">{team.name}</h3>
											<p className="mt-0.5 text-xs text-[#656d76]">
												{team.description}
											</p>
										</div>
										<div className="flex -space-x-1">
											{members.slice(0, 4).map((member) => (
												<Avatar key={member.id} member={member} size="sm" />
											))}
										</div>
										<span className="text-xs text-[#656d76]">
											{members.length}
										</span>
									</article>
								);
							})}
						</div>
					</section>

					<section
						id="locations"
						className="rounded-md border border-[#d0d7de] bg-white"
					>
						<div className="border-b border-[#d8dee4] p-4">
							<h2 className="font-semibold">Locations</h2>
							<p className="mt-0.5 text-xs text-[#656d76]">
								Repositories stay organization-wide; work and rules may target
								these locations.
							</p>
						</div>
						<div className="divide-y divide-[#d8dee4]">
							{platform.locations.map((location) => (
								<div key={location.id} className="flex items-center gap-3 p-4">
									<MapPin className="size-4 text-[#656d76]" />
									<div className="flex-1">
										<p className="font-semibold">{location.name}</p>
										<p className="text-xs text-[#656d76]">
											{location.shortName}
										</p>
									</div>
									<span className="rounded-full bg-[#dafbe1] px-2 py-0.5 text-xs font-semibold text-[#1a7f37]">
										Active
									</span>
								</div>
							))}
						</div>
					</section>

					<section
						id="integrations"
						className="rounded-md border border-[#d0d7de] bg-white"
					>
						<div className="border-b border-[#d8dee4] p-4">
							<h2 className="font-semibold">Accepted-record integrations</h2>
							<p className="mt-1 text-xs leading-5 text-[#656d76]">
								Optional connections let a repository publish its approved
								document into a fixed client-owned folder. TieCamel always
								retains the approved version and its audit history.
							</p>
						</div>
						<div className="space-y-3 p-4">
							{platform.providerConnections.map((connection) => (
								<div
									key={connection.id}
									className="rounded-lg border border-[#d0d7de] p-4"
								>
									<div className="flex flex-col gap-4 sm:flex-row sm:items-start">
										<span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#e8f0fe] text-[#1a73e8]">
											<Cloud className="size-5" />
										</span>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2">
												<h3 className="font-semibold">
													{connection.displayName}
												</h3>
												<span className="rounded-full bg-[#dafbe1] px-2 py-0.5 text-xs font-semibold text-[#1a7f37]">
													{connection.status === "healthy"
														? "Healthy"
														: connection.status}
												</span>
												{connection.simulated && (
													<span className="rounded-full bg-[#fff8c5] px-2 py-0.5 text-xs font-semibold text-[#9a6700]">
														Simulator
													</span>
												)}
											</div>
											<p className="mt-1 text-sm text-[#656d76]">
												Google Shared Drives · {connection.externalDomain}
											</p>
											<dl className="mt-3 grid gap-2 text-xs text-[#656d76]">
												<div>
													<dt className="font-semibold text-[#1f2328]">
														Dedicated service identity
													</dt>
													<dd className="mt-0.5 break-all font-mono">
														{connection.serviceIdentity}
													</dd>
												</div>
												<div>
													<dt className="font-semibold text-[#1f2328]">
														Connection behavior
													</dt>
													<dd className="mt-0.5">
														Administrators grant this identity access only to
														the approved Shared Drive folder.
													</dd>
												</div>
											</dl>
											<p className="mt-3 rounded-md bg-[#f6f8fa] p-2 text-xs text-[#656d76]">
												{connection.healthMessage}
											</p>
										</div>
										<button
											type="button"
											onClick={async () => {
												await platform.verifyProviderConnection(connection.id);
												setNotice("Google Drive connection verified.");
											}}
											className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d0d7de] px-3 py-2 text-sm font-semibold hover:bg-[#f6f8fa]"
										>
											<RefreshCcw className="size-4" /> Verify
										</button>
									</div>
								</div>
							))}
							<div className="rounded-lg border border-dashed border-[#d0d7de] p-4">
								<div className="flex items-start gap-3">
									<span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#e7f3ff] text-[#0969da]">
										<ExternalLink className="size-5" />
									</span>
									<div>
										<div className="flex flex-wrap items-center gap-2">
											<h3 className="font-semibold">OneDrive for Business</h3>
											<span className="rounded-full bg-[#eaeef2] px-2 py-0.5 text-xs font-semibold text-[#656d76]">
												Follow-on adapter
											</span>
										</div>
										<p className="mt-1 text-sm leading-5 text-[#656d76]">
											The Microsoft Graph adapter uses the same fixed-folder and
											publication contracts. It remains disabled until the
											Google Drive release reaches production acceptance.
										</p>
									</div>
								</div>
							</div>
						</div>
					</section>

					<section
						id="services"
						className="rounded-md border border-[#d0d7de] bg-white"
					>
						<div className="border-b border-[#d8dee4] p-4">
							<h2 className="font-semibold">System status</h2>
							<p className="mt-1 text-xs text-[#656d76]">
								Core services supporting this workspace.
							</p>
						</div>
						<div className="grid gap-3 p-4 sm:grid-cols-2">
							<Service
								title="Secure access"
								ready={clientConfig.authConfigured}
								detail={
									clientConfig.authConfigured
										? "Verified sign-in enabled"
										: "Preview access enabled"
								}
							/>
							<Service
								title="Workspace data"
								ready={clientConfig.convexConfigured}
								detail={
									clientConfig.convexConfigured
										? "Connected and up to date"
										: "Seeded preview data"
								}
							/>
							<Service
								title="Managed record storage"
								ready
								detail="Private uploads and immutable accepted records"
							/>
							<Service
								title="Document processing"
								ready={false}
								detail="Scanning, extraction, comparison, and verification"
							/>
						</div>
					</section>

					<section className="rounded-md border border-[#d0d7de] bg-white p-4">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h2 className="font-semibold">Reset seeded organization</h2>
								<p className="mt-1 text-sm text-[#656d76]">
									Restore ICN repositories, issues, changes, records, and the
									simulated provider connection.
								</p>
							</div>
							<button
								type="button"
								onClick={() => {
									platform.reset();
									setNotice("Seeded organization restored.");
								}}
								className="inline-flex items-center justify-center gap-2 rounded-md border border-[#d0d7de] px-3 py-2 text-sm font-semibold hover:bg-[#f6f8fa]"
							>
								<RefreshCcw className="size-4" /> Reset preview
							</button>
						</div>
						{notice && (
							<p className="mt-3 text-sm font-semibold text-[#1a7f37]">
								{notice}
							</p>
						)}
					</section>
				</div>
			</div>
		</div>
	);
}

function Setting({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-4 px-4 py-3">
			<dt className="text-[#656d76]">{label}</dt>
			<dd className={`font-semibold ${mono ? "font-mono text-xs" : ""}`}>
				{value}
			</dd>
		</div>
	);
}

function Service({
	title,
	ready,
	detail,
}: {
	title: string;
	ready: boolean;
	detail: string;
}) {
	return (
		<div className="flex gap-3 rounded-md border border-[#d0d7de] p-3">
			{ready ? (
				<CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#1a7f37]" />
			) : (
				<ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#9a6700]" />
			)}
			<div>
				<h3 className="text-sm font-semibold">{title}</h3>
				<p className="mt-0.5 text-xs text-[#656d76]">{detail}</p>
			</div>
		</div>
	);
}

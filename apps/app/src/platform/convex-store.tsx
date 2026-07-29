import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type ReactNode, useEffect } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
	type NewChangeInput,
	type NewIssueInput,
	type NewRepositoryInput,
	PlatformContext,
	type PlatformStore,
} from "./store";
import type {
	ActivityEvent,
	ChangeRequest,
	Issue,
	MemberRole,
	PlatformData,
	Repository,
} from "./types";

type Workspace = FunctionReturnType<typeof api.platform.workspace>;

export function ConvexPlatformProvider({ children }: { children: ReactNode }) {
	const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
	const workspace = useQuery(
		api.platform.workspace,
		isAuthenticated ? {} : "skip",
	);
	const ensureSeeded = useMutation(api.platform.ensureSeeded);
	const createIssueMutation = useMutation(api.issues.create);
	const transitionIssue = useMutation(api.issues.transition);
	const commentIssue = useMutation(api.issues.comment);
	const createChangeMutation = useMutation(api.changes.create);
	const commentChange = useMutation(api.changes.comment);
	const submitReview = useMutation(api.changes.submitReview);
	const mergeChangeMutation = useMutation(api.changes.merge);
	const createRepositoryMutation = useMutation(api.repositories.create);
	const updateRepositoryMutation = useMutation(api.repositories.update);
	const updateRulesMutation = useMutation(api.repositories.updateRules);
	const configureStorageMutation = useMutation(
		api.integrations.configureRepositoryStorage,
	);
	const requestBaseline = useMutation(api.baselineImports.request);
	const markRead = useMutation(api.notifications.markRead);
	const authorizeUpload = useMutation(api.uploads.authorize);
	const requestUploadUrl = useAction(api.uploads.requestUploadUrl);
	const finalizeUpload = useMutation(api.uploads.finalize);

	useEffect(() => {
		if (isAuthenticated && workspace && workspace.repositories.length === 0) {
			void ensureSeeded({});
		}
	}, [ensureSeeded, isAuthenticated, workspace]);

	if (authLoading || (isAuthenticated && workspace === undefined)) {
		return (
			<div className="min-h-screen bg-[#f7faf9]" aria-busy="true">
				<div className="mx-auto max-w-7xl px-6 pt-24">
					<div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200" />
					<div className="mt-8 grid gap-4 md:grid-cols-3">
						<div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
						<div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
						<div className="h-36 animate-pulse rounded-2xl bg-slate-100" />
					</div>
				</div>
			</div>
		);
	}
	if (!isAuthenticated || !workspace) {
		return (
			<main className="grid min-h-screen place-items-center bg-[#f7faf9] px-6 text-center">
				<div>
					<h1 className="text-xl font-semibold text-slate-900">
						Sign in to TieCamel
					</h1>
					<p className="mt-2 text-sm text-slate-600">
						This workspace uses verified organization access.
					</p>
				</div>
			</main>
		);
	}

	const data = mapWorkspace(workspace);
	const store: PlatformStore = {
		...data,
		reset: () => {
			void ensureSeeded({});
		},
		switchViewer: () => {
			throw new Error(
				"Identity switching is available only in simulated demo mode.",
			);
		},
		createIssue: async (input) => {
			const created = await createIssueMutation(issueArgs(input));
			return syntheticIssue(
				input,
				String(created.issueId),
				created.number,
				data.viewerId,
			);
		},
		createRepository: async (input) => {
			const repositoryId = await createRepositoryMutation({
				...input,
			});
			return syntheticRepository(input, String(repositoryId));
		},
		updateRepository: async (repositoryId, input) => {
			await updateRepositoryMutation({
				repositoryId: repositoryId as Id<"repositories">,
				...input,
			});
		},
		moveIssue: async (id, status) => {
			await transitionIssue({
				issueId: id as Id<"platformIssues">,
				status,
			});
		},
		addIssueComment: async (id, body, visibility) => {
			await commentIssue({
				issueId: id as Id<"platformIssues">,
				body,
				visibility,
			});
		},
		createChangeRequest: async (input) => {
			const created = await createChangeMutation({
				repositoryId: input.repositoryId as Id<"repositories">,
				title: input.title,
				summary: input.summary,
				linkedIssueId: input.linkedIssueId
					? (input.linkedIssueId as Id<"platformIssues">)
					: undefined,
				locationIds: input.locationIds as Array<Id<"locations">>,
				labelIds: input.labelIds as Array<Id<"labels">>,
				publicAfterMerge: input.publicAfterMerge,
			});
			if (input.file) {
				await uploadPrimaryDocument(
					input.repositoryId,
					String(created.changeId),
					input.file,
					authorizeUpload,
					requestUploadUrl,
					finalizeUpload,
				);
			}
			return syntheticChange(
				input,
				String(created.changeId),
				created.number,
				data.viewerId,
			);
		},
		addChangeComment: async (id, body, visibility) => {
			await commentChange({
				changeRequestId: id as Id<"changeRequests">,
				body,
				visibility,
			});
		},
		reviewChange: async (id, decision, body) => {
			await submitReview({
				changeRequestId: id as Id<"changeRequests">,
				decision,
				body,
			});
		},
		mergeChange: async (id) => {
			const result = await mergeChangeMutation({
				changeRequestId: id as Id<"changeRequests">,
			});
			if (!result.ok) throw new Error(result.message);
		},
		markNotificationRead: (id) => {
			void markRead({
				notificationId: id as Id<"platformNotifications">,
			});
		},
		updateRepositoryRules: async (repositoryId, rules) => {
			await updateRulesMutation({
				repositoryId: repositoryId as Id<"repositories">,
				...rules,
				requiredTeamIds: rules.requiredTeamIds as Array<Id<"teams">>,
			});
		},
		configureRepositoryStorage: async (repositoryId, provider, options) => {
			if (provider === "one-drive") {
				throw new Error("OneDrive for Business is not enabled yet.");
			}
			const result = await configureStorageMutation({
				repositoryId: repositoryId as Id<"repositories">,
				provider,
				connectionId: options?.connectionId
					? (options.connectionId as Id<"providerConnections">)
					: undefined,
				driveId: options?.driveId,
				folderId: options?.folderId,
				displayPath:
					options?.displayPath ??
					(provider === "azure"
						? "TieCamel managed records"
						: "Configured Shared Drive folder"),
			});
			if (!result.ok) throw new Error(result.message);
		},
		verifyProviderConnection: async (connectionId) => {
			throw new Error(
				`Provider verification for ${connectionId} requires the deployed Azure integration worker.`,
			);
		},
		requestBaselineImport: async (input) => {
			const result = await requestBaseline({
				repositoryId: input.repositoryId as Id<"repositories">,
				connectionId: input.connectionId as Id<"providerConnections">,
				externalFileId: input.externalFileId,
				fileName: input.fileName,
				attestation: input.attestation,
			});
			if (!result.ok) throw new Error(result.message);
		},
	};
	return (
		<PlatformContext.Provider value={store}>
			{children}
		</PlatformContext.Provider>
	);
}

function mapWorkspace(workspace: Workspace): PlatformData {
	const members = workspace.memberUsers
		.filter(
			(
				entry,
			): entry is typeof entry & { user: NonNullable<typeof entry.user> } =>
				Boolean(entry.user),
		)
		.map(({ membership, user }) => {
			const role = toMemberRole(membership.role);
			return {
				id: String(membership._id),
				name: user.name,
				title: titleForRole(membership.role),
				email: user.email,
				initials: initials(user.name),
				role,
				teamIds: workspace.teamMembers
					.filter((item) => item.membershipId === membership._id)
					.map((item) => String(item.teamId)),
			};
		});
	const comments = workspace.comments.filter(
		(comment) => comment.moderationStatus === "approved",
	);
	const repositories = workspace.repositories
		.filter(
			(
				entry,
			): entry is typeof entry & { rules: NonNullable<typeof entry.rules> } =>
				Boolean(entry.rules),
		)
		.map(({ repository, rules }) => ({
			id: String(repository._id),
			slug: repository.slug,
			name: repository.name,
			description: repository.description,
			prefix: repository.prefix,
			kind: repository.kind,
			visibility: repository.visibility,
			color: repository.color,
			icon: repository.kind,
			rules: {
				minimumApprovals: rules.minimumApprovals,
				requiredTeamIds: rules.requiredTeamIds.map(String),
				dismissApprovalsOnRevision: rules.dismissApprovalsOnRevision,
				prohibitSelfApproval: rules.prohibitSelfApproval,
				requireIssue: rules.requireIssue,
				requireResolvedThreads: rules.requireResolvedThreads,
				memberIssuesEnabled: rules.memberIssuesEnabled,
				memberCommentsEnabled: rules.memberCommentsEnabled,
				publicIntegrityAnchoring: rules.publicIntegrityAnchoring ?? false,
				finalizerRoles: rules.finalizerRoles as MemberRole[],
			},
			issueCount: repository.issueCount,
			changeCount: repository.changeCount,
			recordCount: repository.recordCount,
			updatedAt: iso(repository.updatedAt),
		}));
	const issues: Issue[] = workspace.issues.map((issue) => ({
		id: String(issue._id),
		repositoryId: String(issue.repositoryId),
		number: issue.number,
		title: issue.title,
		description: issue.description,
		template: issue.template,
		state: issue.state,
		status: issue.status,
		authorId: String(issue.authorMembershipId),
		assigneeIds: issue.assigneeIds.map(String),
		locationIds: issue.locationIds.map(String),
		labelIds: issue.labelIds.map(String),
		dueDate: issue.dueDate ? iso(issue.dueDate) : undefined,
		createdAt: iso(issue.createdAt),
		updatedAt: iso(issue.updatedAt),
		commentCount: issue.commentCount,
		comments: comments
			.filter(
				(comment) =>
					comment.targetType === "issue" &&
					comment.targetId === String(issue._id),
			)
			.map(mapComment),
		linkedChangeIds: workspace.changes
			.filter((change) => change.linkedIssueId === issue._id)
			.map((change) => String(change._id)),
		watcherIds: issue.watcherIds.map(String),
		recurrence: issue.recurrence,
	}));
	const changeRequests: ChangeRequest[] = workspace.changes.map((change) => {
		const revisions = workspace.revisions
			.filter((revision) => revision.changeRequestId === change._id)
			.map((revision) => ({
				id: String(revision._id),
				number: revision.number,
				authorId: String(revision.authorMembershipId),
				createdAt: iso(revision.createdAt),
				message: revision.message,
				files: workspace.files
					.filter((file) => file.revisionId === revision._id)
					.map((file) => ({
						id: String(file._id),
						name: file.name,
						mimeType: file.mimeType,
						sizeLabel: formatBytes(file.size),
						sha256: file.sha256,
						role: file.role,
						objectKey: file.objectKey,
						azureBlobRef: file.azureBlobRef,
						processingStatus:
							file.processingStatus === "quarantined"
								? ("processing" as const)
								: file.processingStatus,
					})),
			}));
		const documentDiff = workspace.diffs.find(
			(diff) => diff.revisionId === change.headRevisionId,
		);
		const publication = [...workspace.publicationJobs]
			.filter((job) => job.changeRequestId === change._id)
			.sort((left, right) => right.createdAt - left.createdAt)[0];
		return {
			id: String(change._id),
			repositoryId: String(change.repositoryId),
			number: change.number,
			title: change.title,
			summary: change.summary,
			status: change.status,
			authorId: String(change.authorMembershipId),
			locationIds: change.locationIds.map(String),
			labelIds: change.labelIds.map(String),
			linkedIssueId: change.linkedIssueId
				? String(change.linkedIssueId)
				: undefined,
			targetRecordId: change.targetRecordId
				? String(change.targetRecordId)
				: undefined,
			createdAt: iso(change.createdAt),
			updatedAt: iso(change.updatedAt),
			revisions,
			reviews: workspace.reviews
				.filter((review) => review.changeRequestId === change._id)
				.map((review) => ({
					id: String(review._id),
					reviewerId: String(review.reviewerMembershipId),
					revisionId: String(review.revisionId),
					decision: review.decision,
					body: review.body,
					createdAt: iso(review.createdAt),
					stale: review.stale,
				})),
			checks: workspace.checks
				.filter((check) => check.changeRequestId === change._id)
				.map((check) => ({
					id: String(check._id),
					name: check.name,
					description: check.description,
					conclusion: check.conclusion,
					required: check.required,
					updatedAt: iso(check.updatedAt),
				})),
			comments: comments
				.filter(
					(comment) =>
						comment.targetType === "change" &&
						comment.targetId === String(change._id),
				)
				.map(mapComment),
			structuredDiff: workspace.findings
				.filter((finding) => finding.revisionId === change.headRevisionId)
				.map((finding) => ({
					id: String(finding._id),
					field: finding.field,
					before: finding.before,
					after: finding.after,
					provenance: finding.provenance,
					severity: finding.severity,
				})),
			textDiff: asTextDiff(documentDiff?.text),
			unresolvedThreads: change.unresolvedThreads,
			baseVersionId: change.baseVersionId
				? String(change.baseVersionId)
				: undefined,
			outOfDate: change.outOfDate,
			publicAfterMerge: change.publicAfterMerge,
			publicationJobId: publication ? String(publication._id) : undefined,
		};
	});
	return {
		organization: {
			id: String(workspace.organization._id),
			slug: workspace.organization.slug,
			name: workspace.organization.name,
			shortName: workspace.organization.slug.toUpperCase(),
			description:
				"Shared governance, compliance, funding, and public accountability records.",
		},
		viewerId: String(workspace.viewerMembershipId),
		members,
		teams: workspace.teams.map((team) => ({
			id: String(team._id),
			name: team.name,
			description: team.description,
		})),
		locations: workspace.locations.map((location) => ({
			id: String(location._id),
			name: location.name,
			shortName: location.name,
		})),
		labels: workspace.labels.map((label) => ({
			id: String(label._id),
			name: label.name,
			color: label.color,
			description: label.description,
			system: label.system,
			blocksMerge: label.blocksMerge,
		})),
		repositories,
		issues,
		changeRequests,
		records: workspace.records.map((record) => ({
			id: String(record._id),
			repositoryId: String(record.repositoryId),
			title: record.title,
			collection: record.collection,
			locationIds: record.locationIds.map(String),
			visibility: record.visibility,
			currentVersionId: record.currentVersionId
				? String(record.currentVersionId)
				: "",
			versions: workspace.recordVersions
				.filter((version) => version.recordId === record._id)
				.map((version) => ({
					id: String(version._id),
					version: version.version,
					changeRequestId: String(version.changeRequestId),
					createdAt: iso(version.createdAt),
					createdBy: String(version.createdBy),
					summary: version.summary,
					files:
						changeRequests
							.find((change) => change.id === String(version.changeRequestId))
							?.revisions.find(
								(revision) => revision.id === String(version.revisionId),
							)?.files ?? [],
					sha256: version.sha256,
					manifestSha256: version.manifestSha256,
					masterProvider: version.masterProvider,
					azureEvidenceRef: version.azureEvidenceRef,
					publicationManifestRef: version.publicationManifestRef,
					externalFileId: version.externalFileId,
					externalVersionId: version.externalVersionId,
					externalUrl: version.externalUrl,
					publishedAt: iso(version.publishedAt),
					legacyBaseline: version.legacyBaseline,
				})),
			updatedAt: iso(record.updatedAt),
		})),
		providerConnections: workspace.providerConnections.map((connection) => ({
			id: String(connection._id),
			organizationId: String(connection.organizationId),
			provider: connection.provider,
			displayName: connection.displayName,
			status: connection.status,
			externalDomain: connection.externalTenant,
			serviceIdentity: connection.serviceIdentity,
			keyVaultReference: connection.keyVaultReference,
			capabilities: connection.capabilities,
			lastVerifiedAt: connection.lastVerifiedAt
				? iso(connection.lastVerifiedAt)
				: undefined,
			healthMessage: connection.healthMessage,
			simulated: false,
		})),
		repositoryStorageConfigs: workspace.storageConfigs.map((config) => ({
			id: String(config._id),
			repositoryId: String(config.repositoryId),
			provider: config.provider,
			connectionId: config.connectionId
				? String(config.connectionId)
				: undefined,
			driveId: config.driveId,
			folderId: config.folderId,
			displayPath: config.displayPath,
			version: config.version,
			health: config.health,
			updatedAt: iso(config.updatedAt),
		})),
		publicationJobs: workspace.publicationJobs.map((job) => {
			const remote = job.remoteResult as
				| {
						externalFileId?: string;
						externalVersionId?: string;
						externalUrl?: string;
						sha256?: string;
				  }
				| undefined;
			return {
				id: String(job._id),
				organizationId: String(job.organizationId),
				repositoryId: String(job.repositoryId),
				changeRequestId: String(job.changeRequestId),
				revisionId: String(job.revisionId),
				storageConfigVersion: job.storageConfigVersion,
				provider: job.provider,
				idempotencyKey: job.idempotencyKey,
				status: job.status,
				attempts: job.attempts,
				error: job.errorMessage,
				remoteFileId: remote?.externalFileId,
				remoteVersionId: remote?.externalVersionId,
				remoteUrl: remote?.externalUrl,
				verifiedSha256: remote?.sha256,
				createdAt: iso(job.createdAt),
				updatedAt: iso(job.updatedAt),
			};
		}),
		baselineImports: workspace.baselineImports.map((item) => ({
			id: String(item._id),
			repositoryId: String(item.repositoryId),
			connectionId: String(item.connectionId),
			externalFileId: item.externalFileId,
			fileName: item.fileName,
			attestation: item.attestation,
			status: item.status,
			legacyBaseline: true,
			createdAt: iso(item.createdAt),
			updatedAt: iso(item.updatedAt),
		})),
		activity: workspace.activity.map(
			(event): ActivityEvent => ({
				id: String(event._id),
				actorId: event.actorUserId ? String(event.actorUserId) : undefined,
				action: event.action,
				target: event.targetId,
				detail: event.reason,
				createdAt: iso(event.createdAt),
				visibility: "internal",
			}),
		),
		notifications: workspace.notifications.map((notification) => ({
			id: String(notification._id),
			type: notification.type,
			title: notification.title,
			body: notification.body,
			repositoryId: String(notification.repositoryId),
			targetType: notification.targetType,
			targetId: notification.targetId,
			read: Boolean(notification.readAt),
			createdAt: iso(notification.createdAt),
		})),
	};
}

function issueArgs(input: NewIssueInput) {
	return {
		repositoryId: input.repositoryId as Id<"repositories">,
		title: input.title,
		description: input.description,
		template: input.template,
		assigneeIds: input.assigneeIds as Array<Id<"memberships">>,
		locationIds: input.locationIds as Array<Id<"locations">>,
		labelIds: input.labelIds as Array<Id<"labels">>,
		dueDate: input.dueDate ? Date.parse(input.dueDate) : undefined,
	};
}

function syntheticIssue(
	input: NewIssueInput,
	id: string,
	number: number,
	viewerId: string,
): Issue {
	const now = new Date().toISOString();
	return {
		id,
		number,
		repositoryId: input.repositoryId,
		title: input.title,
		description: input.description,
		template: input.template,
		state: "open",
		status: "todo",
		authorId: viewerId,
		assigneeIds: input.assigneeIds,
		locationIds: input.locationIds,
		labelIds: input.labelIds,
		dueDate: input.dueDate,
		createdAt: now,
		updatedAt: now,
		commentCount: 0,
		comments: [],
		linkedChangeIds: [],
		watcherIds: [viewerId],
	};
}

function syntheticRepository(
	input: NewRepositoryInput,
	id: string,
): Repository {
	return {
		id,
		slug: input.slug,
		name: input.name,
		description: input.description,
		prefix: input.prefix,
		kind: "custom",
		visibility: input.visibility,
		color: "#0f766e",
		icon: "folder",
		rules: {
			minimumApprovals: input.minimumApprovals,
			requiredTeamIds: [],
			dismissApprovalsOnRevision: true,
			prohibitSelfApproval: true,
			requireIssue: false,
			requireResolvedThreads: true,
			memberIssuesEnabled: input.visibility !== "restricted",
			memberCommentsEnabled:
				input.visibility === "members" || input.visibility === "public",
			publicIntegrityAnchoring: false,
			finalizerRoles: ["organization-owner", "organization-admin"],
		},
		issueCount: 0,
		changeCount: 0,
		recordCount: 0,
		updatedAt: new Date().toISOString(),
	};
}

function syntheticChange(
	input: NewChangeInput,
	id: string,
	number: number,
	viewerId: string,
): ChangeRequest {
	const now = new Date().toISOString();
	return {
		id,
		number,
		repositoryId: input.repositoryId,
		title: input.title,
		summary: input.summary,
		status: "open",
		authorId: viewerId,
		locationIds: input.locationIds,
		labelIds: input.labelIds,
		linkedIssueId: input.linkedIssueId,
		createdAt: now,
		updatedAt: now,
		revisions: [],
		reviews: [],
		checks: [],
		comments: [],
		structuredDiff: [],
		textDiff: [],
		unresolvedThreads: 0,
		outOfDate: false,
		publicAfterMerge: input.publicAfterMerge,
	};
}

async function uploadPrimaryDocument(
	repositoryId: string,
	changeRequestId: string,
	file: File,
	authorize: ReturnType<typeof useMutation<typeof api.uploads.authorize>>,
	requestUrl: ReturnType<typeof useAction<typeof api.uploads.requestUploadUrl>>,
	finalize: ReturnType<typeof useMutation<typeof api.uploads.finalize>>,
) {
	const bytes = await file.arrayBuffer();
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	const sha256 = [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	const session = await authorize({
		repositoryId: repositoryId as Id<"repositories">,
		changeRequestId: changeRequestId as Id<"changeRequests">,
		fileName: file.name,
		mimeType: file.type,
		size: file.size,
		role: "primary",
	});
	const upload = await requestUrl({
		uploadSessionId: session.uploadSessionId,
	});
	const response = await fetch(upload.url, {
		method: upload.method,
		headers: upload.headers,
		body: file,
	});
	if (!response.ok) {
		throw new Error(`Azure upload failed (${response.status}).`);
	}
	await finalize({
		uploadSessionId: session.uploadSessionId,
		sha256,
	});
}

function mapComment(comment: Workspace["comments"][number]) {
	return {
		id: String(comment._id),
		authorId: String(comment.authorMembershipId),
		body: comment.body,
		visibility: comment.visibility,
		createdAt: iso(comment.createdAt),
		editedAt: comment.editedAt ? iso(comment.editedAt) : undefined,
	};
}

function asTextDiff(value: unknown) {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item, index) => {
		if (!item || typeof item !== "object") return [];
		const candidate = item as { type?: unknown; content?: unknown };
		if (
			!["added", "removed", "unchanged"].includes(String(candidate.type)) ||
			typeof candidate.content !== "string"
		) {
			return [];
		}
		return [
			{
				id: `text-${index}`,
				type: candidate.type as "added" | "removed" | "unchanged",
				content: candidate.content,
			},
		];
	});
}

function toMemberRole(
	role: Workspace["memberUsers"][number]["membership"]["role"],
): MemberRole {
	switch (role) {
		case "administrator":
			return "organization-admin";
		case "owner":
			return "organization-owner";
		case "reviewer":
			return "reviewer";
		case "member":
			return "verified-member";
		default:
			return "maintainer";
	}
}

function titleForRole(
	role: Workspace["memberUsers"][number]["membership"]["role"],
) {
	switch (role) {
		case "administrator":
			return "Administrator";
		case "owner":
			return "President";
		case "board":
			return "Board member";
		case "secretary":
			return "Secretary";
		case "finance":
			return "Treasurer";
		case "reviewer":
			return "Independent reviewer";
		default:
			return "Verified member";
	}
}

function initials(name: string) {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase())
		.join("");
}

function iso(timestamp: number) {
	return new Date(timestamp).toISOString();
}

function formatBytes(bytes: number) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

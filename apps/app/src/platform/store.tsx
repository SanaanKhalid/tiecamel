import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { platformSeed } from "./seed";
import type {
	ChangeRequest,
	Issue,
	IssueComment,
	IssueStatus,
	PlatformData,
	Repository,
	RepositoryRules,
	RepositoryVisibility,
	ReviewDecision,
	StorageProvider,
} from "./types";

export type NewIssueInput = {
	repositoryId: string;
	title: string;
	description: string;
	template: Issue["template"];
	assigneeIds: string[];
	locationIds: string[];
	labelIds: string[];
	dueDate?: string;
};

export type NewChangeInput = {
	repositoryId: string;
	title: string;
	summary: string;
	linkedIssueId?: string;
	locationIds: string[];
	labelIds: string[];
	file?: File;
	publicAfterMerge: boolean;
};

export type NewRepositoryInput = {
	name: string;
	slug: string;
	prefix: string;
	description: string;
	visibility: RepositoryVisibility;
	minimumApprovals: number;
};

export type UpdateRepositoryInput = {
	name: string;
	description: string;
	visibility: RepositoryVisibility;
};

export type PlatformStore = PlatformData & {
	reset: () => void;
	switchViewer: (memberId: string) => void;
	createIssue: (input: NewIssueInput) => Promise<Issue>;
	createRepository: (input: NewRepositoryInput) => Promise<Repository>;
	updateRepository: (
		repositoryId: string,
		input: UpdateRepositoryInput,
	) => Promise<void>;
	moveIssue: (id: string, status: IssueStatus) => Promise<void>;
	addIssueComment: (
		id: string,
		body: string,
		visibility: IssueComment["visibility"],
	) => Promise<void>;
	createChangeRequest: (input: NewChangeInput) => Promise<ChangeRequest>;
	addChangeComment: (
		id: string,
		body: string,
		visibility: IssueComment["visibility"],
	) => Promise<void>;
	reviewChange: (
		id: string,
		decision: ReviewDecision,
		body: string,
	) => Promise<void>;
	mergeChange: (id: string) => Promise<void>;
	markNotificationRead: (id: string) => void;
	updateRepositoryRules: (
		repositoryId: string,
		rules: RepositoryRules,
	) => Promise<void>;
	configureRepositoryStorage: (
		repositoryId: string,
		provider: StorageProvider,
		options?: {
			connectionId?: string;
			driveId?: string;
			folderId?: string;
			displayPath?: string;
		},
	) => Promise<void>;
	verifyProviderConnection: (connectionId: string) => Promise<void>;
	requestBaselineImport: (input: {
		repositoryId: string;
		connectionId: string;
		externalFileId: string;
		fileName: string;
		attestation: string;
	}) => Promise<void>;
};

export const PlatformContext = createContext<PlatformStore | null>(null);
const DEMO_STORAGE_KEY = "tiecamel.demo-workspace.v4";
const DEMO_STORAGE_VERSION = 4;

export function PlatformProvider({ children }: { children: ReactNode }) {
	const [data, setData] = useState<PlatformData>(() =>
		structuredClone(platformSeed),
	);
	const [storageReady, setStorageReady] = useState(false);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(DEMO_STORAGE_KEY);
			if (stored) {
				const parsed = JSON.parse(stored) as {
					version?: number;
					data?: PlatformData;
				};
				if (
					parsed.version === DEMO_STORAGE_VERSION &&
					parsed.data?.organization &&
					Array.isArray(parsed.data.repositories) &&
					Array.isArray(parsed.data.members)
				) {
					setData({
						...parsed.data,
						organization: {
							...parsed.data.organization,
							name: platformSeed.organization.name,
						},
					});
				}
			}
		} catch {
			window.localStorage.removeItem(DEMO_STORAGE_KEY);
		} finally {
			setStorageReady(true);
		}
	}, []);

	useEffect(() => {
		if (!storageReady) return;
		window.localStorage.setItem(
			DEMO_STORAGE_KEY,
			JSON.stringify({ version: DEMO_STORAGE_VERSION, data }),
		);
	}, [data, storageReady]);

	const store = useMemo<PlatformStore>(
		() => ({
			...data,
			reset: () => {
				window.localStorage.removeItem(DEMO_STORAGE_KEY);
				setData(structuredClone(platformSeed));
			},
			switchViewer: (memberId) =>
				setData((current) => {
					if (!current.members.some((member) => member.id === memberId)) {
						throw new Error("Demo member not found");
					}
					return { ...current, viewerId: memberId };
				}),
			createIssue: async (input) => {
				const repository = requireRepository(data, input.repositoryId);
				const repositoryIssues = data.issues.filter(
					(issue) => issue.repositoryId === input.repositoryId,
				);
				const now = new Date().toISOString();
				const issue: Issue = {
					id: crypto.randomUUID(),
					repositoryId: input.repositoryId,
					number:
						Math.max(0, ...repositoryIssues.map((item) => item.number)) + 1,
					title: input.title.trim(),
					description: input.description.trim(),
					template: input.template,
					state: "open",
					status: "todo",
					authorId: data.viewerId,
					assigneeIds: input.assigneeIds,
					locationIds: input.locationIds,
					labelIds: input.labelIds,
					dueDate: input.dueDate || undefined,
					createdAt: now,
					updatedAt: now,
					commentCount: 0,
					comments: [],
					linkedChangeIds: [],
					watcherIds: [data.viewerId, ...input.assigneeIds],
				};
				setData((current) => ({
					...current,
					issues: [issue, ...current.issues],
					repositories: current.repositories.map((item) =>
						item.id === repository.id
							? {
									...item,
									issueCount: item.issueCount + 1,
									updatedAt: now,
								}
							: item,
					),
					activity: [
						{
							id: crypto.randomUUID(),
							repositoryId: repository.id,
							actorId: current.viewerId,
							action: "opened",
							target: `${repository.prefix}-${issue.number}`,
							detail: issue.title,
							createdAt: now,
							visibility:
								repository.visibility === "public" ? "public" : "internal",
						},
						...current.activity,
					],
				}));
				return issue;
			},
			createRepository: async (input) => {
				const slug = input.slug.trim().toLowerCase();
				const prefix = input.prefix.trim().toUpperCase();
				if (!input.name.trim()) throw new Error("Repository name is required");
				if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
					throw new Error(
						"Repository URL must use lowercase letters, numbers, and hyphens",
					);
				}
				if (!/^[A-Z0-9]{2,12}$/.test(prefix)) {
					throw new Error(
						"Issue prefix must be 2–12 uppercase letters or numbers",
					);
				}
				if (data.repositories.some((repository) => repository.slug === slug)) {
					throw new Error("A repository already uses that URL");
				}
				if (
					data.repositories.some((repository) => repository.prefix === prefix)
				) {
					throw new Error("A repository already uses that issue prefix");
				}

				const now = new Date().toISOString();
				const repository: Repository = {
					id: crypto.randomUUID(),
					slug,
					name: input.name.trim(),
					description: input.description.trim(),
					prefix,
					kind: "custom",
					visibility: input.visibility,
					color:
						["#0f766e", "#2563eb", "#7c3aed", "#b45309"][
							data.repositories.length % 4
						] ?? "#0f766e",
					icon: "folder",
					rules: {
						minimumApprovals: Math.max(1, Math.min(12, input.minimumApprovals)),
						requiredTeamIds: [],
						dismissApprovalsOnRevision: true,
						prohibitSelfApproval: true,
						requireIssue: true,
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
					updatedAt: now,
				};
				setData((current) => ({
					...current,
					repositories: [...current.repositories, repository],
					repositoryStorageConfigs: [
						...current.repositoryStorageConfigs,
						{
							id: crypto.randomUUID(),
							repositoryId: repository.id,
							provider: "azure",
							displayPath: "TieCamel managed records",
							version: 1,
							health: "healthy",
							updatedAt: now,
						},
					],
					activity: [
						{
							id: crypto.randomUUID(),
							repositoryId: repository.id,
							actorId: current.viewerId,
							action: "created repository",
							target: repository.name,
							detail: `${repository.visibility} visibility · ${repository.rules.minimumApprovals} approvals required.`,
							createdAt: now,
							visibility: "internal",
						},
						...current.activity,
					],
				}));
				return repository;
			},
			updateRepository: async (repositoryId, input) => {
				const repository = requireRepository(data, repositoryId);
				if (!input.name.trim()) throw new Error("Repository name is required");
				const now = new Date().toISOString();
				setData((current) => ({
					...current,
					repositories: current.repositories.map((candidate) =>
						candidate.id === repositoryId
							? {
									...candidate,
									name: input.name.trim(),
									description: input.description.trim(),
									visibility: input.visibility,
									updatedAt: now,
								}
							: candidate,
					),
					activity: [
						{
							id: crypto.randomUUID(),
							repositoryId,
							actorId: current.viewerId,
							action:
								repository.visibility === input.visibility
									? "updated repository settings for"
									: "changed visibility for",
							target: input.name.trim(),
							detail:
								repository.visibility === input.visibility
									? "Repository profile updated."
									: `${repository.visibility} → ${input.visibility}`,
							createdAt: now,
							visibility: "internal",
						},
						...current.activity,
					],
				}));
			},
			moveIssue: async (id, status) => {
				const target = data.issues.find((issue) => issue.id === id);
				if (!target) throw new Error("Issue not found");
				const now = new Date().toISOString();
				setData((current) => ({
					...current,
					issues: current.issues.map((issue) =>
						issue.id === id
							? {
									...issue,
									status,
									state: status === "done" ? "closed" : "open",
									updatedAt: now,
								}
							: issue,
					),
					activity: [
						{
							id: crypto.randomUUID(),
							repositoryId: target.repositoryId,
							actorId: current.viewerId,
							action: status === "done" ? "closed" : "moved",
							target: target.title,
							detail: `Status changed to ${issueStatusLabel(status)}.`,
							createdAt: now,
							visibility: "internal",
						},
						...current.activity,
					],
				}));
			},
			addIssueComment: async (id, body, visibility) => {
				const now = new Date().toISOString();
				const comment: IssueComment = {
					id: crypto.randomUUID(),
					authorId: data.viewerId,
					body: body.trim(),
					visibility,
					createdAt: now,
				};
				setData((current) => ({
					...current,
					issues: current.issues.map((issue) =>
						issue.id === id
							? {
									...issue,
									comments: [...issue.comments, comment],
									commentCount: issue.commentCount + 1,
									updatedAt: now,
								}
							: issue,
					),
				}));
			},
			createChangeRequest: async (input) => {
				const repository = requireRepository(data, input.repositoryId);
				const repositoryChanges = data.changeRequests.filter(
					(change) => change.repositoryId === input.repositoryId,
				);
				if (repository.rules.requireIssue && !input.linkedIssueId) {
					throw new Error("This repository requires a linked issue");
				}
				if (input.file && input.file.size > 50 * 1024 * 1024) {
					throw new Error("Files must be 50 MB or smaller");
				}
				const now = new Date().toISOString();
				const revisionId = crypto.randomUUID();
				const change: ChangeRequest = {
					id: crypto.randomUUID(),
					repositoryId: input.repositoryId,
					number:
						Math.max(0, ...repositoryChanges.map((item) => item.number)) + 1,
					title: input.title.trim(),
					summary: input.summary.trim(),
					status: "open",
					authorId: data.viewerId,
					locationIds: input.locationIds,
					labelIds: input.labelIds,
					linkedIssueId: input.linkedIssueId,
					createdAt: now,
					updatedAt: now,
					revisions: [
						{
							id: revisionId,
							number: 1,
							authorId: data.viewerId,
							createdAt: now,
							message: "Initial proposed revision.",
							files: input.file
								? [
										{
											id: crypto.randomUUID(),
											name: input.file.name,
											mimeType: input.file.type || "application/octet-stream",
											sizeLabel: formatFileSize(input.file.size),
											sha256: `local-${crypto.randomUUID().replaceAll("-", "")}…`,
											role: "primary",
											objectKey: `quarantine/${data.organization.id}/${input.repositoryId}/${revisionId}/${input.file.name}`,
											azureBlobRef: `azure://quarantine/${data.organization.id}/${input.repositoryId}/${revisionId}/${input.file.name}`,
											processingStatus: "ready",
										},
									]
								: [],
						},
					],
					reviews: [],
					checks: [
						{
							id: crypto.randomUUID(),
							name: "File safety",
							description: input.file
								? "Local demo validation passed. Production uses the quarantine pipeline."
								: "No document attached.",
							conclusion: input.file ? "passed" : "warning",
							required: true,
							updatedAt: now,
						},
						{
							id: crypto.randomUUID(),
							name: "Repository rules",
							description: `${repository.rules.minimumApprovals} independent approvals required.`,
							conclusion: "passed",
							required: true,
							updatedAt: now,
						},
					],
					comments: [],
					structuredDiff: [],
					textDiff: [],
					unresolvedThreads: 0,
					outOfDate: false,
					publicAfterMerge: input.publicAfterMerge,
				};
				setData((current) => ({
					...current,
					changeRequests: [change, ...current.changeRequests],
					issues: current.issues.map((issue) =>
						issue.id === input.linkedIssueId
							? {
									...issue,
									status: "in-review",
									linkedChangeIds: [...issue.linkedChangeIds, change.id],
									updatedAt: now,
								}
							: issue,
					),
					repositories: current.repositories.map((item) =>
						item.id === repository.id
							? {
									...item,
									changeCount: item.changeCount + 1,
									updatedAt: now,
								}
							: item,
					),
				}));
				return change;
			},
			addChangeComment: async (id, body, visibility) => {
				const now = new Date().toISOString();
				const comment: IssueComment = {
					id: crypto.randomUUID(),
					authorId: data.viewerId,
					body: body.trim(),
					visibility,
					createdAt: now,
				};
				setData((current) => ({
					...current,
					changeRequests: current.changeRequests.map((change) =>
						change.id === id
							? {
									...change,
									comments: [...change.comments, comment],
									updatedAt: now,
								}
							: change,
					),
				}));
			},
			reviewChange: async (id, decision, body) => {
				const change = data.changeRequests.find((item) => item.id === id);
				if (!change) throw new Error("Change request not found");
				if (change.authorId === data.viewerId && decision === "approve") {
					throw new Error("Authors cannot approve their own change request");
				}
				const revision = change.revisions.at(-1);
				if (!revision) throw new Error("This change request has no revision");
				const now = new Date().toISOString();
				setData((current) => {
					const nextChanges = current.changeRequests.map((item) => {
						if (item.id !== id) return item;
						const reviews = [
							...item.reviews.filter(
								(review) =>
									review.reviewerId !== current.viewerId ||
									review.revisionId !== revision.id,
							),
							{
								id: crypto.randomUUID(),
								reviewerId: current.viewerId,
								revisionId: revision.id,
								decision,
								body: body.trim(),
								createdAt: now,
								stale: false,
							},
						];
						const repository = requireRepository(current, item.repositoryId);
						const status =
							decision === "request-changes"
								? ("changes-requested" as const)
								: reviewRequirementsMet(item, reviews, repository, current)
									? ("approved" as const)
									: item.status === "changes-requested"
										? ("open" as const)
										: item.status;
						return { ...item, reviews, status, updatedAt: now };
					});
					return {
						...current,
						changeRequests: nextChanges,
						activity: [
							{
								id: crypto.randomUUID(),
								repositoryId: change.repositoryId,
								actorId: current.viewerId,
								action:
									decision === "approve"
										? "approved"
										: decision === "request-changes"
											? "requested changes on"
											: "reviewed",
								target: `Change request #${change.number}`,
								detail: body.trim() || "Review recorded.",
								createdAt: now,
								visibility: "internal",
							},
							...current.activity,
						],
					};
				});
			},
			mergeChange: async (id) => {
				const change = data.changeRequests.find((item) => item.id === id);
				if (!change) throw new Error("Change request not found");
				const repository = requireRepository(data, change.repositoryId);
				const viewer = data.members.find(
					(member) => member.id === data.viewerId,
				);
				if (!viewer) throw new Error("Active member not found");
				if (!repository.rules.finalizerRoles.includes(viewer.role)) {
					throw new Error("Your role cannot accept changes in this repository");
				}
				if (!reviewRequirementsMet(change, change.reviews, repository, data)) {
					throw new Error("Required independent approvals are still missing");
				}
				if (
					change.checks.some(
						(check) => check.required && check.conclusion === "failed",
					)
				) {
					throw new Error("A required check is failing");
				}
				if (change.unresolvedThreads > 0) {
					throw new Error("Resolve blocking review threads before accepting");
				}
				if (
					change.labelIds.some((labelId) =>
						data.labels.some(
							(label) => label.id === labelId && label.blocksMerge,
						),
					)
				) {
					throw new Error("A protected label is blocking this change");
				}
				if (change.outOfDate) {
					throw new Error(
						"Update this change against the current record first",
					);
				}
				const revision = change.revisions.at(-1);
				if (!revision) throw new Error("This change request has no revision");
				const primaryFiles = revision.files.filter(
					(file) => (file.role ?? "primary") === "primary",
				);
				if (primaryFiles.length > 1) {
					throw new Error(
						"A change request may publish exactly one primary document",
					);
				}
				const storageConfig = data.repositoryStorageConfigs.find(
					(config) => config.repositoryId === repository.id,
				);
				if (!storageConfig) {
					throw new Error("Repository storage is not configured");
				}
				if (storageConfig.health !== "healthy") {
					throw new Error(
						"The repository destination is unavailable. Restore its connection before publishing.",
					);
				}
				if (
					storageConfig.provider === "google-drive" &&
					!data.providerConnections.some(
						(connection) =>
							connection.id === storageConfig.connectionId &&
							connection.status === "healthy",
					)
				) {
					throw new Error("The Google Drive connection needs attention");
				}
				const now = new Date().toISOString();
				const publicationJobId = crypto.randomUUID();
				const idempotencyKey = `${change.id}:${revision.id}:${storageConfig.version}`;
				setData((current) => ({
					...current,
					publicationJobs: [
						{
							id: publicationJobId,
							organizationId: current.organization.id,
							repositoryId: repository.id,
							changeRequestId: change.id,
							revisionId: revision.id,
							storageConfigVersion: storageConfig.version,
							provider: storageConfig.provider,
							idempotencyKey,
							status: "running",
							attempts: 1,
							createdAt: now,
							updatedAt: now,
						},
						...current.publicationJobs,
					],
					changeRequests: current.changeRequests.map((item) =>
						item.id === id
							? { ...item, publicationJobId, updatedAt: now }
							: item,
					),
				}));
				await new Promise((resolve) => window.setTimeout(resolve, 250));
				const publishedAt = new Date().toISOString();
				setData((current) => {
					const existingRecord = change.targetRecordId
						? current.records.find(
								(record) => record.id === change.targetRecordId,
							)
						: undefined;
					const recordVersion = {
						id: crypto.randomUUID(),
						version: (existingRecord?.versions.length ?? 0) + 1,
						changeRequestId: change.id,
						createdAt: now,
						createdBy: current.viewerId,
						summary: change.summary,
						files: revision.files,
						sha256:
							revision.files[0]?.sha256 ??
							`record-${crypto.randomUUID().replaceAll("-", "")}…`,
						masterProvider: storageConfig.provider,
						azureEvidenceRef: `azure://evidence/${current.organization.id}/${repository.id}/${change.id}/${revision.id}`,
						publicationManifestRef: `azure://evidence/${current.organization.id}/${repository.id}/${change.id}/${revision.id}/publication-manifest.json`,
						externalFileId:
							storageConfig.provider === "google-drive"
								? (existingRecord?.versions.at(-1)?.externalFileId ??
									`gdrive-${crypto.randomUUID()}`)
								: undefined,
						externalVersionId:
							storageConfig.provider === "google-drive"
								? `gdrive-version-${crypto.randomUUID()}`
								: undefined,
						externalUrl:
							storageConfig.provider === "google-drive"
								? "https://drive.google.com/"
								: undefined,
						publishedAt,
					};
					const recordId = existingRecord?.id ?? crypto.randomUUID();
					const records = existingRecord
						? current.records.map((record) =>
								record.id === existingRecord.id
									? {
											...record,
											currentVersionId: recordVersion.id,
											versions: [...record.versions, recordVersion],
											updatedAt: now,
										}
									: record,
							)
						: [
								{
									id: recordId,
									repositoryId: change.repositoryId,
									title: change.title,
									collection: collectionForRepository(repository),
									locationIds: change.locationIds,
									visibility:
										change.publicAfterMerge &&
										repository.visibility === "public"
											? ("public" as const)
											: repository.visibility,
									currentVersionId: recordVersion.id,
									versions: [recordVersion],
									updatedAt: now,
								},
								...current.records,
							];
					return {
						...current,
						records,
						changeRequests: current.changeRequests.map((item) =>
							item.id === id
								? { ...item, status: "merged", updatedAt: now }
								: item,
						),
						publicationJobs: current.publicationJobs.map((job) =>
							job.id === publicationJobId
								? {
										...job,
										status: "succeeded",
										remoteFileId: recordVersion.externalFileId,
										remoteVersionId: recordVersion.externalVersionId,
										remoteUrl: recordVersion.externalUrl,
										verifiedSha256: recordVersion.sha256,
										updatedAt: publishedAt,
									}
								: job,
						),
						issues: current.issues.map((issue) =>
							issue.id === change.linkedIssueId
								? {
										...issue,
										state: "closed",
										status: "done",
										updatedAt: now,
									}
								: issue,
						),
						repositories: current.repositories.map((item) =>
							item.id === repository.id && !existingRecord
								? {
										...item,
										recordCount: item.recordCount + 1,
										updatedAt: now,
									}
								: item,
						),
						activity: [
							{
								id: crypto.randomUUID(),
								repositoryId: repository.id,
								actorId: current.viewerId,
								action: "approved and published",
								target: `Change request #${change.number}`,
								detail: `Created immutable record version ${recordVersion.version} in ${storageProviderLabel(storageConfig.provider)}.`,
								createdAt: now,
								visibility:
									change.publicAfterMerge && repository.visibility === "public"
										? "public"
										: "internal",
							},
							...current.activity,
						],
						notifications: [
							{
								id: crypto.randomUUID(),
								type: "merge",
								title: "Change accepted",
								body: `${change.title} is now the accepted record.`,
								repositoryId: repository.id,
								targetType: "record",
								targetId: recordId,
								read: false,
								createdAt: now,
							},
							...current.notifications,
						],
					};
				});
			},
			markNotificationRead: (id) =>
				setData((current) => ({
					...current,
					notifications: current.notifications.map((notification) =>
						notification.id === id
							? { ...notification, read: true }
							: notification,
					),
				})),
			updateRepositoryRules: async (repositoryId, rules) => {
				if (rules.minimumApprovals < 1 || rules.minimumApprovals > 12) {
					throw new Error("Required approvals must be between 1 and 12");
				}
				const now = new Date().toISOString();
				setData((current) => ({
					...current,
					repositories: current.repositories.map((repository) =>
						repository.id === repositoryId
							? { ...repository, rules, updatedAt: now }
							: repository,
					),
					activity: [
						{
							id: crypto.randomUUID(),
							repositoryId,
							actorId: current.viewerId,
							action: "updated protection rules for",
							target:
								current.repositories.find(
									(repository) => repository.id === repositoryId,
								)?.name ?? "Repository",
							detail: `${rules.minimumApprovals} approvals are now required.`,
							createdAt: now,
							visibility: "internal",
						},
						...current.activity,
					],
				}));
			},
			configureRepositoryStorage: async (
				repositoryId,
				provider,
				options = {},
			) => {
				requireRepository(data, repositoryId);
				if (provider === "one-drive") {
					throw new Error("OneDrive for Business is not enabled yet");
				}
				if (provider === "google-drive") {
					const connection = data.providerConnections.find(
						(item) =>
							item.id === options.connectionId &&
							item.provider === "google-drive",
					);
					if (!connection || connection.status !== "healthy") {
						throw new Error("Select a healthy Google Drive connection");
					}
					if (!options.driveId?.trim() || !options.folderId?.trim()) {
						throw new Error(
							"A verified Shared Drive and fixed folder are required",
						);
					}
				}
				const now = new Date().toISOString();
				setData((current) => {
					const previous = current.repositoryStorageConfigs.find(
						(config) => config.repositoryId === repositoryId,
					);
					const next = {
						id: previous?.id ?? crypto.randomUUID(),
						repositoryId,
						provider,
						connectionId:
							provider === "google-drive" ? options.connectionId : undefined,
						driveId:
							provider === "google-drive" ? options.driveId?.trim() : undefined,
						folderId:
							provider === "google-drive"
								? options.folderId?.trim()
								: undefined,
						displayPath:
							provider === "google-drive"
								? options.displayPath?.trim() || "Shared Drive / TieCamel"
								: "TieCamel managed records",
						version: (previous?.version ?? 0) + 1,
						health: "healthy" as const,
						updatedAt: now,
					};
					return {
						...current,
						repositoryStorageConfigs: [
							...current.repositoryStorageConfigs.filter(
								(config) => config.repositoryId !== repositoryId,
							),
							next,
						],
						activity: [
							{
								id: crypto.randomUUID(),
								repositoryId,
								actorId: current.viewerId,
								action: "configured accepted-record storage for",
								target:
									current.repositories.find((item) => item.id === repositoryId)
										?.name ?? "Repository",
								detail: `${storageProviderLabel(provider)} · ${next.displayPath}`,
								createdAt: now,
								visibility: "internal",
							},
							...current.activity,
						],
					};
				});
			},
			verifyProviderConnection: async (connectionId) => {
				if (
					!data.providerConnections.some(
						(connection) => connection.id === connectionId,
					)
				) {
					throw new Error("Provider connection not found");
				}
				const now = new Date().toISOString();
				setData((current) => ({
					...current,
					providerConnections: current.providerConnections.map((connection) =>
						connection.id === connectionId
							? {
									...connection,
									status: "healthy",
									lastVerifiedAt: now,
									healthMessage: connection.simulated
										? "Simulator verified. No external data leaves TieCamel."
										: "Connection verified.",
								}
							: connection,
					),
				}));
			},
			requestBaselineImport: async (input) => {
				requireRepository(data, input.repositoryId);
				const connection = data.providerConnections.find(
					(item) =>
						item.id === input.connectionId &&
						item.provider === "google-drive" &&
						item.status === "healthy",
				);
				if (!connection) {
					throw new Error("A healthy Google Drive connection is required");
				}
				if (input.attestation.trim().length < 20) {
					throw new Error(
						"Add an administrator attestation explaining the legacy baseline",
					);
				}
				const now = new Date().toISOString();
				setData((current) => ({
					...current,
					baselineImports: [
						{
							id: crypto.randomUUID(),
							repositoryId: input.repositoryId,
							connectionId: input.connectionId,
							externalFileId: input.externalFileId.trim(),
							fileName: input.fileName.trim(),
							attestation: input.attestation.trim(),
							status: "pending",
							legacyBaseline: true,
							createdAt: now,
							updatedAt: now,
						},
						...current.baselineImports,
					],
					activity: [
						{
							id: crypto.randomUUID(),
							repositoryId: input.repositoryId,
							actorId: current.viewerId,
							action: "requested legacy baseline import for",
							target: input.fileName.trim(),
							detail:
								"No historical approval is implied. The file will be scanned, hashed, and sealed in Azure.",
							createdAt: now,
							visibility: "internal",
						},
						...current.activity,
					],
				}));
			},
		}),
		[data],
	);

	return (
		<PlatformContext.Provider value={store}>
			{children}
		</PlatformContext.Provider>
	);
}

export function usePlatform() {
	const context = useContext(PlatformContext);
	if (!context) {
		throw new Error("usePlatform must be used within PlatformProvider");
	}
	return context;
}

export function reviewRequirementsMet(
	change: ChangeRequest,
	reviews: ChangeRequest["reviews"],
	repository: Repository,
	data: PlatformData,
) {
	const latestRevision = change.revisions.at(-1);
	if (!latestRevision) return false;
	const approvals = reviews.filter(
		(review) =>
			review.decision === "approve" &&
			!review.stale &&
			review.revisionId === latestRevision.id,
	);
	if (approvals.length < repository.rules.minimumApprovals) return false;
	return repository.rules.requiredTeamIds.every((teamId) =>
		approvals.some((approval) =>
			data.members
				.find((member) => member.id === approval.reviewerId)
				?.teamIds.includes(teamId),
		),
	);
}

function requireRepository(data: PlatformData, repositoryId: string) {
	const repository = data.repositories.find((item) => item.id === repositoryId);
	if (!repository) throw new Error("Repository not found");
	return repository;
}

function issueStatusLabel(status: IssueStatus) {
	return (
		{
			todo: "To do",
			"in-progress": "In progress",
			"in-review": "In review",
			done: "Done",
		} satisfies Record<IssueStatus, string>
	)[status];
}

function storageProviderLabel(provider: StorageProvider) {
	switch (provider) {
		case "google-drive":
			return "Google Drive";
		case "one-drive":
			return "OneDrive for Business";
		default:
			return "TieCamel storage on Azure";
	}
}

function formatFileSize(size: number) {
	if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
	return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function collectionForRepository(repository: Repository) {
	switch (repository.kind) {
		case "governance":
			return "Board resolutions";
		case "compliance":
			return "Compliance records";
		case "funding":
			return "Financial records";
		case "transparency":
			return "Publications";
		default:
			return "Records";
	}
}

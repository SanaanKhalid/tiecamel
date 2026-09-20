import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { canonicalJson, sha256Hex } from "./lib/canonical";
import {
	financialAccessForRole,
	financialRecordBelongsToOrganization,
	financialTransactionEventKind,
	hashFinancialSnapshot,
	prepareFinancialSnapshot,
} from "./lib/financial";
import { requirePlatformSession } from "./lib/platformAuth";

const sensitivityValidator = v.union(
	v.literal("ordinary"),
	v.literal("donation"),
	v.literal("payroll"),
	v.literal("beneficiary"),
	v.literal("legal"),
	v.literal("security"),
);
const treatmentValidator = v.union(
	v.literal("individual-redacted"),
	v.literal("period-aggregate"),
	v.literal("confidential-total"),
);

export const workspace = query({
	args: { demoSessionToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		if (!financialAccessForRole(session.membership.role).read) {
			throw new Error("Financial workspace access is required");
		}
		const organizationId = session.membership.organizationId;
		const [
			organization,
			connections,
			accounts,
			funds,
			transactions,
			periods,
			reconciliations,
			policies,
			settings,
			snapshots,
			imports,
		] = await Promise.all([
			ctx.db.get(organizationId),
			ctx.db
				.query("financialConnections")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialAccounts")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialFunds")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialTransactions")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialPeriods")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialReconciliations")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialDisclosurePolicies")
				.withIndex("by_organization_and_version", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialTransparencySettings")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.unique(),
			ctx.db
				.query("financialSnapshots")
				.withIndex("by_organization_and_time", (q) =>
					q.eq("organizationId", organizationId),
				)
				.order("desc")
				.collect(),
			ctx.db
				.query("financialImportRuns")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.order("desc")
				.take(20),
		]);
		const anchors = await Promise.all(
			snapshots.map((snapshot) =>
				snapshot.integrityAnchorId
					? ctx.db.get(snapshot.integrityAnchorId)
					: null,
			),
		);
		return {
			organization,
			connections,
			accounts,
			funds,
			transactions,
			periods,
			reconciliations,
			policy:
				policies.sort((left, right) => right.version - left.version)[0] ?? null,
			settings,
			snapshots: snapshots.map((snapshot, index) => ({
				...snapshot,
				anchor: anchors[index]
					? publicFinancialAnchor(anchors[index] as Doc<"integrityAnchors">)
					: null,
			})),
			imports,
			canManage: financialAccessForRole(session.membership.role).manage,
			canPublish: financialAccessForRole(session.membership.role).publish,
		};
	},
});

export const publicLatest = query({
	args: { organizationSlug: v.string() },
	handler: async (ctx, args) => {
		const snapshots = await ctx.db
			.query("financialSnapshots")
			.withIndex("by_public_slug", (q) =>
				q.eq("organizationSlug", args.organizationSlug),
			)
			.order("desc")
			.take(20);
		const latest = snapshots[0];
		if (!latest) return null;
		const anchor = latest.integrityAnchorId
			? await ctx.db.get(latest.integrityAnchorId)
			: null;
		return {
			id: latest._id,
			version: latest.version,
			sha256: latest.sha256,
			payload: latest.payload,
			publishedAt: latest.publishedAt,
			verification: anchor
				? publicFinancialAnchor(anchor)
				: { status: "local" as const },
			versions: snapshots.map((snapshot) => ({
				id: snapshot._id,
				version: snapshot.version,
				sha256: snapshot.sha256,
				publishedAt: snapshot.publishedAt,
			})),
		};
	},
});

export const ensureDemoSeeded = mutation({
	args: { demoSessionToken: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const session = await requirePlatformSession(ctx, args.demoSessionToken);
		const organization = await ctx.db.get(session.membership.organizationId);
		if (
			!organization ||
			!organization.demoOnly ||
			!("demoSessionId" in session)
		) {
			return { created: false };
		}
		const existing = await ctx.db
			.query("financialAccounts")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", session.membership.organizationId),
			)
			.first();
		if (existing) return { created: false };
		await seedDemoFinance(ctx, session.membership, organization);
		return { created: true };
	},
});

export const createAccount = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		name: v.string(),
		publicLabel: v.string(),
		kind: v.union(v.literal("bank"), v.literal("card"), v.literal("cash")),
		lastFour: v.optional(v.string()),
		included: v.boolean(),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		const name = args.name.trim();
		const publicLabel = args.publicLabel.trim();
		if (!name || !publicLabel)
			throw new Error("Account name and public label are required");
		if (args.lastFour && !/^\d{4}$/.test(args.lastFour)) {
			throw new Error("Last four must contain four digits");
		}
		const existing = await ctx.db
			.query("financialAccounts")
			.withIndex("by_organization_and_name", (q) =>
				q
					.eq("organizationId", session.membership.organizationId)
					.eq("name", name),
			)
			.unique();
		if (existing) throw new Error("An account with this name already exists");
		const now = Date.now();
		return ctx.db.insert("financialAccounts", {
			organizationId: session.membership.organizationId,
			name,
			publicLabel,
			kind: args.kind,
			source: args.kind === "cash" ? "demo" : "csv",
			currency: "USD",
			decimals: 2,
			included: args.included,
			lastFour: args.lastFour,
			health: "healthy",
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const setAccountIncluded = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		accountId: v.id("financialAccounts"),
		included: v.boolean(),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		const account = await owned(
			ctx,
			"financialAccounts",
			args.accountId,
			session.membership.organizationId,
		);
		await ctx.db.patch(account._id, {
			included: args.included,
			updatedAt: Date.now(),
		});
	},
});

export const importCsv = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		fileName: v.string(),
		fileSha256: v.string(),
		rows: v.array(
			v.object({
				row: v.number(),
				transactionId: v.string(),
				account: v.string(),
				postedAt: v.number(),
				direction: v.union(v.literal("inbound"), v.literal("outbound")),
				amount: v.string(),
				currency: v.union(v.literal("USD"), v.literal("USDC")),
				description: v.string(),
				category: v.string(),
				fund: v.string(),
				state: v.union(
					v.literal("pending"),
					v.literal("posted"),
					v.literal("removed"),
				),
			}),
		),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		if (!args.rows.length || args.rows.length > 500) {
			throw new Error("Import batches must contain 1–500 rows");
		}
		if (!/^[a-f0-9]{64}$/.test(args.fileSha256))
			throw new Error("Invalid file hash");
		const organizationId = session.membership.organizationId;
		const prior = await ctx.db
			.query("financialImportRuns")
			.withIndex("by_organization_and_hash", (q) =>
				q
					.eq("organizationId", organizationId)
					.eq("fileSha256", args.fileSha256),
			)
			.filter((q) => q.eq(q.field("status"), "succeeded"))
			.first();
		if (prior) {
			return {
				importId: prior._id,
				inserted: 0,
				updated: 0,
				duplicates: args.rows.length,
				errors: [],
			};
		}
		const now = Date.now();
		const importId = await ctx.db.insert("financialImportRuns", {
			organizationId,
			source: "csv",
			fileName: args.fileName.trim() || "financial-import.csv",
			fileSha256: args.fileSha256,
			status: "processing",
			inserted: 0,
			updated: 0,
			duplicates: 0,
			errors: [],
			createdBy: session.membership._id,
			createdAt: now,
			updatedAt: now,
		});
		const [accounts, funds] = await Promise.all([
			ctx.db
				.query("financialAccounts")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialFunds")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
		]);
		let inserted = 0;
		let updated = 0;
		let duplicates = 0;
		const errors: Array<{ row: number; message: string }> = [];
		const refreshedAccountIds = new Set<Id<"financialAccounts">>();
		for (const row of args.rows) {
			try {
				const account = accounts.find(
					(item) => item.name === row.account.trim(),
				);
				const fund = funds.find((item) => item.name === row.fund.trim());
				if (!account) throw new Error(`Unknown account: ${row.account}`);
				if (!fund) throw new Error(`Unknown fund: ${row.fund}`);
				if (account.currency !== row.currency)
					throw new Error("Transaction currency does not match the account");
				const amountBaseUnits = parseDecimal(row.amount, account.decimals);
				const next = {
					fundId: fund._id,
					postedAt: row.postedAt,
					direction: row.direction,
					amountBaseUnits,
					currency: row.currency,
					decimals: account.decimals,
					reportingAmountMinor:
						row.currency === "USD" ? amountBaseUnits : undefined,
					state: row.state,
					rawDescription: row.description.trim(),
					privateCounterparty: row.description.trim(),
					publicDescription: defaultPublicDescription(
						row.description,
						row.direction,
					),
					category: row.category.trim(),
					sensitivity: inferSensitivity(
						row.category,
						row.description,
						row.direction,
					),
				};
				const payloadSha256 = await sha256Hex(canonicalJson(next));
				const existing = await ctx.db
					.query("financialTransactions")
					.withIndex("by_account_and_external_id", (q) =>
						q
							.eq("accountId", account._id)
							.eq("externalId", row.transactionId.trim()),
					)
					.unique();
				if (existing) {
					const existingHash = await sha256Hex(
						canonicalJson(transactionComparable(existing)),
					);
					if (existingHash === payloadSha256) {
						duplicates += 1;
						refreshedAccountIds.add(account._id);
						continue;
					}
					const priorState = existing.state;
					await ctx.db.patch(existing._id, { ...next, updatedAt: now });
					await ctx.db.insert("financialTransactionEvents", {
						organizationId,
						transactionId: existing._id,
						importRunId: importId,
						kind: financialTransactionEventKind(priorState, row.state),
						payloadSha256,
						observedAt: now,
					});
					updated += 1;
					refreshedAccountIds.add(account._id);
					continue;
				}
				const transactionId = await ctx.db.insert("financialTransactions", {
					organizationId,
					accountId: account._id,
					externalId: row.transactionId.trim(),
					source: "csv",
					...next,
					createdAt: now,
					updatedAt: now,
				});
				await ctx.db.insert("financialTransactionEvents", {
					organizationId,
					transactionId,
					importRunId: importId,
					kind: financialTransactionEventKind(undefined, row.state),
					payloadSha256,
					observedAt: now,
				});
				inserted += 1;
				refreshedAccountIds.add(account._id);
			} catch (error) {
				errors.push({
					row: row.row,
					message: error instanceof Error ? error.message : "Invalid row",
				});
			}
		}
		await Promise.all(
			[...refreshedAccountIds].map((accountId) =>
				ctx.db.patch(accountId, {
					lastSuccessfulRefreshAt: Date.now(),
					health: "healthy",
					healthMessage: undefined,
					updatedAt: Date.now(),
				}),
			),
		);
		await ctx.db.patch(importId, {
			status: errors.length === args.rows.length ? "failed" : "succeeded",
			inserted,
			updated,
			duplicates,
			errors,
			updatedAt: Date.now(),
		});
		await audit(
			ctx,
			session,
			"Financial CSV imported",
			"financial-import",
			String(importId),
			`${inserted} inserted, ${updated} updated, ${duplicates} duplicates, ${errors.length} errors.`,
		);
		return { importId, inserted, updated, duplicates, errors };
	},
});

export const updateTransaction = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		transactionId: v.id("financialTransactions"),
		fundId: v.id("financialFunds"),
		category: v.string(),
		sensitivity: sensitivityValidator,
		reportingAmountMinor: v.number(),
		publicDescription: v.string(),
		publicCounterparty: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		const organizationId = session.membership.organizationId;
		const [transaction, fund] = await Promise.all([
			owned(ctx, "financialTransactions", args.transactionId, organizationId),
			owned(ctx, "financialFunds", args.fundId, organizationId),
		]);
		if (!args.category.trim() || !args.publicDescription.trim()) {
			throw new Error("Category and public description are required");
		}
		if (
			!Number.isSafeInteger(args.reportingAmountMinor) ||
			args.reportingAmountMinor < 0
		) {
			throw new Error(
				"Reporting amount must be a non-negative integer number of cents",
			);
		}
		const now = Date.now();
		const next = {
			fundId: fund._id,
			category: args.category.trim(),
			sensitivity: args.sensitivity,
			reportingAmountMinor: args.reportingAmountMinor,
			publicDescription: args.publicDescription.trim(),
			publicCounterparty: args.publicCounterparty?.trim() || undefined,
			state:
				transaction.state === "review-required"
					? ("posted" as const)
					: transaction.state,
			updatedAt: now,
		};
		await ctx.db.patch(transaction._id, next);
		await ctx.db.insert("financialTransactionEvents", {
			organizationId,
			transactionId: transaction._id,
			kind: "reviewed",
			payloadSha256: await sha256Hex(canonicalJson(next)),
			observedAt: now,
		});
	},
});

export const updatePolicy = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		treatments: v.object({
			ordinary: treatmentValidator,
			donation: treatmentValidator,
			payroll: treatmentValidator,
			beneficiary: treatmentValidator,
			legal: treatmentValidator,
			security: treatmentValidator,
		}),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		const policies = await ctx.db
			.query("financialDisclosurePolicies")
			.withIndex("by_organization_and_version", (q) =>
				q.eq("organizationId", session.membership.organizationId),
			)
			.collect();
		const version =
			Math.max(0, ...policies.map((policy) => policy.version)) + 1;
		const policyId = await ctx.db.insert("financialDisclosurePolicies", {
			organizationId: session.membership.organizationId,
			version,
			treatments: args.treatments,
			createdBy: session.membership._id,
			createdAt: Date.now(),
		});
		await audit(
			ctx,
			session,
			"Financial disclosure policy updated",
			"financial-policy",
			String(policyId),
			`Disclosure policy version ${version} was adopted.`,
		);
		return { policyId, version };
	},
});

export const createPeriod = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		label: v.string(),
		startAt: v.number(),
		endAt: v.number(),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		if (!args.label.trim() || args.startAt >= args.endAt) {
			throw new Error("A label and valid reporting range are required");
		}
		const now = Date.now();
		return ctx.db.insert("financialPeriods", {
			organizationId: session.membership.organizationId,
			period: args.label.trim(),
			startAt: args.startAt,
			endAt: args.endAt,
			status: "draft",
			metrics: [],
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const saveReconciliation = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		periodId: v.id("financialPeriods"),
		accountId: v.id("financialAccounts"),
		openingBalanceMinor: v.number(),
		closingBalanceMinor: v.number(),
		publicExplanation: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		const organizationId = session.membership.organizationId;
		const [period, account] = await Promise.all([
			owned(ctx, "financialPeriods", args.periodId, organizationId),
			owned(ctx, "financialAccounts", args.accountId, organizationId),
		]);
		if (period.startAt === undefined || period.endAt === undefined) {
			throw new Error("Reporting period dates are unavailable");
		}
		const periodStartAt = period.startAt;
		const periodEndAt = period.endAt;
		const transactions = await ctx.db
			.query("financialTransactions")
			.withIndex("by_account", (q) => q.eq("accountId", account._id))
			.collect();
		const flow = transactions
			.filter(
				(transaction) =>
					transaction.state === "posted" &&
					transaction.postedAt >= periodStartAt &&
					transaction.postedAt <= periodEndAt &&
					transaction.reportingAmountMinor !== undefined,
			)
			.reduce(
				(sum, transaction) =>
					sum +
					(transaction.direction === "inbound" ? 1 : -1) *
						(transaction.reportingAmountMinor ?? 0),
				0,
			);
		const calculatedClosingMinor = args.openingBalanceMinor + flow;
		const differenceMinor = args.closingBalanceMinor - calculatedClosingMinor;
		if (differenceMinor !== 0 && !args.publicExplanation?.trim()) {
			throw new Error(
				"A public explanation is required for a reconciliation difference",
			);
		}
		const existing = await ctx.db
			.query("financialReconciliations")
			.withIndex("by_period_and_account", (q) =>
				q.eq("periodId", period._id).eq("accountId", account._id),
			)
			.unique();
		const values = {
			openingBalanceMinor: args.openingBalanceMinor,
			closingBalanceMinor: args.closingBalanceMinor,
			calculatedClosingMinor,
			differenceMinor,
			status:
				differenceMinor === 0
					? ("reconciled" as const)
					: ("exception" as const),
			publicExplanation: args.publicExplanation?.trim() || undefined,
			updatedBy: session.membership._id,
			updatedAt: Date.now(),
		};
		if (existing) {
			await ctx.db.patch(existing._id, values);
			return existing._id;
		}
		return ctx.db.insert("financialReconciliations", {
			organizationId,
			periodId: period._id,
			accountId: account._id,
			...values,
			createdAt: Date.now(),
		});
	},
});

export const configureWallet = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		displayName: v.string(),
		publicLabel: v.string(),
		network: v.union(v.literal("devnet"), v.literal("mainnet-beta")),
		ownerAddress: v.string(),
		mintAddress: v.string(),
		included: v.boolean(),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		if (!args.displayName.trim() || !args.publicLabel.trim())
			throw new Error("Wallet labels are required");
		if (
			!isSolanaAddress(args.ownerAddress) ||
			!isSolanaAddress(args.mintAddress)
		) {
			throw new Error("Owner and mint must be valid Solana addresses");
		}
		const officialMint = officialUsdcMint(args.network);
		if (args.mintAddress !== officialMint) {
			throw new Error(
				`Only native Circle USDC is supported on ${args.network}`,
			);
		}
		const now = Date.now();
		const connectionId = await ctx.db.insert("financialConnections", {
			organizationId: session.membership.organizationId,
			source: "solana",
			displayName: args.displayName.trim(),
			status: "healthy",
			network: args.network,
			ownerAddress: args.ownerAddress,
			mintAddress: args.mintAddress,
			createdBy: session.membership._id,
			createdAt: now,
			updatedAt: now,
		});
		const accountId = await ctx.db.insert("financialAccounts", {
			organizationId: session.membership.organizationId,
			connectionId,
			name: args.displayName.trim(),
			publicLabel: args.publicLabel.trim(),
			kind: "wallet",
			source: "solana",
			currency: "USDC",
			decimals: 6,
			included: args.included,
			health: "healthy",
			createdAt: now,
			updatedAt: now,
		});
		return { connectionId, accountId };
	},
});

export const updateSettings = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		anchoringEnabled: v.boolean(),
		anchoringNetwork: v.union(v.literal("devnet"), v.literal("mainnet-beta")),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		const organizationId = session.membership.organizationId;
		const existing = await ctx.db
			.query("financialTransparencySettings")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.unique();
		const now = Date.now();
		const values = {
			anchoringEnabled: args.anchoringEnabled,
			anchoringNetwork: args.anchoringNetwork,
			updatedBy: session.membership._id,
			updatedAt: now,
		};
		if (existing) await ctx.db.patch(existing._id, values);
		else
			await ctx.db.insert("financialTransparencySettings", {
				organizationId,
				...values,
				createdAt: now,
			});
	},
});

export const publishPeriod = mutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		periodId: v.id("financialPeriods"),
		publicLimitation: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		const organizationId = session.membership.organizationId;
		const [
			organization,
			period,
			accounts,
			connections,
			funds,
			transactions,
			reconciliations,
			policies,
			settings,
			priorSnapshots,
		] = await Promise.all([
			ctx.db.get(organizationId),
			owned(ctx, "financialPeriods", args.periodId, organizationId),
			ctx.db
				.query("financialAccounts")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialConnections")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialFunds")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialTransactions")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialReconciliations")
				.withIndex("by_period", (q) => q.eq("periodId", args.periodId))
				.collect(),
			ctx.db
				.query("financialDisclosurePolicies")
				.withIndex("by_organization_and_version", (q) =>
					q.eq("organizationId", organizationId),
				)
				.collect(),
			ctx.db
				.query("financialTransparencySettings")
				.withIndex("by_organization", (q) =>
					q.eq("organizationId", organizationId),
				)
				.unique(),
			ctx.db
				.query("financialSnapshots")
				.withIndex("by_period", (q) => q.eq("periodId", args.periodId))
				.collect(),
		]);
		if (
			!organization ||
			period.startAt === undefined ||
			period.endAt === undefined
		)
			throw new Error("Financial reporting period is incomplete");
		const policy = policies.sort(
			(left, right) => right.version - left.version,
		)[0];
		if (!policy) throw new Error("A disclosure policy is required");
		const prior = [...priorSnapshots].sort(
			(left, right) => right.version - left.version,
		)[0];
		const sourceStateSha256 = await sha256Hex(
			canonicalJson({
				organizationId,
				period: {
					id: period._id,
					startAt: period.startAt,
					endAt: period.endAt,
					publicLimitation:
						args.publicLimitation?.trim() || period.publicLimitation,
				},
				accounts: orderedById(accounts),
				connections: orderedById(connections).map(
					({ ownerAddress: _ownerAddress, ...connection }) => connection,
				),
				funds: orderedById(funds),
				transactions: orderedById(transactions),
				reconciliations: orderedById(reconciliations),
				policy,
			}),
		);
		if (prior?.sourceStateSha256 === sourceStateSha256) {
			return { snapshotId: prior._id, sha256: prior.sha256, duplicate: true };
		}
		const publishedAt = Date.now();
		const connectionById = new Map(
			connections.map((connection) => [String(connection._id), connection]),
		);
		const prepared = prepareFinancialSnapshot({
			organization: {
				slug: organization.publicSlug ?? organization.slug,
				name: organization.name,
			},
			period: {
				id: String(period._id),
				label: period.period,
				startAt: period.startAt,
				endAt: period.endAt,
				publicLimitation: args.publicLimitation ?? period.publicLimitation,
			},
			accounts: accounts.map((account) => {
				const connection = account.connectionId
					? connectionById.get(String(account.connectionId))
					: undefined;
				return {
					id: String(account._id),
					publicLabel: account.publicLabel,
					kind: account.kind,
					source: account.source,
					included: account.included,
					lastSuccessfulSyncAt:
						connection?.lastSuccessfulSyncAt ?? account.lastSuccessfulRefreshAt,
				};
			}),
			funds: funds.map((fund) => ({
				id: String(fund._id),
				name: fund.name,
				restricted: fund.restricted,
			})),
			transactions: transactions.map((transaction) => ({
				id: String(transaction._id),
				accountId: String(transaction.accountId),
				fundId: String(transaction.fundId),
				postedAt: transaction.postedAt,
				direction: transaction.direction,
				reportingAmountMinor: transaction.reportingAmountMinor,
				state: transaction.state,
				publicDescription: transaction.publicDescription,
				publicCounterparty: transaction.publicCounterparty,
				category: transaction.category,
				sensitivity: transaction.sensitivity,
			})),
			reconciliations: reconciliations.map((item) => ({
				accountId: String(item.accountId),
				openingBalanceMinor: item.openingBalanceMinor,
				closingBalanceMinor: item.closingBalanceMinor,
				publicExplanation: item.publicExplanation,
			})),
			policy: { version: policy.version, treatments: policy.treatments },
			publishedAt,
			publishedBy: session.user.name,
			previousSnapshotSha256: prior?.sha256,
		});
		if (prepared.errors.length || !prepared.payload)
			throw new Error(prepared.errors.join(" "));
		const integrity = await hashFinancialSnapshot(prepared.payload);
		if (prior?.sha256 === integrity.sha256) {
			return { snapshotId: prior._id, sha256: prior.sha256, duplicate: true };
		}
		const snapshotId = await ctx.db.insert("financialSnapshots", {
			organizationId,
			organizationSlug: organization.publicSlug ?? organization.slug,
			periodId: period._id,
			version: (prior?.version ?? 0) + 1,
			payload: prepared.payload,
			canonicalJson: integrity.canonicalJson,
			sha256: integrity.sha256,
			sourceStateSha256,
			previousSnapshotId: prior?._id,
			previousSnapshotSha256: prior?.sha256,
			publishedBy: session.membership._id,
			publishedAt,
		});
		await ctx.db.patch(period._id, {
			status: "published",
			publicLimitation:
				args.publicLimitation?.trim() || period.publicLimitation,
			publishedSnapshotId: snapshotId,
			updatedAt: publishedAt,
		});
		await audit(
			ctx,
			session,
			prior ? "Financial snapshot corrected" : "Financial snapshot published",
			"financial-snapshot",
			String(snapshotId),
			`${period.period} financial snapshot ${integrity.sha256} was published.`,
		);
		if (settings?.anchoringEnabled) {
			await ctx.scheduler.runAfter(
				0,
				internal.integrity.queueForFinancialSnapshot,
				{
					financialSnapshotId: snapshotId,
					network: settings.anchoringNetwork,
				},
			);
		}
		return { snapshotId, sha256: integrity.sha256, duplicate: false };
	},
});

export const syncSolana = action({
	args: {
		demoSessionToken: v.optional(v.string()),
		connectionId: v.id("financialConnections"),
	},
	handler: async (
		ctx,
		args,
	): Promise<{ queued: boolean; syncRunId: Id<"financialSyncRuns"> }> => {
		const command = await ctx.runMutation(
			internal.finance.beginSolanaSync,
			args,
		);
		const baseUrl = process.env.AZURE_INTEGRATION_URL;
		const token = process.env.AZURE_INTEGRATION_TOKEN;
		if (!baseUrl || !token) {
			await ctx.runMutation(internal.finance.failSolanaSync, {
				syncRunId: command.syncRunId,
				error: "The Solana integration service is not configured.",
			});
			throw new Error("The Solana integration service is not configured");
		}
		try {
			const response = await fetch(
				`${baseUrl.replace(/\/$/, "")}/finance/solana/sync`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(command.request),
				},
			);
			if (!response.ok)
				throw new Error(`Solana sync failed (${response.status})`);
			const result = (await response.json()) as SolanaSyncResult;
			await ctx.runMutation(internal.finance.completeSolanaSync, {
				syncRunId: command.syncRunId,
				result,
			});
			return { queued: false, syncRunId: command.syncRunId };
		} catch (error) {
			await ctx.runMutation(internal.finance.failSolanaSync, {
				syncRunId: command.syncRunId,
				error: error instanceof Error ? error.message : "Solana sync failed",
			});
			throw error;
		}
	},
});

const solanaTransferValidator = v.object({
	externalId: v.string(),
	signature: v.string(),
	postedAt: v.number(),
	direction: v.union(v.literal("inbound"), v.literal("outbound")),
	amountBaseUnits: v.number(),
});

export const beginSolanaSync = internalMutation({
	args: {
		demoSessionToken: v.optional(v.string()),
		connectionId: v.id("financialConnections"),
	},
	handler: async (ctx, args) => {
		const session = await requireFinanceManager(ctx, args.demoSessionToken);
		const connection = await owned(
			ctx,
			"financialConnections",
			args.connectionId,
			session.membership.organizationId,
		);
		if (
			connection.source !== "solana" ||
			!connection.network ||
			!connection.ownerAddress ||
			!connection.mintAddress
		)
			throw new Error("Solana connection is incomplete");
		const startedAt = Date.now();
		const syncRunId = await ctx.db.insert("financialSyncRuns", {
			organizationId: session.membership.organizationId,
			connectionId: connection._id,
			status: "running",
			cursor: connection.cursor,
			inserted: 0,
			duplicates: 0,
			startedAt,
		});
		return {
			syncRunId,
			request: {
				network: connection.network,
				ownerAddress: connection.ownerAddress,
				mintAddress: connection.mintAddress,
				beforeSignature: connection.cursor,
			},
		};
	},
});

export const completeSolanaSync = internalMutation({
	args: {
		syncRunId: v.id("financialSyncRuns"),
		result: v.object({
			cursor: v.optional(v.string()),
			observedBalanceBaseUnits: v.number(),
			fetchedAt: v.number(),
			transfers: v.array(solanaTransferValidator),
			sourceHealth: v.object({
				status: v.union(v.literal("healthy"), v.literal("degraded")),
				message: v.optional(v.string()),
			}),
		}),
	},
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.syncRunId);
		if (!run || run.status !== "running") return;
		const connection = await ctx.db.get(run.connectionId);
		if (!connection) return;
		const accounts = await ctx.db
			.query("financialAccounts")
			.withIndex("by_connection", (q) => q.eq("connectionId", connection._id))
			.collect();
		const account = accounts[0];
		const funds = await ctx.db
			.query("financialFunds")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", run.organizationId),
			)
			.collect();
		const generalFund = funds.find((fund) => !fund.restricted) ?? funds[0];
		if (!account || !generalFund)
			throw new Error("Solana account needs a financial fund");
		let inserted = 0;
		let duplicates = 0;
		for (const transfer of args.result.transfers) {
			const existing = await ctx.db
				.query("financialTransactions")
				.withIndex("by_account_and_external_id", (q) =>
					q.eq("accountId", account._id).eq("externalId", transfer.externalId),
				)
				.unique();
			if (existing) {
				duplicates += 1;
				continue;
			}
			const now = Date.now();
			const transactionId = await ctx.db.insert("financialTransactions", {
				organizationId: run.organizationId,
				accountId: account._id,
				fundId: generalFund._id,
				externalId: transfer.externalId,
				source: "solana",
				postedAt: transfer.postedAt,
				direction: transfer.direction,
				amountBaseUnits: transfer.amountBaseUnits,
				currency: "USDC",
				decimals: 6,
				state: "review-required",
				rawDescription: `Solana USDC transfer ${transfer.signature}`,
				publicDescription:
					transfer.direction === "inbound"
						? "Anonymous USDC contribution"
						: "USDC expenditure",
				category:
					transfer.direction === "inbound" ? "Contributions" : "Uncategorized",
				sensitivity: transfer.direction === "inbound" ? "donation" : "ordinary",
				createdAt: now,
				updatedAt: now,
			});
			await ctx.db.insert("financialTransactionEvents", {
				organizationId: run.organizationId,
				transactionId,
				syncRunId: run._id,
				kind: "added",
				payloadSha256: await sha256Hex(canonicalJson(transfer)),
				observedAt: now,
			});
			inserted += 1;
		}
		await ctx.db.patch(run._id, {
			status: "succeeded",
			cursor: args.result.cursor,
			inserted,
			duplicates,
			completedAt: Date.now(),
		});
		await ctx.db.patch(connection._id, {
			status: args.result.sourceHealth.status,
			cursor: args.result.cursor,
			observedBalanceBaseUnits: args.result.observedBalanceBaseUnits,
			lastSuccessfulSyncAt: args.result.fetchedAt,
			healthMessage: args.result.sourceHealth.message,
			updatedAt: Date.now(),
		});
		await ctx.db.patch(account._id, {
			health: args.result.sourceHealth.status,
			healthMessage: args.result.sourceHealth.message,
			updatedAt: Date.now(),
		});
	},
});

export const failSolanaSync = internalMutation({
	args: { syncRunId: v.id("financialSyncRuns"), error: v.string() },
	handler: async (ctx, args) => {
		const run = await ctx.db.get(args.syncRunId);
		if (!run) return;
		await ctx.db.patch(run._id, {
			status: "failed",
			error: args.error,
			completedAt: Date.now(),
		});
		const connection = await ctx.db.get(run.connectionId);
		if (connection)
			await ctx.db.patch(connection._id, {
				status: "degraded",
				healthMessage: args.error,
				updatedAt: Date.now(),
			});
	},
});

type SolanaSyncResult = {
	cursor?: string;
	observedBalanceBaseUnits: number;
	fetchedAt: number;
	sourceHealth: { status: "healthy" | "degraded"; message?: string };
	transfers: Array<{
		externalId: string;
		signature: string;
		postedAt: number;
		direction: "inbound" | "outbound";
		amountBaseUnits: number;
	}>;
};

async function requireFinanceManager(
	ctx: QueryCtx | MutationCtx,
	demoSessionToken?: string,
) {
	const session = await requirePlatformSession(ctx, demoSessionToken);
	if (!financialAccessForRole(session.membership.role).manage)
		throw new Error("Finance management access is required");
	return session;
}

async function owned<
	Table extends
		| "financialAccounts"
		| "financialFunds"
		| "financialTransactions"
		| "financialPeriods"
		| "financialConnections",
>(
	ctx: QueryCtx | MutationCtx,
	_table: Table,
	id: Id<Table>,
	organizationId: Id<"organizations">,
) {
	const document = await ctx.db.get(id);
	if (
		!document ||
		!financialRecordBelongsToOrganization(
			String(document.organizationId),
			String(organizationId),
		)
	)
		throw new Error("Financial record not found");
	return document;
}

async function audit(
	ctx: MutationCtx,
	session: Awaited<ReturnType<typeof requirePlatformSession>>,
	actionName: string,
	targetType: string,
	targetId: string,
	reason: string,
) {
	await ctx.db.insert("auditEvents", {
		organizationId: session.membership.organizationId,
		actorUserId: session.user._id,
		action: actionName,
		targetType,
		targetId,
		reason,
		source: "Financial transparency",
		createdAt: Date.now(),
	});
}

function transactionComparable(transaction: Doc<"financialTransactions">) {
	return {
		fundId: transaction.fundId,
		postedAt: transaction.postedAt,
		direction: transaction.direction,
		amountBaseUnits: transaction.amountBaseUnits,
		currency: transaction.currency,
		decimals: transaction.decimals,
		reportingAmountMinor: transaction.reportingAmountMinor,
		state: transaction.state,
		rawDescription: transaction.rawDescription,
		privateCounterparty: transaction.privateCounterparty,
		publicDescription: transaction.publicDescription,
		category: transaction.category,
		sensitivity: transaction.sensitivity,
	};
}

function parseDecimal(value: string, decimals: number) {
	const normalized = value.trim().replace(/,/g, "");
	if (!/^\d+(\.\d+)?$/.test(normalized))
		throw new Error("Amount must be a non-negative decimal number");
	const [whole, fraction = ""] = normalized.split(".");
	if (fraction.length > decimals)
		throw new Error(`Amount supports at most ${decimals} decimal places`);
	const parsed = Number(`${whole}${fraction.padEnd(decimals, "0")}`);
	if (!Number.isSafeInteger(parsed)) throw new Error("Amount is too large");
	return parsed;
}

function inferSensitivity(
	category: string,
	description: string,
	direction: "inbound" | "outbound",
): Doc<"financialTransactions">["sensitivity"] {
	if (direction === "inbound") return "donation";
	const text = `${category} ${description}`.toLowerCase();
	if (/payroll|salary|wage/.test(text)) return "payroll";
	if (/aid|assistance|beneficiary|relief/.test(text)) return "beneficiary";
	if (/legal|counsel|attorney/.test(text)) return "legal";
	if (/security|alarm|camera/.test(text)) return "security";
	return "ordinary";
}

function defaultPublicDescription(
	_description: string,
	direction: "inbound" | "outbound",
) {
	return direction === "inbound" ? "Anonymous donation" : "Operating expense";
}

function isSolanaAddress(value: string) {
	return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function officialUsdcMint(network: "devnet" | "mainnet-beta") {
	return network === "mainnet-beta"
		? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
		: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
}

function publicFinancialAnchor(anchor: Doc<"integrityAnchors">) {
	return {
		status:
			anchor.status === "queued"
				? ("anchor-queued" as const)
				: anchor.status === "running"
					? ("anchor-running" as const)
					: anchor.status === "anchored"
						? ("anchored" as const)
						: ("anchor-failed" as const),
		network: anchor.network,
		signature: anchor.signature,
		explorerUrl: anchor.explorerUrl,
		error: anchor.errorMessage,
	};
}

async function seedDemoFinance(
	ctx: MutationCtx,
	membership: Doc<"memberships">,
	organization: Doc<"organizations">,
) {
	const organizationId = organization._id;
	const now = Date.now();
	const fundIds = new Map<string, Id<"financialFunds">>();
	for (const [name, restricted, description] of [
		["General fund", false, "Unrestricted operating support."],
		["Building fund", true, "Restricted capital and facility support."],
		[
			"Community assistance",
			true,
			"Restricted support for qualifying community needs.",
		],
	] as const) {
		fundIds.set(
			name,
			await ctx.db.insert("financialFunds", {
				organizationId,
				name,
				restricted,
				publicDescription: description,
				createdAt: now,
				updatedAt: now,
			}),
		);
	}
	const accountIds = new Map<string, Id<"financialAccounts">>();
	for (const account of [
		{
			name: "Operating checking ··1842",
			publicLabel: "Operating account",
			kind: "bank" as const,
			source: "csv" as const,
			currency: "USD" as const,
			decimals: 2,
			lastFour: "1842",
			lastSuccessfulRefreshAt: Date.parse("2026-06-30T18:00:00.000Z"),
		},
		{
			name: "Operations card ··4319",
			publicLabel: "Operations card",
			kind: "card" as const,
			source: "csv" as const,
			currency: "USD" as const,
			decimals: 2,
			lastFour: "4319",
			lastSuccessfulRefreshAt: Date.parse("2026-06-30T18:00:00.000Z"),
		},
		{
			name: "Friday collection cash",
			publicLabel: "Cash collections",
			kind: "cash" as const,
			source: "demo" as const,
			currency: "USD" as const,
			decimals: 2,
		},
	]) {
		accountIds.set(
			account.name,
			await ctx.db.insert("financialAccounts", {
				organizationId,
				...account,
				included: true,
				health: "healthy",
				createdAt: now,
				updatedAt: now,
			}),
		);
	}
	const connectionId = await ctx.db.insert("financialConnections", {
		organizationId,
		source: "solana",
		displayName: "Community USDC treasury",
		status: "healthy",
		network: "devnet",
		ownerAddress: "Demo111111111111111111111111111111111111111",
		mintAddress: "DemoUSDC11111111111111111111111111111111111",
		lastSuccessfulSyncAt: Date.parse("2026-06-30T18:05:00.000Z"),
		createdBy: membership._id,
		createdAt: now,
		updatedAt: now,
	});
	accountIds.set(
		"Community USDC treasury",
		await ctx.db.insert("financialAccounts", {
			organizationId,
			connectionId,
			name: "Community USDC treasury",
			publicLabel: "Community USDC treasury",
			kind: "wallet",
			source: "solana",
			currency: "USDC",
			decimals: 6,
			included: true,
			health: "healthy",
			simulated: true,
			createdAt: now,
			updatedAt: now,
		}),
	);
	const policyId = await ctx.db.insert("financialDisclosurePolicies", {
		organizationId,
		version: 1,
		treatments: {
			ordinary: "individual-redacted",
			donation: "individual-redacted",
			payroll: "period-aggregate",
			beneficiary: "confidential-total",
			legal: "confidential-total",
			security: "confidential-total",
		},
		createdBy: membership._id,
		createdAt: now,
	});
	await ctx.db.insert("financialTransparencySettings", {
		organizationId,
		anchoringEnabled: false,
		anchoringNetwork: "devnet",
		updatedBy: membership._id,
		createdAt: now,
		updatedAt: now,
	});
	const periodId = await ctx.db.insert("financialPeriods", {
		organizationId,
		period: "Q2 2026",
		startAt: Date.parse("2026-04-01T00:00:00.000Z"),
		endAt: Date.parse("2026-06-30T23:59:59.999Z"),
		status: "draft",
		metrics: [],
		createdAt: now,
		updatedAt: now,
	});
	await ctx.db.insert("financialPeriods", {
		organizationId,
		period: "Q3 2026",
		startAt: Date.parse("2026-07-01T00:00:00.000Z"),
		endAt: Date.parse("2026-09-30T23:59:59.999Z"),
		status: "draft",
		metrics: [],
		createdAt: now,
		updatedAt: now,
	});
	const seedTransactions = [
		[
			"donation-001",
			"Operating checking ··1842",
			"General fund",
			"2026-06-04",
			"inbound",
			250000,
			"Anonymous online donation",
			"Contributions",
			"donation",
			"Anonymous donation",
		],
		[
			"donation-002",
			"Operating checking ··1842",
			"Building fund",
			"2026-06-11",
			"inbound",
			420000,
			"Anonymous building campaign donation",
			"Contributions",
			"donation",
			"Anonymous building fund donation",
		],
		[
			"cash-001",
			"Friday collection cash",
			"General fund",
			"2026-06-12",
			"inbound",
			186400,
			"Friday collection dual-count sheet",
			"Cash contributions",
			"donation",
			"Anonymous cash collection",
		],
		[
			"utility-001",
			"Operating checking ··1842",
			"General fund",
			"2026-06-08",
			"outbound",
			214300,
			"Electric utility statement 8841",
			"Utilities",
			"ordinary",
			"Electric service",
		],
		[
			"supplies-001",
			"Operations card ··4319",
			"General fund",
			"2026-06-17",
			"outbound",
			68950,
			"Classroom and office supplies",
			"Program supplies",
			"ordinary",
			"Program and office supplies",
		],
		[
			"payroll-001",
			"Operating checking ··1842",
			"General fund",
			"2026-06-15",
			"outbound",
			840000,
			"June payroll private roster",
			"Payroll",
			"payroll",
			"Payroll",
		],
		[
			"aid-001",
			"Operating checking ··1842",
			"Community assistance",
			"2026-06-20",
			"outbound",
			125000,
			"Emergency assistance private recipient",
			"Direct assistance",
			"beneficiary",
			"Community assistance",
		],
		[
			"legal-001",
			"Operating checking ··1842",
			"General fund",
			"2026-06-23",
			"outbound",
			175000,
			"Counsel invoice privileged matter",
			"Professional services",
			"legal",
			"Legal services",
		],
	] as const;
	for (const [
		externalId,
		accountName,
		fundName,
		date,
		direction,
		amount,
		description,
		category,
		sensitivity,
		publicDescription,
	] of seedTransactions) {
		const accountId = requiredMapValue(accountIds, accountName);
		const fundId = requiredMapValue(fundIds, fundName);
		await ctx.db.insert("financialTransactions", {
			organizationId,
			accountId,
			fundId,
			externalId,
			source: "demo",
			postedAt: Date.parse(`${date}T12:00:00.000Z`),
			direction,
			amountBaseUnits: amount,
			currency: "USD",
			decimals: 2,
			reportingAmountMinor: amount,
			state: "posted",
			rawDescription: description,
			privateCounterparty: description,
			publicDescription,
			publicCounterparty:
				sensitivity === "ordinary" ? "Verified vendor" : undefined,
			category,
			sensitivity,
			createdAt: now,
			updatedAt: now,
		});
	}
	const usdcAccountId = requiredMapValue(accountIds, "Community USDC treasury");
	const buildingFundId = requiredMapValue(fundIds, "Building fund");
	await ctx.db.insert("financialTransactions", {
		organizationId,
		accountId: usdcAccountId,
		fundId: buildingFundId,
		externalId: "usdc-001",
		source: "solana",
		postedAt: Date.parse("2026-06-27T12:00:00.000Z"),
		direction: "inbound",
		amountBaseUnits: 500_000_000,
		currency: "USDC",
		decimals: 6,
		reportingAmountMinor: 50000,
		state: "posted",
		rawDescription: "Simulated public USDC contribution",
		publicDescription: "Anonymous USDC contribution",
		category: "Contributions",
		sensitivity: "donation",
		createdAt: now,
		updatedAt: now,
	});
	for (const [accountName, opening, closing] of [
		["Operating checking ··1842", 5000000, 4315700],
		["Operations card ··4319", 0, -68950],
		["Friday collection cash", 0, 186400],
		["Community USDC treasury", 0, 50000],
	] as const) {
		const accountId = requiredMapValue(accountIds, accountName);
		await ctx.db.insert("financialReconciliations", {
			organizationId,
			periodId,
			accountId,
			openingBalanceMinor: opening,
			closingBalanceMinor: closing,
			calculatedClosingMinor: closing,
			differenceMinor: 0,
			status: "reconciled",
			updatedBy: membership._id,
			createdAt: now,
			updatedAt: now,
		});
	}
	const accounts = await ctx.db
		.query("financialAccounts")
		.withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
		.collect();
	const funds = await ctx.db
		.query("financialFunds")
		.withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
		.collect();
	const transactions = await ctx.db
		.query("financialTransactions")
		.withIndex("by_organization", (q) => q.eq("organizationId", organizationId))
		.collect();
	const reconciliations = await ctx.db
		.query("financialReconciliations")
		.withIndex("by_period", (q) => q.eq("periodId", periodId))
		.collect();
	const prepared = prepareFinancialSnapshot({
		organization: {
			slug: organization.publicSlug ?? organization.slug,
			name: organization.name,
		},
		period: {
			id: String(periodId),
			label: "Q2 2026",
			startAt: Date.parse("2026-04-01T00:00:00.000Z"),
			endAt: Date.parse("2026-06-30T23:59:59.999Z"),
		},
		accounts: accounts.map((account) => ({
			id: String(account._id),
			publicLabel: account.publicLabel,
			kind: account.kind,
			source: account.source,
			included: account.included,
		})),
		funds: funds.map((fund) => ({
			id: String(fund._id),
			name: fund.name,
			restricted: fund.restricted,
		})),
		transactions: transactions.map((transaction) => ({
			id: String(transaction._id),
			accountId: String(transaction.accountId),
			fundId: String(transaction.fundId),
			postedAt: transaction.postedAt,
			direction: transaction.direction,
			reportingAmountMinor: transaction.reportingAmountMinor,
			state: transaction.state,
			publicDescription: transaction.publicDescription,
			publicCounterparty: transaction.publicCounterparty,
			category: transaction.category,
			sensitivity: transaction.sensitivity,
		})),
		reconciliations: reconciliations.map((item) => ({
			accountId: String(item.accountId),
			openingBalanceMinor: item.openingBalanceMinor,
			closingBalanceMinor: item.closingBalanceMinor,
		})),
		policy: {
			version: 1,
			treatments: {
				ordinary: "individual-redacted",
				donation: "individual-redacted",
				payroll: "period-aggregate",
				beneficiary: "confidential-total",
				legal: "confidential-total",
				security: "confidential-total",
			},
		},
		publishedAt: Date.parse("2026-07-15T16:00:00.000Z"),
		publishedBy: "Amina Razzak",
	});
	if (!prepared.payload) throw new Error(prepared.errors.join(" "));
	const hashed = await hashFinancialSnapshot(prepared.payload);
	const [connection, seededPolicy] = await Promise.all([
		ctx.db.get(connectionId),
		ctx.db.get(policyId),
	]);
	if (!connection || !seededPolicy)
		throw new Error("Demo finance seed is incomplete");
	const sourceStateSha256 = await sha256Hex(
		canonicalJson({
			organizationId,
			period: {
				id: periodId,
				startAt: Date.parse("2026-04-01T00:00:00.000Z"),
				endAt: Date.parse("2026-06-30T23:59:59.999Z"),
			},
			accounts: orderedById(accounts),
			connections: [
				{
					...connection,
					ownerAddress: undefined,
				},
			],
			funds: orderedById(funds),
			transactions: orderedById(transactions),
			reconciliations: orderedById(reconciliations),
			policy: seededPolicy,
		}),
	);
	const snapshotId = await ctx.db.insert("financialSnapshots", {
		organizationId,
		organizationSlug: organization.publicSlug ?? organization.slug,
		periodId,
		version: 1,
		payload: prepared.payload,
		canonicalJson: hashed.canonicalJson,
		sha256: hashed.sha256,
		sourceStateSha256,
		publishedBy: membership._id,
		publishedAt: Date.parse("2026-07-15T16:00:00.000Z"),
	});
	await ctx.db.patch(periodId, {
		status: "published",
		publishedSnapshotId: snapshotId,
		updatedAt: now,
	});
}

function orderedById<Document extends { _id: unknown }>(documents: Document[]) {
	return [...documents].sort((left, right) =>
		String(left._id).localeCompare(String(right._id)),
	);
}

function requiredMapValue<Key, Value>(map: Map<Key, Value>, key: Key) {
	const value = map.get(key);
	if (value === undefined)
		throw new Error(`Missing seeded financial value: ${String(key)}`);
	return value;
}

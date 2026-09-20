/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as baselineImports from "../baselineImports.js";
import type * as changes from "../changes.js";
import type * as commits from "../commits.js";
import type * as crons from "../crons.js";
import type * as delivery from "../delivery.js";
import type * as demoSessions from "../demoSessions.js";
import type * as drift from "../drift.js";
import type * as finance from "../finance.js";
import type * as governance from "../governance.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as inbound from "../inbound.js";
import type * as integrations from "../integrations.js";
import type * as integrity from "../integrity.js";
import type * as issues from "../issues.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_canonical from "../lib/canonical.js";
import type * as lib_financial from "../lib/financial.js";
import type * as lib_governanceValidators from "../lib/governanceValidators.js";
import type * as lib_notificationProviders from "../lib/notificationProviders.js";
import type * as lib_platformAuth from "../lib/platformAuth.js";
import type * as lib_testRecipients from "../lib/testRecipients.js";
import type * as notifications from "../notifications.js";
import type * as operationalTests from "../operationalTests.js";
import type * as organizations from "../organizations.js";
import type * as platform from "../platform.js";
import type * as publicRepositories from "../publicRepositories.js";
import type * as publications from "../publications.js";
import type * as readiness from "../readiness.js";
import type * as repositories from "../repositories.js";
import type * as uploads from "../uploads.js";
import type * as verification from "../verification.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  baselineImports: typeof baselineImports;
  changes: typeof changes;
  commits: typeof commits;
  crons: typeof crons;
  delivery: typeof delivery;
  demoSessions: typeof demoSessions;
  drift: typeof drift;
  finance: typeof finance;
  governance: typeof governance;
  health: typeof health;
  http: typeof http;
  inbound: typeof inbound;
  integrations: typeof integrations;
  integrity: typeof integrity;
  issues: typeof issues;
  "lib/authz": typeof lib_authz;
  "lib/canonical": typeof lib_canonical;
  "lib/financial": typeof lib_financial;
  "lib/governanceValidators": typeof lib_governanceValidators;
  "lib/notificationProviders": typeof lib_notificationProviders;
  "lib/platformAuth": typeof lib_platformAuth;
  "lib/testRecipients": typeof lib_testRecipients;
  notifications: typeof notifications;
  operationalTests: typeof operationalTests;
  organizations: typeof organizations;
  platform: typeof platform;
  publicRepositories: typeof publicRepositories;
  publications: typeof publications;
  readiness: typeof readiness;
  repositories: typeof repositories;
  uploads: typeof uploads;
  verification: typeof verification;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};

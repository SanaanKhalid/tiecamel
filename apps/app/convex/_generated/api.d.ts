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
import type * as demoSessions from "../demoSessions.js";
import type * as drift from "../drift.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as integrity from "../integrity.js";
import type * as issues from "../issues.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_canonical from "../lib/canonical.js";
import type * as lib_platformAuth from "../lib/platformAuth.js";
import type * as notifications from "../notifications.js";
import type * as platform from "../platform.js";
import type * as publicRepositories from "../publicRepositories.js";
import type * as publications from "../publications.js";
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
  demoSessions: typeof demoSessions;
  drift: typeof drift;
  http: typeof http;
  integrations: typeof integrations;
  integrity: typeof integrity;
  issues: typeof issues;
  "lib/authz": typeof lib_authz;
  "lib/canonical": typeof lib_canonical;
  "lib/platformAuth": typeof lib_platformAuth;
  notifications: typeof notifications;
  platform: typeof platform;
  publicRepositories: typeof publicRepositories;
  publications: typeof publications;
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

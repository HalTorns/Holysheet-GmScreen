/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as auth from "../auth.js";
import type * as authOptions from "../authOptions.js";
import type * as capabilities from "../capabilities.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_environment from "../lib/environment.js";
import type * as lib_modules from "../lib/modules.js";
import type * as lib_organizationValidators from "../lib/organizationValidators.js";
import type * as lib_organizations from "../lib/organizations.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_resources from "../lib/resources.js";
import type * as lib_validators from "../lib/validators.js";
import type * as organizations from "../organizations.js";
import type * as resources from "../resources.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  authOptions: typeof authOptions;
  capabilities: typeof capabilities;
  cleanup: typeof cleanup;
  crons: typeof crons;
  emails: typeof emails;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/environment": typeof lib_environment;
  "lib/modules": typeof lib_modules;
  "lib/organizationValidators": typeof lib_organizationValidators;
  "lib/organizations": typeof lib_organizations;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/resources": typeof lib_resources;
  "lib/validators": typeof lib_validators;
  organizations: typeof organizations;
  resources: typeof resources;
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

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};

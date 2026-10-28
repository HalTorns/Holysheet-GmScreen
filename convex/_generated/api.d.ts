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
import type * as authSecurity from "../authSecurity.js";
import type * as capabilities from "../capabilities.js";
import type * as cleanup from "../cleanup.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as gm from "../gm.js";
import type * as gmEditor from "../gmEditor.js";
import type * as gmSheets from "../gmSheets.js";
import type * as gmWidgets from "../gmWidgets.js";
import type * as http from "../http.js";
import type * as identityConfirmation from "../identityConfirmation.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authHooks from "../lib/authHooks.js";
import type * as lib_authModules from "../lib/authModules.js";
import type * as lib_emailEnvironment from "../lib/emailEnvironment.js";
import type * as lib_environment from "../lib/environment.js";
import type * as lib_gmAccess from "../lib/gmAccess.js";
import type * as lib_gmEditing from "../lib/gmEditing.js";
import type * as lib_gmValidators from "../lib/gmValidators.js";
import type * as lib_modules from "../lib/modules.js";
import type * as lib_organizationValidators from "../lib/organizationValidators.js";
import type * as lib_organizations from "../lib/organizations.js";
import type * as lib_pendingSignIn from "../lib/pendingSignIn.js";
import type * as lib_profilePolicy from "../lib/profilePolicy.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_resources from "../lib/resources.js";
import type * as lib_sessionAccess from "../lib/sessionAccess.js";
import type * as lib_siteAdmin from "../lib/siteAdmin.js";
import type * as lib_userAdminValidators from "../lib/userAdminValidators.js";
import type * as lib_validators from "../lib/validators.js";
import type * as organizations from "../organizations.js";
import type * as profileNames from "../profileNames.js";
import type * as resources from "../resources.js";
import type * as smtp from "../smtp.js";
import type * as userAdmin from "../userAdmin.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  authOptions: typeof authOptions;
  authSecurity: typeof authSecurity;
  capabilities: typeof capabilities;
  cleanup: typeof cleanup;
  crons: typeof crons;
  emails: typeof emails;
  gm: typeof gm;
  gmEditor: typeof gmEditor;
  gmSheets: typeof gmSheets;
  gmWidgets: typeof gmWidgets;
  http: typeof http;
  identityConfirmation: typeof identityConfirmation;
  "lib/auth": typeof lib_auth;
  "lib/authHooks": typeof lib_authHooks;
  "lib/authModules": typeof lib_authModules;
  "lib/emailEnvironment": typeof lib_emailEnvironment;
  "lib/environment": typeof lib_environment;
  "lib/gmAccess": typeof lib_gmAccess;
  "lib/gmEditing": typeof lib_gmEditing;
  "lib/gmValidators": typeof lib_gmValidators;
  "lib/modules": typeof lib_modules;
  "lib/organizationValidators": typeof lib_organizationValidators;
  "lib/organizations": typeof lib_organizations;
  "lib/pendingSignIn": typeof lib_pendingSignIn;
  "lib/profilePolicy": typeof lib_profilePolicy;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/resources": typeof lib_resources;
  "lib/sessionAccess": typeof lib_sessionAccess;
  "lib/siteAdmin": typeof lib_siteAdmin;
  "lib/userAdminValidators": typeof lib_userAdminValidators;
  "lib/validators": typeof lib_validators;
  organizations: typeof organizations;
  profileNames: typeof profileNames;
  resources: typeof resources;
  smtp: typeof smtp;
  userAdmin: typeof userAdmin;
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

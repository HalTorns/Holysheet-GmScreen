/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as adapter from "../adapter.js";
import type * as auth from "../auth.js";
import type * as generatedSchema from "../generatedSchema.js";
import type * as identityConfirmation from "../identityConfirmation.js";
import type * as lifecycle from "../lifecycle.js";
import type * as organizationAccess from "../organizationAccess.js";
import type * as organizations from "../organizations.js";
import type * as profiles from "../profiles.js";
import type * as userAdministration from "../userAdministration.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  access: typeof access;
  adapter: typeof adapter;
  auth: typeof auth;
  generatedSchema: typeof generatedSchema;
  identityConfirmation: typeof identityConfirmation;
  lifecycle: typeof lifecycle;
  organizationAccess: typeof organizationAccess;
  organizations: typeof organizations;
  profiles: typeof profiles;
  userAdministration: typeof userAdministration;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};

import { createClient, type GenericCtx } from '@convex-dev/better-auth'
import { betterAuth } from 'better-auth/minimal'
import { componentsGeneric, type GenericDataModel } from 'convex/server'
import { buildAuthOptions, SCHEMA_AUTH_SETTINGS } from '../authOptions'

const context = {} as GenericCtx<GenericDataModel>
const component = componentsGeneric().betterAuth as unknown as Parameters<
  typeof createClient
>[0]
const database = createClient(component).adapter(context)

// This static instance is exclusively consumed by the Better Auth schema CLI.
export const auth = betterAuth(
  buildAuthOptions(database, SCHEMA_AUTH_SETTINGS, () =>
    Promise.reject(new Error('The schema generator cannot send email.')),
  ),
)

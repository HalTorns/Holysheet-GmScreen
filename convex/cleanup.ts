import { v } from 'convex/values'

import { gmTables } from '../shared/gm'
import { components, internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { internalMutation } from './_generated/server'
import { clearUserRateLimits } from './lib/rateLimits'

const BATCH_SIZE = 100
// Notes and revisions can each hold 50,000 characters. Bound their joint read.
const GM_BATCH_SIZE = 20
// Un contenu de fiche peut atteindre environ 400 ko : lot réduit pour que
// la somme des tables GM d'une transaction reste sous environ 8 Mo.
const GM_SHEET_CONTENT_BATCH_SIZE = 5
function gmBatchSize(table: (typeof gmTables)[number]) {
  return table === 'gmSheetContents'
    ? GM_SHEET_CONTENT_BATCH_SIZE
    : GM_BATCH_SIZE
}
const SECURITY_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const CLEANUP_RETRY_MS = 5 * 60 * 1000
const RESUME_BATCH_SIZE = 20

type CleanupTarget =
  | { kind: 'account'; userId: string; email: string }
  | { kind: 'organization'; organizationId: string }

async function enqueueCleanup(ctx: MutationCtx, target: CleanupTarget) {
  const jobId = await ctx.db.insert('cleanupJobs', {
    ...target,
    retryAt: Date.now() + CLEANUP_RETRY_MS,
  })
  await ctx.scheduler.runAfter(0, internal.cleanup.processCleanup, { jobId })
  return null
}

export const processCleanup = internalMutation({
  args: { jobId: v.id('cleanupJobs') },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get('cleanupJobs', jobId)
    if (!job) return null
    const remaining =
      job.kind === 'account'
        ? await cleanDeletedAccount(ctx, job)
        : await cleanDeletedOrganization(ctx, job)
    if (!remaining) {
      await ctx.db.delete('cleanupJobs', jobId)
      return null
    }
    await ctx.db.patch('cleanupJobs', jobId, {
      retryAt: Date.now() + CLEANUP_RETRY_MS,
    })
    await ctx.scheduler.runAfter(0, internal.cleanup.processCleanup, { jobId })
    return null
  },
})

export const resumePending = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const jobs = await ctx.db
      .query('cleanupJobs')
      .withIndex('by_retry_at', (index) => index.lte('retryAt', Date.now()))
      .take(RESUME_BATCH_SIZE)
    for (const job of jobs) {
      await ctx.db.patch('cleanupJobs', job._id, {
        retryAt: Date.now() + CLEANUP_RETRY_MS,
      })
      await ctx.scheduler.runAfter(0, internal.cleanup.processCleanup, {
        jobId: job._id,
      })
    }
    return null
  },
})

export const deletedAccount = internalMutation({
  args: { userId: v.string(), email: v.string() },
  returns: v.null(),
  // Keep these entry points compatible with jobs scheduled before this version.
  handler: (ctx, target) => enqueueCleanup(ctx, { kind: 'account', ...target }),
})

async function cleanDeletedAccount(
  ctx: MutationCtx,
  { userId, email }: Extract<Doc<'cleanupJobs'>, { kind: 'account' }>
) {
  await clearUserRateLimits(ctx, userId)
  let gmDataRemain = false
  for (const table of gmTables) {
    const documents = await ctx.db
      .query(table)
      .withIndex('by_owner', (q) => q.eq('ownerId', userId))
      .take(gmBatchSize(table))
    for (const document of documents) await ctx.db.delete(table, document._id)
    gmDataRemain ||= documents.length === gmBatchSize(table)
  }
  const resources = await ctx.db
    .query('resources')
    .withIndex('by_owner', (index) => index.eq('ownerId', userId))
    .take(BATCH_SIZE)
  const events = await ctx.db
    .query('securityEvents')
    .withIndex('by_actor', (index) => index.eq('actorId', userId))
    .take(BATCH_SIZE)
  for (const resource of resources) {
    if (resource.organizationId === undefined) {
      await ctx.db.delete('resources', resource._id)
    } else {
      await ctx.db.patch('resources', resource._id, {
        ownerId: 'deleted-user',
      })
    }
  }
  for (const event of events) await ctx.db.delete('securityEvents', event._id)
  const credentialsRemain = await ctx.runMutation(
    components.betterAuth.lifecycle.cleanupUserCredentials,
    { userId }
  )
  const invitationsRemain = await ctx.runMutation(
    components.betterAuth.organizations.cleanupUserInvitations,
    { userId, email }
  )
  return (
    resources.length === BATCH_SIZE ||
    gmDataRemain ||
    events.length === BATCH_SIZE ||
    credentialsRemain ||
    invitationsRemain
  )
}

export const expiredData = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - SECURITY_EVENT_RETENTION_MS
    const events = await ctx.db
      .query('securityEvents')
      .withIndex('by_creation_time', (index) =>
        index.lt('_creationTime', cutoff)
      )
      .take(BATCH_SIZE)
    for (const event of events) await ctx.db.delete('securityEvents', event._id)
    const authDataRemain = await ctx.runMutation(
      components.betterAuth.lifecycle.cleanupExpired,
      {}
    )
    const invitationsRemain = await ctx.runMutation(
      components.betterAuth.organizations.cleanupExpiredInvitations,
      {}
    )
    if (events.length === BATCH_SIZE || authDataRemain || invitationsRemain)
      await ctx.scheduler.runAfter(0, internal.cleanup.expiredData, {})
    return null
  },
})

export const deletedOrganization = internalMutation({
  args: { organizationId: v.string() },
  returns: v.null(),
  handler: (ctx, target) =>
    enqueueCleanup(ctx, { kind: 'organization', ...target }),
})

async function cleanDeletedOrganization(
  ctx: MutationCtx,
  { organizationId }: Extract<Doc<'cleanupJobs'>, { kind: 'organization' }>
) {
  const resources = await ctx.db
    .query('resources')
    .withIndex('by_organization', (q) => q.eq('organizationId', organizationId))
    .take(BATCH_SIZE)
  const events = await ctx.db
    .query('securityEvents')
    .withIndex('by_organization', (q) => q.eq('organizationId', organizationId))
    .take(BATCH_SIZE)
  for (const resource of resources)
    await ctx.db.delete('resources', resource._id)
  for (const event of events) await ctx.db.delete('securityEvents', event._id)
  const metadataRemain = await ctx.runMutation(
    components.betterAuth.organizations.cleanupOrganization,
    { organizationId }
  )
  return (
    resources.length === BATCH_SIZE ||
    events.length === BATCH_SIZE ||
    metadataRemain
  )
}

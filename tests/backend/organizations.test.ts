import { afterEach, expect, test, vi } from 'vitest'
import { z } from 'zod'

import { api, components } from '../../convex/_generated/api'
import {
  confirmOperation,
  createAuthenticatedUser,
  createBackendTest,
  insertLegacyOrganization,
  insertLegacyResource,
} from './fixtures'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
const paginationOpts = { numItems: 10, cursor: null }

async function fixture() {
  vi.stubEnv('ORGANIZATIONS_ENABLED', 'true')
  const backend = createBackendTest()
  const owner = await createAuthenticatedUser(backend, 'owner@example.test')
  const member = await createAuthenticatedUser(backend, 'member@example.test')
  const organizationId = await insertLegacyOrganization(
    backend,
    owner.userId,
    'Legacy'
  )
  await backend.mutation(components.betterAuth.adapter.create, {
    input: {
      model: 'member',
      data: {
        organizationId,
        userId: member.userId,
        role: 'member',
        createdAt: Date.now(),
      },
    },
  })
  return { backend, owner, member, organizationId }
}

test('creation and invitations are refused at public and component entries even with the module enabled', async () => {
  const { backend, owner, organizationId } = await fixture()
  await expect(
    owner.client.mutation(api.organizations.create, { name: 'New' })
  ).rejects.toThrow('SURFACE_REMOVED')
  await expect(
    owner.client.mutation(api.organizations.invite, {
      organizationId,
      email: 'new@example.test',
      role: 'member',
    })
  ).rejects.toThrow('SURFACE_REMOVED')
  await expect(
    backend.mutation(components.betterAuth.organizations.create, {
      actorId: owner.userId,
      name: 'New',
    })
  ).rejects.toThrow('SURFACE_REMOVED')
  await expect(
    backend.mutation(components.betterAuth.organizations.invite, {
      actorId: owner.userId,
      organizationId,
      email: 'new@example.test',
      role: 'member',
    })
  ).rejects.toThrow('SURFACE_REMOVED')
  expect(await backend.query(api.capabilities.get, {})).not.toHaveProperty(
    'organizations'
  )
})

test('legacy shared export remains authorized, isolated from personal export and deletable by the owner', async () => {
  vi.useFakeTimers()
  const { backend, owner, member, organizationId } = await fixture()
  await insertLegacyResource(backend, owner.userId, {
    title: 'Shared',
    description: '',
    organizationId,
  })
  const outsider = await createAuthenticatedUser(
    backend,
    'outsider@example.test'
  )
  expect(
    (
      await owner.client.query(api.organizations.exportResources, {
        organizationId,
        paginationOpts,
      })
    ).page
  ).toMatchObject([{ title: 'Shared' }])
  expect(
    (await owner.client.query(api.account.exportData, { paginationOpts }))
      .resources.page
  ).toEqual([])
  await expect(
    outsider.client.query(api.organizations.exportResources, {
      organizationId,
      paginationOpts,
    })
  ).rejects.toThrow('NOT_FOUND')
  await expect(
    member.client.mutation(api.organizations.remove, {
      organizationId,
      confirmation: 'DELETE',
    })
  ).rejects.toThrow('FORBIDDEN')
  await expect(
    owner.client.mutation(api.organizations.removeMember, {
      organizationId,
      userId: owner.userId,
    })
  ).rejects.toThrow('LAST_OWNER')
  await confirmOperation(backend, owner, 'account.delete')
  await expect(
    owner.client.mutation(api.account.deleteAccount, { confirmation: 'DELETE' })
  ).rejects.toThrow('LAST_OWNER')
  await confirmOperation(
    backend,
    owner,
    `organization.delete:${organizationId}`
  )
  await owner.client.mutation(api.organizations.remove, {
    organizationId,
    confirmation: 'DELETE',
  })
  await backend.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await owner.client.query(api.organizations.list, {})).toEqual([])
  expect(
    await backend.run((ctx) => ctx.db.query('resources').collect())
  ).toEqual([])
  await confirmOperation(backend, owner, 'account.delete')
  await owner.client.mutation(api.account.deleteAccount, {
    confirmation: 'DELETE',
  })
})

test('ownership can be transferred and a delegation reduction revokes legacy invitations atomically', async () => {
  const { backend, owner, member, organizationId } = await fixture()
  await owner.client.mutation(api.organizations.changeRole, {
    organizationId,
    userId: member.userId,
    role: 'owner',
  })
  const row: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        model: 'invitation',
        data: {
          organizationId,
          email: 'new@example.test',
          role: 'admin',
          status: 'pending',
          createdAt: Date.now(),
          inviterId: owner.userId,
          expiresAt: Date.now() + 60_000,
        },
      },
    }
  )
  const invitationId = z.object({ _id: z.string() }).parse(row)._id
  await owner.client.mutation(api.organizations.changeRole, {
    organizationId,
    userId: owner.userId,
    role: 'member',
  })
  expect(
    await backend.query(components.betterAuth.adapter.findOne, {
      model: 'invitation',
      where: [{ field: '_id', value: invitationId }],
    })
  ).toBeNull()
  await expect(
    owner.client.mutation(api.organizations.changeRole, {
      organizationId,
      userId: member.userId,
      role: 'member',
    })
  ).rejects.toThrow('FORBIDDEN')
  expect(
    (
      await member.client.query(api.organizations.get, { organizationId })
    ).members.find((item) => item.userId === member.userId)?.role
  ).toBe('owner')
})

async function managementFixture() {
  vi.stubEnv('ORGANIZATIONS_ENABLED', 'true')
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.com')
  const bob = await createAuthenticatedUser(backend, 'bob@example.com')
  const eve = await createAuthenticatedUser(backend, 'eve@example.com')
  const organizationId = await insertLegacyOrganization(
    backend,
    alice.userId,
    'Legacy management'
  )
  return { backend, alice, bob, eve, organizationId }
}
async function addMember(
  local: Awaited<ReturnType<typeof managementFixture>>,
  role: 'admin' | 'viewer' | 'member' = 'member'
) {
  await local.backend.mutation(components.betterAuth.adapter.create, {
    input: {
      model: 'member',
      data: {
        userId: local.bob.userId,
        organizationId: local.organizationId,
        role,
        createdAt: Date.now(),
      },
    },
  })
}
async function insertInvitation(
  backend: ReturnType<typeof createBackendTest>,
  inviterId: string,
  input: { organizationId: string; email: string; role: string }
) {
  const row: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        model: 'invitation',
        data: {
          ...input,
          email: input.email.toLowerCase(),
          inviterId,
          status: 'pending',
          createdAt: Date.now(),
          expiresAt: Date.now() + 60_000,
        },
      },
    }
  )
  return z.object({ _id: z.string() }).parse(row)._id
}
test.each(['demotion', 'removal'] as const)(
  '%s revokes legacy recipient invitations so they cannot restore privileges',
  async (operation) => {
    const local = await managementFixture()
    await addMember(local, 'admin')
    // Existing deployments can contain invitations issued to an already enrolled member.
    const legacy: unknown = await local.backend.mutation(
      components.betterAuth.adapter.create,
      {
        input: {
          model: 'invitation',
          data: {
            organizationId: local.organizationId,
            email: 'bob@example.com',
            role: 'admin',
            status: 'pending',
            inviterId: local.alice.userId,
            createdAt: Date.now(),
            expiresAt: Date.now() + 60_000,
          },
        },
      }
    )
    if (
      !legacy ||
      typeof legacy !== 'object' ||
      !('_id' in legacy) ||
      typeof legacy._id !== 'string'
    )
      throw new Error('Missing legacy invitation fixture')
    if (operation === 'demotion') {
      await local.alice.client.mutation(api.organizations.changeRole, {
        organizationId: local.organizationId,
        userId: local.bob.userId,
        role: 'viewer',
      })
      await local.bob.client.mutation(api.organizations.removeMember, {
        organizationId: local.organizationId,
        userId: local.bob.userId,
      })
    } else {
      await local.alice.client.mutation(api.organizations.removeMember, {
        organizationId: local.organizationId,
        userId: local.bob.userId,
      })
    }
    await expect(
      local.bob.client.mutation(api.organizations.respondToInvitation, {
        invitationId: legacy._id,
        accept: true,
      })
    ).rejects.toThrow('INVITATION_EXPIRED')
    expect(await local.bob.client.query(api.organizations.list, {})).toEqual([])
  }
)

test('restoring an inviter role never resurrects revoked delegation', async () => {
  const local = await managementFixture()
  await addMember(local, 'admin')
  const invitationId = await insertInvitation(local.backend, local.bob.userId, {
    organizationId: local.organizationId,
    email: 'eve@example.com',
    role: 'member',
  })
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'viewer',
  })
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'admin',
  })
  await expect(
    local.eve.client.mutation(api.organizations.respondToInvitation, {
      invitationId,
      accept: true,
    })
  ).rejects.toThrow('INVITATION_EXPIRED')
  const renewed = await insertInvitation(local.backend, local.bob.userId, {
    organizationId: local.organizationId,
    email: 'eve@example.com',
    role: 'member',
  })
  await local.eve.client.mutation(api.organizations.respondToInvitation, {
    invitationId: renewed,
    accept: true,
  })
  expect(
    (await local.eve.client.query(api.organizations.list, {}))[0]?.role
  ).toBe('member')
})

test('a role reduction revokes only lost delegation in the affected organization', async () => {
  const local = await managementFixture()
  await addMember(local)
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'owner',
  })
  const otherOrganization = await insertLegacyOrganization(
    local.backend,
    local.bob.userId,
    'Other team'
  )
  const revoked = await insertInvitation(local.backend, local.bob.userId, {
    organizationId: local.organizationId,
    email: 'eve@example.com',
    role: 'admin',
  })
  const retained = await insertInvitation(local.backend, local.bob.userId, {
    organizationId: local.organizationId,
    email: 'new@example.com',
    role: 'member',
  })
  const elsewhere = await insertInvitation(local.backend, local.bob.userId, {
    organizationId: otherOrganization,
    email: 'eve@example.com',
    role: 'admin',
  })
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'admin',
  })
  await expect(
    local.eve.client.mutation(api.organizations.respondToInvitation, {
      invitationId: revoked,
      accept: true,
    })
  ).rejects.toThrow('INVITATION_EXPIRED')
  await local.eve.client.mutation(api.organizations.respondToInvitation, {
    invitationId: elsewhere,
    accept: true,
  })
  const newcomer = await createAuthenticatedUser(
    local.backend,
    'new@example.com'
  )
  await newcomer.client.mutation(api.organizations.respondToInvitation, {
    invitationId: retained,
    accept: true,
  })
  expect(
    (await local.eve.client.query(api.organizations.list, {}))[0]
  ).toMatchObject({ id: otherOrganization, role: 'admin' })
  expect(
    (await newcomer.client.query(api.organizations.list, {}))[0]
  ).toMatchObject({ id: local.organizationId, role: 'member' })
})

test('invitations bind to verified email, expire, consume once and revalidate inviter rights', async () => {
  const local = await managementFixture()
  const invitationId = await insertInvitation(
    local.backend,
    local.alice.userId,
    {
      organizationId: local.organizationId,
      email: 'BOB@example.com',
      role: 'member',
    }
  )
  await expect(
    local.eve.client.mutation(api.organizations.respondToInvitation, {
      invitationId,
      accept: true,
    })
  ).rejects.toThrow('NOT_FOUND')
  const results = await Promise.allSettled([
    local.bob.client.mutation(api.organizations.respondToInvitation, {
      invitationId,
      accept: true,
    }),
    local.bob.client.mutation(api.organizations.respondToInvitation, {
      invitationId,
      accept: true,
    }),
  ])
  expect(
    results.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(1)
  expect(
    (
      await local.alice.client.query(api.organizations.get, {
        organizationId: local.organizationId,
      })
    ).members
  ).toHaveLength(2)
  await expect(
    local.bob.client.mutation(api.organizations.respondToInvitation, {
      invitationId,
      accept: true,
    })
  ).rejects.toThrow('INVITATION_EXPIRED')
  const expired = await insertInvitation(local.backend, local.alice.userId, {
    organizationId: local.organizationId,
    email: 'eve@example.com',
    role: 'member',
  })
  await local.backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'invitation',
      where: [{ field: '_id', value: expired }],
      update: { expiresAt: Date.now() - 1 },
    },
  })
  await expect(
    local.eve.client.mutation(api.organizations.respondToInvitation, {
      invitationId: expired,
      accept: true,
    })
  ).rejects.toThrow('INVITATION_EXPIRED')
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'admin',
  })
  const delegated = await insertInvitation(local.backend, local.bob.userId, {
    organizationId: local.organizationId,
    email: 'other@example.com',
    role: 'member',
  })
  const other = await createAuthenticatedUser(
    local.backend,
    'other@example.com'
  )
  await local.alice.client.mutation(api.organizations.removeMember, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
  })
  await expect(
    other.client.mutation(api.organizations.respondToInvitation, {
      invitationId: delegated,
      accept: true,
    })
  ).rejects.toThrow('INVITATION_EXPIRED')
  expect(await other.client.query(api.organizations.invitations, {})).toEqual(
    []
  )
})

test('last-owner protection is atomic across demotion and account deletion', async () => {
  const local = await managementFixture()
  await confirmOperation(local.backend, local.alice, 'account.delete')
  await expect(
    local.alice.client.mutation(api.account.deleteAccount, {
      confirmation: 'DELETE',
    })
  ).rejects.toThrow('LAST_OWNER')
  expect(
    await local.alice.client.query(api.auth.getCurrentUser, {})
  ).not.toBeNull()
  await addMember(local)
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'owner',
  })
  const results = await Promise.allSettled([
    local.alice.client.mutation(api.organizations.changeRole, {
      organizationId: local.organizationId,
      userId: local.alice.userId,
      role: 'member',
    }),
    local.bob.client.mutation(api.organizations.changeRole, {
      organizationId: local.organizationId,
      userId: local.bob.userId,
      role: 'member',
    }),
  ])
  expect(
    results.filter((result) => result.status === 'fulfilled')
  ).toHaveLength(1)
  const remaining = await local.alice.client.query(api.organizations.get, {
    organizationId: local.organizationId,
  })
  expect(
    remaining.members.filter((member) => member.role === 'owner')
  ).toHaveLength(1)
})

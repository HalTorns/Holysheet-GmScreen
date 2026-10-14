import { afterEach, expect, test, vi } from 'vitest'

import { api, components } from '../../convex/_generated/api'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
const paginationOpts = { numItems: 20, cursor: null }

async function fixture() {
  vi.stubEnv('ORGANIZATIONS_ENABLED', 'true')
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.com')
  const bob = await createAuthenticatedUser(backend, 'bob@example.com')
  const eve = await createAuthenticatedUser(backend, 'eve@example.com')
  const organizationId = await alice.client.mutation(api.organizations.create, {
    name: 'Équipe Alice',
  })
  return { backend, alice, bob, eve, organizationId }
}

async function join(
  local: Awaited<ReturnType<typeof fixture>>,
  role: 'admin' | 'member' | 'viewer' = 'member'
) {
  const invitationId = await local.alice.client.mutation(
    api.organizations.invite,
    {
      organizationId: local.organizationId,
      email: 'bob@example.com',
      role,
    }
  )
  await local.bob.client.mutation(api.organizations.respondToInvitation, {
    invitationId,
    accept: true,
  })
  return invitationId
}

test('personal mode is the default and disabling organizations closes their API without losing personal data', async () => {
  vi.stubEnv('ORGANIZATIONS_ENABLED', undefined)
  const backend = createBackendTest()
  const user = await createAuthenticatedUser(backend, 'personal@example.com')
  await expect(
    user.client.mutation(api.organizations.create, { name: 'Disabled' })
  ).rejects.toThrow('MODULE_DISABLED')
  const id = await user.client.mutation(api.resources.create, {
    title: 'Personal',
    description: '',
  })
  expect((await user.client.query(api.resources.get, { id }))?.title).toBe(
    'Personal'
  )

  const local = await fixture()
  const shared = await local.alice.client.mutation(api.resources.create, {
    title: 'Shared',
    description: '',
    organizationId: local.organizationId,
  })
  const invitationId = await local.alice.client.mutation(
    api.organizations.invite,
    {
      organizationId: local.organizationId,
      email: 'bob@example.com',
      role: 'member',
    }
  )
  vi.stubEnv('ORGANIZATIONS_ENABLED', 'false')
  const disabledOperations = [
    () => local.alice.client.query(api.organizations.list, {}),
    () =>
      local.alice.client.query(api.organizations.get, {
        organizationId: local.organizationId,
      }),
    () => local.bob.client.query(api.organizations.invitations, {}),
    () =>
      local.alice.client.query(api.organizations.exportResources, {
        organizationId: local.organizationId,
        paginationOpts,
      }),
    () =>
      local.alice.client.mutation(api.organizations.create, {
        name: 'Disabled',
      }),
    () =>
      local.alice.client.mutation(api.organizations.rename, {
        organizationId: local.organizationId,
        name: 'Disabled',
      }),
    () =>
      local.alice.client.mutation(api.organizations.invite, {
        organizationId: local.organizationId,
        email: 'eve@example.com',
        role: 'member',
      }),
    () =>
      local.bob.client.mutation(api.organizations.respondToInvitation, {
        invitationId,
        accept: true,
      }),
    () =>
      local.alice.client.mutation(api.organizations.cancelInvitation, {
        invitationId,
      }),
    () =>
      local.alice.client.mutation(api.organizations.changeRole, {
        organizationId: local.organizationId,
        userId: local.alice.userId,
        role: 'member',
      }),
    () =>
      local.alice.client.mutation(api.organizations.removeMember, {
        organizationId: local.organizationId,
        userId: local.alice.userId,
      }),
    () =>
      local.alice.client.mutation(api.organizations.remove, {
        organizationId: local.organizationId,
        confirmation: 'DELETE',
      }),
    () =>
      local.alice.client.query(api.resources.list, {
        organizationId: local.organizationId,
        paginationOpts,
      }),
    () =>
      local.alice.client.mutation(api.resources.create, {
        organizationId: local.organizationId,
        title: 'Disabled',
        description: '',
      }),
    () => local.alice.client.mutation(api.resources.remove, { id: shared }),
  ]
  for (const operation of disabledOperations)
    await expect(operation()).rejects.toThrow('MODULE_DISABLED')
  expect(
    await local.alice.client.query(api.resources.get, { id: shared })
  ).toBeNull()
  await expect(
    local.alice.client.mutation(api.resources.update, {
      id: shared,
      title: 'Blocked',
      description: '',
    })
  ).rejects.toThrow('MODULE_DISABLED')
  const exported = await local.alice.client.query(api.account.exportData, {
    paginationOpts,
  })
  expect(exported.resources.page).toEqual([])
  expect(exported.organizations).toMatchObject([
    { id: local.organizationId, role: 'owner' },
  ])
  await expect(
    local.alice.client.mutation(api.account.deleteAccount, {
      confirmation: 'DELETE',
    })
  ).rejects.toThrow('LAST_OWNER')
  vi.stubEnv('ORGANIZATIONS_ENABLED', 'true')
  expect(
    (await local.alice.client.query(api.resources.get, { id: shared }))?.title
  ).toBe('Shared')
})

test('tenant membership and reader permissions are enforced at every resource entry point', async () => {
  const local = await fixture()
  await join(local, 'viewer')
  const id = await local.alice.client.mutation(api.resources.create, {
    title: 'Shared',
    description: '',
    organizationId: local.organizationId,
  })
  expect(
    (
      await local.bob.client.query(api.resources.list, {
        paginationOpts,
        organizationId: local.organizationId,
      })
    ).page
  ).toMatchObject([{ title: 'Shared' }])
  expect(
    (await local.bob.client.query(api.resources.list, { paginationOpts })).page
  ).toEqual([])
  for (const client of [local.bob.client, local.eve.client]) {
    await expect(
      client.mutation(api.resources.create, {
        title: 'No rights',
        description: '',
        organizationId: local.organizationId,
      })
    ).rejects.toThrow()
    await expect(
      client.mutation(api.resources.update, {
        id,
        title: 'No rights',
        description: '',
      })
    ).rejects.toThrow()
    await expect(
      client.mutation(api.resources.remove, { id })
    ).rejects.toThrow()
  }
  expect(await local.eve.client.query(api.resources.get, { id })).toBeNull()
  await expect(
    local.eve.client.query(api.resources.list, {
      paginationOpts,
      organizationId: local.organizationId,
    })
  ).rejects.toThrow('NOT_FOUND')
  await expect(
    local.bob.client.mutation(api.organizations.invite, {
      organizationId: local.organizationId,
      email: 'eve@example.com',
      role: 'member',
    })
  ).rejects.toThrow('FORBIDDEN')
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'member',
  })
  await local.bob.client.mutation(api.resources.update, {
    id,
    title: 'Member can edit',
    description: '',
  })
  expect(
    (await local.alice.client.query(api.resources.get, { id }))?.title
  ).toBe('Member can edit')
  await local.alice.client.mutation(api.organizations.removeMember, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
  })
  expect(
    await local.bob.client.query(api.auth.getCurrentUser, {})
  ).not.toBeNull()
  await expect(
    local.bob.client.query(api.resources.list, {
      paginationOpts,
      organizationId: local.organizationId,
    })
  ).rejects.toThrow('NOT_FOUND')
})

test('two organizations keep roles, management, resources and exports isolated from each other and personal data', async () => {
  const local = await fixture()
  await join(local, 'member')
  const sharedA = await local.bob.client.mutation(api.resources.create, {
    title: 'Authored in A',
    description: '',
    organizationId: local.organizationId,
  })
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'viewer',
  })
  const organizationB = await local.bob.client.mutation(
    api.organizations.create,
    { name: 'Équipe B' }
  )
  const sharedB = await local.bob.client.mutation(api.resources.create, {
    title: 'Only B',
    description: '',
    organizationId: organizationB,
  })
  const alicePersonal = await local.alice.client.mutation(
    api.resources.create,
    { title: 'Alice private', description: '' }
  )
  const bobPersonal = await local.bob.client.mutation(api.resources.create, {
    title: 'Bob private',
    description: '',
  })
  const invitationB = await local.bob.client.mutation(
    api.organizations.invite,
    {
      organizationId: organizationB,
      email: 'alice@example.com',
      role: 'viewer',
    }
  )
  await expect(
    local.bob.client.mutation(api.resources.update, {
      id: sharedA,
      title: 'Author and owner elsewhere',
      description: '',
    })
  ).rejects.toThrow('FORBIDDEN')
  await local.bob.client.mutation(api.resources.update, {
    id: sharedB,
    title: 'B updated',
    description: '',
  })
  expect(
    await local.alice.client.query(api.resources.get, { id: sharedB })
  ).toBeNull()
  expect(
    await local.bob.client.query(api.resources.get, { id: alicePersonal })
  ).toBeNull()
  expect(
    await local.alice.client.query(api.resources.get, { id: bobPersonal })
  ).toBeNull()
  const foreignOperations = [
    () =>
      local.alice.client.query(api.resources.list, {
        organizationId: organizationB,
        paginationOpts,
      }),
    () =>
      local.alice.client.query(api.organizations.get, {
        organizationId: organizationB,
      }),
    () =>
      local.alice.client.query(api.organizations.exportResources, {
        organizationId: organizationB,
        paginationOpts,
      }),
    () =>
      local.alice.client.mutation(api.resources.create, {
        organizationId: organizationB,
        title: 'Foreign',
        description: '',
      }),
    () =>
      local.alice.client.mutation(api.resources.update, {
        id: sharedB,
        title: 'Foreign',
        description: '',
      }),
    () => local.alice.client.mutation(api.resources.remove, { id: sharedB }),
    () =>
      local.alice.client.mutation(api.organizations.rename, {
        organizationId: organizationB,
        name: 'Foreign',
      }),
    () =>
      local.alice.client.mutation(api.organizations.invite, {
        organizationId: organizationB,
        email: 'eve@example.com',
        role: 'member',
      }),
    () =>
      local.alice.client.mutation(api.organizations.changeRole, {
        organizationId: organizationB,
        userId: local.bob.userId,
        role: 'owner',
      }),
    () =>
      local.alice.client.mutation(api.organizations.removeMember, {
        organizationId: organizationB,
        userId: local.bob.userId,
      }),
    () =>
      local.alice.client.mutation(api.organizations.remove, {
        organizationId: organizationB,
        confirmation: 'DELETE',
      }),
    () =>
      local.alice.client.mutation(api.organizations.cancelInvitation, {
        invitationId: invitationB,
      }),
  ]
  for (const operation of foreignOperations)
    await expect(operation()).rejects.toThrow('NOT_FOUND')
  await expect(
    local.bob.client.query(api.organizations.exportResources, {
      organizationId: local.organizationId,
      paginationOpts,
    })
  ).rejects.toThrow('FORBIDDEN')
  const exportA = await local.alice.client.query(
    api.organizations.exportResources,
    { organizationId: local.organizationId, paginationOpts }
  )
  const exportB = await local.bob.client.query(
    api.organizations.exportResources,
    { organizationId: organizationB, paginationOpts }
  )
  expect(exportA.page.map((resource) => resource._id)).toEqual([sharedA])
  expect(exportB.page.map((resource) => resource._id)).toEqual([sharedB])
  const exported = await local.alice.client.query(api.account.exportData, {
    paginationOpts,
  })
  expect(exported.resources.page.map((resource) => resource._id)).toEqual([
    alicePersonal,
  ])
  expect(exported.organizations.map((organization) => organization.id)).toEqual(
    [local.organizationId]
  )
  const viewer = await local.bob.client.query(api.organizations.get, {
    organizationId: local.organizationId,
  })
  expect(
    viewer.members.find((member) => member.userId === local.alice.userId)?.email
  ).toBe('')
  expect(
    viewer.members.find((member) => member.userId === local.bob.userId)?.email
  ).toBe('bob@example.com')
  expect(viewer.invitations).toEqual([])
})

test('administrators cannot grant, alter or remove owner/admin privileges', async () => {
  const local = await fixture()
  await join(local, 'admin')
  await local.bob.client.mutation(api.organizations.rename, {
    organizationId: local.organizationId,
    name: 'Nom modifié',
  })
  expect(
    (
      await local.alice.client.query(api.organizations.get, {
        organizationId: local.organizationId,
      })
    ).organization.name
  ).toBe('Nom modifié')
  await expect(
    local.bob.client.mutation(api.organizations.invite, {
      organizationId: local.organizationId,
      email: 'eve@example.com',
      role: 'admin',
    })
  ).rejects.toThrow('FORBIDDEN')
  for (const role of ['owner', 'member'] as const)
    await expect(
      local.bob.client.mutation(api.organizations.changeRole, {
        organizationId: local.organizationId,
        userId: local.alice.userId,
        role,
      })
    ).rejects.toThrow('FORBIDDEN')
  await expect(
    local.bob.client.mutation(api.organizations.changeRole, {
      organizationId: local.organizationId,
      userId: local.bob.userId,
      role: 'owner',
    })
  ).rejects.toThrow('FORBIDDEN')
  await expect(
    local.bob.client.mutation(api.organizations.remove, {
      organizationId: local.organizationId,
      confirmation: 'DELETE',
    })
  ).rejects.toThrow('FORBIDDEN')
  const invitationId = await local.bob.client.mutation(
    api.organizations.invite,
    {
      organizationId: local.organizationId,
      email: 'eve@example.com',
      role: 'member',
    }
  )
  await local.eve.client.mutation(api.organizations.respondToInvitation, {
    invitationId,
    accept: true,
  })
  await local.bob.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.eve.userId,
    role: 'viewer',
  })
  expect(
    (await local.eve.client.query(api.organizations.list, {}))[0]?.role
  ).toBe('viewer')
})

test('inviting an existing member cannot create a second source of roles', async () => {
  const local = await fixture()
  await join(local, 'viewer')
  await expect(
    local.alice.client.mutation(api.organizations.invite, {
      organizationId: local.organizationId,
      email: 'BOB@example.com',
      role: 'admin',
    })
  ).rejects.toThrow('ALREADY_MEMBER')
  expect(
    (await local.bob.client.query(api.organizations.list, {}))[0]?.role
  ).toBe('viewer')
})

test.each(['demotion', 'removal'] as const)(
  '%s revokes legacy recipient invitations so they cannot restore privileges',
  async (operation) => {
    const local = await fixture()
    await join(local, 'admin')
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
  const local = await fixture()
  await join(local, 'admin')
  const invitationId = await local.bob.client.mutation(
    api.organizations.invite,
    {
      organizationId: local.organizationId,
      email: 'eve@example.com',
      role: 'member',
    }
  )
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
  const renewed = await local.bob.client.mutation(api.organizations.invite, {
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
  const local = await fixture()
  await join(local)
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'owner',
  })
  const otherOrganization = await local.bob.client.mutation(
    api.organizations.create,
    { name: 'Other team' }
  )
  const revoked = await local.bob.client.mutation(api.organizations.invite, {
    organizationId: local.organizationId,
    email: 'eve@example.com',
    role: 'admin',
  })
  const retained = await local.bob.client.mutation(api.organizations.invite, {
    organizationId: local.organizationId,
    email: 'new@example.com',
    role: 'member',
  })
  const elsewhere = await local.bob.client.mutation(api.organizations.invite, {
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
  const local = await fixture()
  const invitationId = await local.alice.client.mutation(
    api.organizations.invite,
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
  const expired = await local.alice.client.mutation(api.organizations.invite, {
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
  const delegated = await local.bob.client.mutation(api.organizations.invite, {
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
  const local = await fixture()
  await expect(
    local.alice.client.mutation(api.account.deleteAccount, {
      confirmation: 'DELETE',
    })
  ).rejects.toThrow('LAST_OWNER')
  expect(
    await local.alice.client.query(api.auth.getCurrentUser, {})
  ).not.toBeNull()
  await join(local)
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

test('account deletion leaves shared data available to its organization and anonymizes its author', async () => {
  vi.useFakeTimers()
  const local = await fixture()
  await join(local)
  await local.alice.client.mutation(api.organizations.changeRole, {
    organizationId: local.organizationId,
    userId: local.bob.userId,
    role: 'owner',
  })
  const shared = await local.alice.client.mutation(api.resources.create, {
    title: 'Team keeps it',
    description: '',
    organizationId: local.organizationId,
  })
  const personal = await local.alice.client.mutation(api.resources.create, {
    title: 'Personal removed',
    description: '',
  })
  await local.alice.client.mutation(api.account.deleteAccount, {
    confirmation: 'DELETE',
  })
  await local.backend.finishAllScheduledFunctions(vi.runAllTimers)
  expect(
    (await local.bob.client.query(api.resources.get, { id: shared }))?.title
  ).toBe('Team keeps it')
  expect(
    await local.backend.run((ctx) => ctx.db.get('resources', personal))
  ).toBeNull()
  expect(
    (await local.backend.run((ctx) => ctx.db.get('resources', shared)))?.ownerId
  ).toBe('deleted-user')
  expect(
    (
      await local.bob.client.query(api.organizations.get, {
        organizationId: local.organizationId,
      })
    ).members
  ).toHaveLength(1)
})

test('organization deletion closes access immediately and cleans shared data in bounded batches', async () => {
  vi.useFakeTimers()
  const local = await fixture()
  await join(local)
  await local.backend.run(async (ctx) => {
    for (let index = 0; index < 205; index++)
      await ctx.db.insert('resources', {
        ownerId: local.alice.userId,
        organizationId: local.organizationId,
        title: `Shared ${index}`,
        description: '',
        updatedAt: Date.now(),
      })
  })
  const personal = await local.bob.client.mutation(api.resources.create, {
    title: 'Personal stays',
    description: '',
  })
  await local.alice.client.mutation(api.organizations.remove, {
    organizationId: local.organizationId,
    confirmation: 'DELETE',
  })
  await expect(
    local.bob.client.query(api.resources.list, {
      paginationOpts,
      organizationId: local.organizationId,
    })
  ).rejects.toThrow('NOT_FOUND')
  await local.backend.finishAllScheduledFunctions(vi.runAllTimers)
  expect(
    await local.backend.run((ctx) =>
      ctx.db
        .query('resources')
        .withIndex('by_organization', (q) =>
          q.eq('organizationId', local.organizationId)
        )
        .collect()
    )
  ).toEqual([])
  expect(
    (await local.bob.client.query(api.resources.get, { id: personal }))?.title
  ).toBe('Personal stays')
  expect(await local.bob.client.query(api.organizations.list, {})).toEqual([])
})

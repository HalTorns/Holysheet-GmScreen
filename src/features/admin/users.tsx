import { api } from '@convex/_generated/api'
import { Link } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { useRef, useState } from 'react'

import { ListNavigation } from '@/components/list-navigation'
import { ErrorState, LoadingState } from '@/components/page-state'
import { Input } from '@/components/ui/input'
import { useDebouncedSearch } from '@/hooks/use-debounced-search'

export function AdminUsers() {
  const access = useQuery(api.auth.getAccessState, {})
  const [draft, setDraft] = useState('')
  const search = useDebouncedSearch(draft)
  const [field, setField] = useState<'email' | 'name'>('email')
  const [role, setRole] = useState<'all' | 'admin' | 'user'>('all')
  if (!access) return <LoadingState />
  if (!access.isAdmin)
    return (
      <p role="alert">
        Votre rôle ne permet pas d’administrer les utilisateurs.
      </p>
    )
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION APPLICATIVE</p>
          <h1>Utilisateurs.</h1>
          <p>Rôles, accès et sessions des comptes de cette application.</p>
        </div>
      </div>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="form-field">
          <label htmlFor="user-search">
            Rechercher par {field === 'email' ? 'email' : 'pseudo'}
          </label>
          <Input
            id="user-search"
            type="search"
            value={draft}
            maxLength={100}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="user-field">Rechercher dans</label>
          <select
            className="rounded-md border bg-background p-2"
            id="user-field"
            value={field}
            onChange={(event) =>
              setField(event.target.value === 'name' ? 'name' : 'email')
            }
          >
            <option value="email">Adresses email</option>
            <option value="name">Pseudos</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="user-role-filter">Filtrer par rôle</label>
          <select
            className="rounded-md border bg-background p-2"
            id="user-role-filter"
            value={role}
            onChange={(event) =>
              setRole(
                event.target.value === 'admin'
                  ? 'admin'
                  : event.target.value === 'user'
                    ? 'user'
                    : 'all'
              )
            }
          >
            <option value="all">Tous les rôles</option>
            <option value="user">Utilisateurs</option>
            <option value="admin">Administrateurs</option>
          </select>
        </div>
      </div>
      <UsersPage
        key={JSON.stringify([search, field, role])}
        search={search}
        field={field}
        role={role}
      />
    </section>
  )
}
function UsersPage({
  search,
  field,
  role,
}: {
  search: string
  field: 'email' | 'name'
  role: 'all' | 'user' | 'admin'
}) {
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const data = useQuery(api.userAdmin.list, {
    search,
    field,
    ...(role === 'all' ? {} : { role }),
    paginationOpts: { numItems: 12, cursor: cursors.at(-1) ?? null },
  })
  const results = useRef<HTMLDivElement>(null)
  function goToPage(update: (value: (string | null)[]) => (string | null)[]) {
    setCursors(update)
    requestAnimationFrame(() => results.current?.focus())
  }
  return (
    <>
      <ListNavigation
        page={cursors.length}
        pending={!data}
        {...(cursors.length > 1
          ? { previous: () => goToPage((value) => value.slice(0, -1)) }
          : {})}
        {...(data && !data.isDone
          ? {
              next: () => goToPage((value) => [...value, data.continueCursor]),
            }
          : {})}
      />
      <div
        ref={results}
        tabIndex={-1}
        aria-label="Résultats des utilisateurs"
        className="grid gap-3 outline-offset-4"
      >
        {data ? (
          data.page.length === 0 ? (
            <p>Aucun compte trouvé.</p>
          ) : (
            data.page.map((user) => (
              <Link
                key={user.id}
                to="/app/users/$userId"
                params={{ userId: user.id }}
                className="panel flex flex-wrap items-center justify-between gap-4 p-5 hover:border-primary"
              >
                <div className="min-w-0">
                  <strong>{user.name || 'Pseudo à choisir'}</strong>
                  <p className="text-sm break-all text-muted-foreground">
                    {user.email}
                  </p>
                </div>
                <span>
                  {user.role === 'admin' ? 'Administrateur' : 'Utilisateur'} ·{' '}
                  {user.banned ? 'Suspendu' : 'Actif'}
                </span>
              </Link>
            ))
          )
        ) : (
          <LoadingState />
        )}
      </div>
    </>
  )
}

export function AdminError({ reset }: { reset: () => void }) {
  return <ErrorState onRetry={reset} />
}

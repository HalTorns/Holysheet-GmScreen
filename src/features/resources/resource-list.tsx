import { usePaginatedQuery } from 'convex/react'
import { FileText, Plus, Radio } from 'lucide-react'
import { useState } from 'react'

import { api } from '@convex/_generated/api'
import { LoadingState } from '@/components/page-state'
import { Button } from '@/components/ui/button'
import { ResourceCard } from '@/features/resources/resource-card'
import { ResourceDialog } from '@/features/resources/resource-form'
import type { Resource } from '@/features/resources/types'
import {
  canWriteOrganizationResources,
  type OrganizationRole,
} from '@shared/organizations'

const PAGE_SIZE = 12

export function ResourceList({
  organization,
}: {
  organization?: { id: string; name: string; role: OrganizationRole }
}) {
  const canWrite =
    !organization || canWriteOrganizationResources(organization.role)
  const { results, status, loadMore } = usePaginatedQuery(
    api.resources.list,
    organization ? { organizationId: organization.id } : {},
    { initialNumItems: PAGE_SIZE },
  )
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [selectedResource, setSelectedResource] = useState<Resource | null>(
    null,
  )
  function create() {
    setSelectedResource(null)
    setIsEditorOpen(true)
  }
  function edit(resource: Resource) {
    setSelectedResource(resource)
    setIsEditorOpen(true)
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {organization ? 'ESPACE PARTAGÉ' : 'VOTRE ESPACE PERSONNEL'}
          </p>
          <h1>{organization ? `${organization.name}.` : 'Mes ressources.'}</h1>
          <p>
            {organization
              ? 'Des ressources communes, accessibles selon votre rôle.'
              : 'Vos idées et vos notes, réunies au même endroit.'}
          </p>
        </div>
        {canWrite && (
          <Button onClick={create}>
            <Plus aria-hidden="true" />
            Nouvelle ressource
          </Button>
        )}
      </div>
      <div className="mb-6 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          {results.length > 0
            ? `${results.length} ressource${results.length > 1 ? 's' : ''} affichée${results.length > 1 ? 's' : ''}`
            : 'Un espace pour commencer.'}
        </span>
        <span className="flex items-center gap-1.5">
          <Radio className="size-3 text-primary" aria-hidden="true" />
          Synchronisé en temps réel
        </span>
      </div>
      {status === 'LoadingFirstPage' ? (
        <LoadingState label="Chargement de vos ressources…" />
      ) : results.length === 0 ? (
        <EmptyResources onCreate={create} canWrite={canWrite} />
      ) : (
        <div className="resource-grid">
          {results.map((resource) => (
            <ResourceCard
              key={resource._id}
              resource={resource}
              onEdit={() => edit(resource)}
              canWrite={canWrite}
            />
          ))}
        </div>
      )}
      {(status === 'CanLoadMore' || status === 'LoadingMore') && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="outline"
            disabled={status === 'LoadingMore'}
            onClick={() => loadMore(PAGE_SIZE)}
          >
            {status === 'LoadingMore' ? 'Chargement…' : 'Charger plus'}
          </Button>
        </div>
      )}
      <ResourceDialog
        open={isEditorOpen && canWrite}
        onOpenChange={setIsEditorOpen}
        resource={selectedResource}
        {...(organization ? { organizationId: organization.id } : {})}
      />
    </>
  )
}

function EmptyResources({
  onCreate,
  canWrite,
}: {
  onCreate: () => void
  canWrite: boolean
}) {
  return (
    <div className="empty-state">
      <FileText aria-hidden="true" />
      <h2>Tout commence ici.</h2>
      <p>
        Une idée, une note ou un projet à suivre. Créez votre première ressource
        et faites de cet espace le vôtre.
      </p>
      {canWrite && (
        <Button onClick={onCreate}>
          <Plus aria-hidden="true" />
          Créer ma première ressource
        </Button>
      )}
    </div>
  )
}

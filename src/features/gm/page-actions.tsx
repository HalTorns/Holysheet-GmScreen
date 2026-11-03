import { Link } from '@tanstack/react-router'
import { Ellipsis, Plus } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'

// Grammaire commune aux pages du projet (chantier 3a-2) : ＋ pour créer,
// ⋯ pour les actions d'un élément, onglets pour naviguer dans le projet.

/** Menu ⋯ d'une ligne : chaque action garde le libellé de son ancien bouton. */
export function RowActions({
  label,
  disabled = false,
  children,
}: {
  label: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            title="Plus d’actions"
            disabled={disabled}
          />
        }
        aria-label={`Actions de ${label}`}
      >
        <Ellipsis />
      </MenuTrigger>
      <MenuContent align="end">{children}</MenuContent>
    </Menu>
  )
}

export { MenuItem as RowAction }

/** Onglets Screens · Fiches · Variables, partagés par les pages du projet. */
export function ProjectNav({ projectId }: { projectId: string }) {
  const tab =
    'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground data-[status=active]:bg-muted data-[status=active]:text-foreground'
  return (
    <nav
      aria-label="Sections du projet"
      className="mb-6 flex flex-wrap gap-1 border-b border-border pb-2"
    >
      <Link
        to="/app/projects/$projectId"
        params={{ projectId }}
        activeOptions={{ exact: true }}
        className={tab}
      >
        Screens
      </Link>
      <Link
        to="/app/projects/$projectId/library"
        params={{ projectId }}
        className={tab}
      >
        Fiches
      </Link>
      <Link
        to="/app/projects/$projectId/variables"
        params={{ projectId }}
        className={tab}
      >
        Variables
      </Link>
    </nav>
  )
}

/**
 * Bouton ＋ ouvrant un menu de création ; chaque choix ouvre un dialogue dont
 * le contenu reçoit `close` pour se refermer après la création.
 */
export function CreateMenu<Choice extends string>({
  label = 'Nouveau',
  choices,
  render,
}: {
  label?: string
  choices: readonly { value: Choice; label: string; title: string }[]
  render: (choice: Choice, close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState<Choice | null>(null)
  const current = choices.find((choice) => choice.value === open)
  return (
    <>
      {choices.length === 1 && choices[0] ? (
        // Un seul choix : pas de menu intermédiaire.
        <Button size="sm" onClick={() => setOpen(choices[0]?.value ?? null)}>
          <Plus />
          {label}
        </Button>
      ) : (
        <Menu>
          <MenuTrigger render={<Button size="sm" />}>
            <Plus />
            {label}
          </MenuTrigger>
          <MenuContent align="end">
            {choices.map((choice) => (
              <MenuItem
                key={choice.value}
                onClick={() => setOpen(choice.value)}
              >
                {choice.label}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      )}
      <Dialog
        open={current !== undefined}
        onOpenChange={(next) => {
          if (!next) setOpen(null)
        }}
      >
        <DialogContent>
          <DialogTitle>{current?.title}</DialogTitle>
          <DialogDescription className="sr-only">
            {current?.title}
          </DialogDescription>
          {open !== null && render(open, () => setOpen(null))}
        </DialogContent>
      </Dialog>
    </>
  )
}

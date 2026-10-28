// Réconciliation du brouillon d'une fiche avec la version serveur. Le
// brouillon ne suit le serveur que s'il n'a pas été modifié et qu'aucun
// enregistrement n'est en cours : une saisie faite pendant l'envoi est
// comparée à la version soumise, jamais remplacée (inspection F1-01).
export type DraftBase<D> = { version: number; draft: D }

export function reconcileDraft<D>(
  state: { base: DraftBase<D>; draft: D; saving: boolean },
  server: DraftBase<D>
): DraftBase<D> | null {
  if (state.saving || server.version === state.base.version) return null
  if (JSON.stringify(state.draft) !== JSON.stringify(state.base.draft))
    return null
  return server
}

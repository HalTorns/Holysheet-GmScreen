import { useState } from 'react'

// Convex peut repasser une requête à undefined le temps de confirmer un jeton
// rafraîchi. Garder la dernière réponse évite de démonter l'écran et de perdre
// un brouillon ou un réglage local. Le composant appelant doit être clé par
// ressource, pour ne jamais afficher la réponse d'une autre ressource.
export function useRetained<T>(value: T | undefined) {
  const [kept, setKept] = useState(value)
  if (value !== undefined && value !== kept) setKept(value)
  return value === undefined ? kept : value
}

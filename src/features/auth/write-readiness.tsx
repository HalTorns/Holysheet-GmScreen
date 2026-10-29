import { createContext, useContext } from 'react'

// Faux tant que Convex n'a pas confirmé le jeton de la session : les éditeurs
// restent montés mais suspendent leurs écritures, y compris automatiques.
const WriteReadiness = createContext(true)

export const WriteReadinessProvider = WriteReadiness.Provider

export function useWriteReady() {
  return useContext(WriteReadiness)
}

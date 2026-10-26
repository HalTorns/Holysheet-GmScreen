type AppConfig = {
  name: string
  brandName: string
  tagline: string
  description: string
  language: string
  locale: string
  timeZone: string
  exportPrefix: string
}

// Public identity shared by the UI and backend. Deployment secrets and security
// settings belong in validated environment variables, never in this object.
export const appConfig = {
  name: 'Holysheet GM Screen',
  brandName: 'Holysheet',
  tagline: 'Vos références de partie, à portée de main',
  description:
    'Préparez vos campagnes et composez vos écrans de maître du jeu : notes, fiches et références réunies au même endroit.',
  language: 'fr',
  locale: 'fr-FR',
  timeZone: 'Europe/Paris',
  exportPrefix: 'holysheet',
} as const satisfies AppConfig

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
  name: 'Socle',
  brandName: 'socle',
  tagline: 'Un point de départ solide',
  description:
    'Un point de départ cohérent pour vos applications. Des données en temps réel, une connexion sans mot de passe et des conventions qui restent lisibles.',
  language: 'fr',
  locale: 'fr-FR',
  timeZone: 'Europe/Paris',
  exportPrefix: 'socle',
} as const satisfies AppConfig

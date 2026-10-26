import { appConfig } from '@shared/app-config'
import { createFileRoute } from '@tanstack/react-router'

import { Brand } from '@/components/brand'
import { SignInForm } from '@/features/auth/sign-in-form'
import { getPublicCapabilities } from '@/lib/public-capabilities'
import { pageMetadata } from '@/lib/seo'

export const Route = createFileRoute('/sign-in')({
  loader: () => getPublicCapabilities(),
  head: () =>
    pageMetadata({
      title: `Connexion — ${appConfig.name}`,
      path: '/sign-in',
      privatePage: true,
    }),
  component: SignInPage,
})

function SignInPage() {
  return (
    <main id="main-content" className="auth-layout">
      <aside className="auth-aside">
        <Brand />
        <div>
          <h2>
            Votre prochaine partie,
            <br />
            <em>à portée de main.</em>
          </h2>
          <p>
            Préparez vos campagnes, rassemblez vos références et composez vos
            écrans de maître du jeu.
          </p>
        </div>
        <p>VOTRE ESPACE. VOS DONNÉES. VOTRE CONTRÔLE.</p>
      </aside>
      <section className="auth-content" aria-label="Connexion">
        <div className="auth-form-container">
          <SignInForm capabilities={Route.useLoaderData()} />
        </div>
      </section>
    </main>
  )
}

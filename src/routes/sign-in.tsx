import { appConfig } from '@shared/app-config'
import { createFileRoute } from '@tanstack/react-router'

import { Brand } from '@/components/brand'
import { SignInForm } from '@/features/auth/sign-in-form'
import { getPublicCapabilities } from '@/lib/public-capabilities'

export const Route = createFileRoute('/sign-in')({
  loader: () => getPublicCapabilities(),
  head: () => ({
    meta: [
      { title: `Connexion — ${appConfig.name}` },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
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
            Votre prochaine idée
            <br />a trouvé <em>son socle.</em>
          </h2>
          <p>
            Un espace à vous pour poser les premières briques. Simple à
            retrouver, facile à faire évoluer.
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

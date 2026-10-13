import { createFileRoute } from '@tanstack/react-router'
import { appConfig } from '@shared/app-config'

import { Brand } from '@/components/brand'
import { SignInForm } from '@/features/auth/sign-in-form'

export const Route = createFileRoute('/sign-in')({
  head: () => ({ meta: [{ title: `Connexion — ${appConfig.name}` }] }),
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
          <SignInForm />
        </div>
      </section>
    </main>
  )
}

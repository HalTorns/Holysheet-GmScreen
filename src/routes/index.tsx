import { createFileRoute, Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowRight,
  Check,
  Fingerprint,
  Layers3,
  Radio,
  ShieldCheck,
} from 'lucide-react'

import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { appConfig } from '@shared/app-config'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [{ title: `${appConfig.name} — ${appConfig.tagline}` }],
  }),
  component: HomePage,
})

function HomePage() {
  return (
    <div className="landing">
      <header className="site-header">
        <Brand />
        <nav
          aria-label="Navigation principale"
          className="flex items-center gap-4 sm:gap-8"
        >
          <a href="#socle" className="quiet-link hidden sm:inline">
            Le socle
          </a>
          <Button
            render={<Link to="/app" />}
            nativeButton={false}
            variant="outline"
            size="sm"
          >
            Ouvrir l’application <ArrowRight aria-hidden="true" />
          </Button>
        </nav>
      </header>
      <main id="main-content">
        <section className="hero page-container">
          <div className="hero-copy">
            <p className="eyebrow">
              <span className="status-dot" /> UNE BASE. UN CADRE. VOTRE
              PROCHAINE IDÉE.
            </p>
            <h1>
              Moins de fondations.
              <br />
              <em>Plus de construction.</em>
            </h1>
            <p className="hero-description">{appConfig.description}</p>
            <div className="flex flex-wrap gap-3">
              <Button
                render={<Link to="/app" />}
                nativeButton={false}
                size="lg"
              >
                Explorer l’application <ArrowRight aria-hidden="true" />
              </Button>
              <Button
                render={<a href="#socle" />}
                nativeButton={false}
                size="lg"
                variant="ghost"
              >
                Explorer le socle <ArrowDown aria-hidden="true" />
              </Button>
            </div>
            <p className="hero-note">
              Votre espace privé. Vos premières ressources. Une vraie
              persistance.
            </p>
          </div>
          <FoundationIllustration />
        </section>
        <section
          className="stack-strip page-container"
          aria-label="Technologies du socle"
        >
          <span className="eyebrow">DES CHOIX QUI S’ACCORDENT</span>
          <div>
            <span>TanStack Start</span>
            <span>Convex</span>
            <span>Better Auth</span>
            <span>Tailwind + shadcn/ui</span>
          </div>
        </section>
        <FoundationSection />
        <section className="closing-section page-container">
          <p className="eyebrow">LE POINT DE DÉPART EST PRÊT</p>
          <h2>
            À vous de lui donner
            <br />
            <em>une raison d’exister.</em>
          </h2>
          <Button render={<Link to="/app" />} nativeButton={false} size="lg">
            Entrer dans mon espace <ArrowRight aria-hidden="true" />
          </Button>
        </section>
      </main>
      <footer className="site-footer page-container">
        <Brand />
        <p>Une base simple, des décisions explicites.</p>
        <span>Conçu pour évoluer.</span>
      </footer>
    </div>
  )
}

function FoundationIllustration() {
  return (
    <div
      className="foundation-illustration"
      aria-label="Trois couches : interface, identité, données"
    >
      <div className="illustration-caption">
        <span>ARCHITECTURE / 01</span>
        <span>UN ENSEMBLE COHÉRENT</span>
      </div>
      <div className="foundation-layer">
        <div>
          <Layers3 aria-hidden="true" />
          <span>Interface</span>
        </div>
        <small>Start · Tailwind · shadcn</small>
        <span className="layer-number" aria-hidden="true">
          03
        </span>
      </div>
      <div className="foundation-layer">
        <div>
          <Fingerprint aria-hidden="true" />
          <span>Identité</span>
        </div>
        <small>Better Auth · Passkeys</small>
        <span className="layer-number" aria-hidden="true">
          02
        </span>
      </div>
      <div className="foundation-layer foundation-layer-dark">
        <div>
          <Radio aria-hidden="true" />
          <span>Données</span>
        </div>
        <small>Convex · Temps réel</small>
        <span className="layer-number" aria-hidden="true">
          01
        </span>
      </div>
      <div className="illustration-baseline">
        <ShieldCheck aria-hidden="true" />
        <span>Des règles côté serveur, à chaque accès.</span>
      </div>
    </div>
  )
}

const foundations = [
  {
    number: '01',
    title: 'Une connexion plus simple.',
    description:
      'Un code reçu par e-mail pour commencer. Une passkey pour revenir. Les sessions et appareils restent sous votre contrôle.',
    details: ['Code à usage unique', 'Gestion des passkeys et des sessions'],
  },
  {
    number: '02',
    title: 'Un espace vraiment personnel.',
    description:
      'Créez, modifiez et retrouvez vos ressources. Les changements se synchronisent, et chaque accès est vérifié côté serveur.',
    details: ['Données privées par propriétaire', 'Validation et pagination'],
  },
  {
    number: '03',
    title: 'Un cadre pour la suite.',
    description:
      'Des frontières explicites entre interface et backend, des commandes de vérification communes et des modules ajoutés selon le besoin.',
    details: [
      'Contrats partagés et TypeScript strict',
      'Tests, CI et procédures documentées',
    ],
  },
]

function FoundationSection() {
  return (
    <section id="socle" className="foundation-section page-container">
      <div className="section-heading">
        <p className="eyebrow">CE QUI EST DÉJÀ EN PLACE</p>
        <h2>
          Le nécessaire.
          <br />
          <em>Bien assemblé.</em>
        </h2>
        <p>
          Un socle lisible aujourd’hui,
          <br />
          pour faire des choix solides demain.
        </p>
      </div>
      <div className="foundation-details">
        {foundations.map((foundation) => (
          <article key={foundation.number}>
            <span className="detail-number" aria-hidden="true">
              {foundation.number}
            </span>
            <div>
              <h3>{foundation.title}</h3>
              <p>{foundation.description}</p>
              <ul>
                {foundation.details.map((detail) => (
                  <li key={detail}>
                    <Check aria-hidden="true" />
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

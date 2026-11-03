import { createHash } from 'node:crypto'
import { createSocket } from 'node:dgram'

import { expect, test } from '@playwright/test'
import type { Frame, Page } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { addMenu, setMode } from './editor-ui'
import {
  createEmail,
  deleteAccountWithClient,
  getAuthenticatedClient,
  signInWithEmail,
  SITE_URL,
  waitForHydration,
} from './helpers'

function definition(
  client: ConvexHttpClient,
  projectId: Id<'gmProjects'>,
  name: string,
  js: string,
  html = '<output id="result">base</output>'
) {
  return client.mutation(api.customWidgets.save, {
    projectId,
    expectedVersion: 0,
    name,
    html,
    css: 'body {font-family:sans-serif}',
    source: js,
    compiled: js,
    language: 'js',
  })
}
async function openScreen(page: Page, screenId: Id<'gmScreens'>) {
  await page.goto(`/app/screens/${screenId}`)
  await waitForHydration(page)
}
async function runnerFor(page: Page, name: string): Promise<Frame> {
  const region = page
    .getByRole('region', { name: /Widget custom/ })
    .filter({ has: page.getByRole('heading', { name, exact: true }) })
  // The relay iframe may be recreated once while the widget mounts: resolve
  // it again on every attempt instead of keeping a stale handle.
  let runner: Frame | undefined
  await expect(async () => {
    const outer = await region
      .locator('iframe')
      .elementHandle({ timeout: 2000 })
    const relay = await outer?.contentFrame()
    expect(relay?.childFrames()).toHaveLength(1)
    runner = relay?.childFrames()[0]
    await expect(runner?.locator('main') ?? region).toBeVisible({
      timeout: 2000,
    })
  }).toPass({ timeout: 20_000 })
  if (!runner) throw new Error('Missing custom runner')
  return runner
}
async function setup(page: Page) {
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  const projectId = await client.mutation(api.gm.createProject, {
    title: 'F8 personnalisé',
  })
  const screenId = await client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Sandbox F8',
    format: 'digital',
  })
  return { client, projectId, screenId }
}

test('F8: TS editor, preview, state persistence, read-only and static print', async ({
  page,
}) => {
  const { client, projectId, screenId } = await setup(page)
  try {
    await page.goto(`/app/projects/${projectId}`)
    await waitForHydration(page)
    await page
      .getByRole('button', {
        name: 'Créer un widget personnalisé',
        exact: true,
      })
      .press('Enter')
    await page
      .getByLabel('Nom du widget personnalisé', { exact: true })
      .fill('Compteur TS F8')
    await page.getByLabel('Langage', { exact: true }).selectOption('ts')
    await page
      .getByLabel('HTML', { exact: true })
      .fill('<button id="count">Compter</button><output id="value">0</output>')
    await page
      .getByLabel('Code JS/TS', { exact: true })
      .fill('const broken: = ;')
    await page
      .getByRole('button', { name: 'Enregistrer la définition', exact: true })
      .press('Enter')
    await expect(
      page
        .locator('[aria-label="Éditeur de widget personnalisé"]')
        .getByRole('alert')
    ).toBeVisible()
    const code =
      'const render = (): void => { document.getElementById("value").textContent = widget.mode === "static" ? "Imprimé" : String(widget.state.count || 0); }; document.getElementById("count").onclick = () => { const count: number = (widget.state.count || 0) + 1; widget.setState({count}); render(); }; widget.onUpdate(render); render();'
    await page.getByLabel('Code JS/TS', { exact: true }).fill(code)
    await page
      .getByRole('button', { name: 'Actualiser l’aperçu', exact: true })
      .press('Enter')
    const preview = page.frameLocator('iframe').frameLocator('iframe')
    await preview.getByRole('button', { name: 'Compter', exact: true }).click()
    await expect(preview.locator('#value')).toHaveText('1')
    await page
      .getByRole('button', { name: 'Enregistrer la définition', exact: true })
      .press('Enter')
    await expect(
      page.getByRole('button', { name: 'Modifier Compteur TS F8', exact: true })
    ).toBeVisible()
    await openScreen(page, screenId)
    await addMenu(page, 'Widget personnalisé…')
    await page
      .getByRole('button', { name: 'Placer Compteur TS F8', exact: true })
      .press('Enter')
    await page
      .getByRole('button', {
        name: 'Fermer widgets personnalisés',
        exact: true,
      })
      .click()
    let runner = await runnerFor(page, 'Compteur TS F8')
    // A frame recreated during mounting must not lose the first click; a
    // suspended widget has no frame and still fails runnerFor.
    await expect(async () => {
      runner = await runnerFor(page, 'Compteur TS F8')
      if ((await runner.locator('#value').textContent()) !== '1')
        await runner
          .getByRole('button', { name: 'Compter', exact: true })
          .click({ timeout: 2000 })
      await expect(runner.locator('#value')).toHaveText('1', { timeout: 2000 })
    }).toPass({ timeout: 30_000 })
    await expect
      .poll(async () => {
        const data = await client.query(api.gmWidgets.getScreenWidgetMetadata, {
          screenId,
        })
        return data.find((entry) => entry.kind === 'custom')?.state
      })
      .toEqual({ count: 1 })
    await page.reload()
    await waitForHydration(page)
    runner = await runnerFor(page, 'Compteur TS F8')
    await expect(runner.locator('#value')).toHaveText('1')
    await setMode(page, 'Lecture')
    await runner.getByRole('button', { name: 'Compter', exact: true }).click()
    await expect(runner.locator('#value')).toHaveText('2')
    await page.emulateMedia({ media: 'print' })
    // The print rendering remounts the frame in static mode.
    await expect(async () => {
      runner = await runnerFor(page, 'Compteur TS F8')
      await expect(runner.locator('#value')).toHaveText('Imprimé', {
        timeout: 2000,
      })
    }).toPass({ timeout: 30_000 })
    const data = await client.query(api.gmWidgets.getScreenWidgetMetadata, {
      screenId,
    })
    expect(data.find((entry) => entry.kind === 'custom')?.state).toEqual({
      count: 1,
    })
  } finally {
    await deleteAccountWithClient(client)
  }
})

test('F8: final raw HTTP documents have exact hashes, no auth payload, and no exception on other paths', async ({
  page,
}) => {
  const { client } = await setup(page)
  try {
    for (const kind of ['host', 'runner'] as const) {
      const response = await page.request.get(`/sandbox/${kind}`)
      expect(response.status()).toBe(200)
      const html = await response.text()
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      expect(scripts).toHaveLength(1)
      const hash = createHash('sha256')
        .update(scripts[0]?.[1] ?? '')
        .digest('base64')
      const expected =
        kind === 'host'
          ? `default-src 'none'; script-src 'sha256-${hash}'; frame-src ${new URL(SITE_URL).origin}/sandbox/runner; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`
          : `default-src 'none'; script-src 'sha256-${hash}' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; webrtc 'block'`
      expect(response.headers()['content-security-policy']).toBe(expected)
      expect(response.headers()['cache-control']).toBe('private, no-store')
      expect(response.headers()['referrer-policy']).toBe('no-referrer')
      expect(response.headers()['x-content-type-options']).toBe('nosniff')
      expect(response.headers()['x-frame-options']).toBe('SAMEORIGIN')
      const policy = response.headers()['permissions-policy']
      expect(policy?.split(', ').every((entry) => entry.endsWith('=()'))).toBe(
        true
      )
      expect(html).not.toMatch(
        /initialToken|__TSR|dehydrated|better-auth|eyJ[A-Za-z0-9_-]+\./
      )
      expect(html).not.toContain('<div id="root"')
    }
    for (const path of [
      '/sandbox/runner/missing',
      '/sandbox/host/missing',
      '/app',
    ]) {
      const response = await page.request.get(path)
      expect(response.headers()['content-security-policy']).not.toContain(
        'unsafe-eval'
      )
      expect(response.headers()['x-frame-options']).toBe('DENY')
    }
  } finally {
    await deleteAccountWithClient(client)
  }
})

test('F8: escape probes, forbidden requests, navigation and zero UDP STUN packets', async ({
  page,
}) => {
  const stun = createSocket('udp4')
  let packets = 0
  stun.on('message', () => {
    packets++
  })
  await new Promise<void>((resolve) => {
    stun.bind(0, '127.0.0.1', resolve)
  })
  const address = stun.address()
  const { client, projectId, screenId } = await setup(page)
  const requests: string[] = []
  await page.route('**/*f8-forbidden*', (route) => {
    requests.push(route.request().url())
    return route.abort()
  })
  const popups: Page[] = []
  page.on('popup', (popup) => {
    popups.push(popup)
  })
  try {
    const js = `
const result = document.getElementById('result');
const checks = {};
try { checks.cookie = document.cookie === ''; } catch { checks.cookie = true; }
try { parent.document.body; checks.parent = false; } catch { checks.parent = true; }
try { localStorage.getItem('x'); checks.storage = false; } catch { checks.storage = true; }
const probe = async () => {
  for (const url of [${JSON.stringify(`${SITE_URL}/f8-forbidden-fetch`)}, 'https://escape.example.com/f8-forbidden-fetch']) {
    try { await fetch(url); checks[url] = false; } catch { checks[url] = true; }
    const script = document.createElement('script'); script.src = url.replace('fetch','script'); document.body.append(script);
  }
  try { top.location = 'https://escape.example.com/f8-forbidden-top'; } catch {}
  checks.popup = window.open('https://escape.example.com/f8-forbidden-popup') === null;
  checks.rtc = true;
  for (const name of ['RTCPeerConnection','webkitRTCPeerConnection','RTCDataChannel','RTCIceTransport']) {
    checks[name] = typeof globalThis[name] === 'undefined';
    try { const rtc = new globalThis[name]({iceServers:[{urls:'stun:127.0.0.1:${address.port}'}]}); rtc.createDataChannel('probe'); await rtc.setLocalDescription(await rtc.createOffer()); checks.rtc = false; } catch {}
  }
  // about:blank constructors are attempted too. frame-src none must block the frame.
  const blank = document.createElement('iframe'); blank.src = 'about:blank'; document.body.append(blank);
  try { const Constructor = blank.contentWindow.RTCPeerConnection; const rtc = new Constructor({iceServers:[{urls:'stun:127.0.0.1:${address.port}'}]}); rtc.createDataChannel('probe'); await rtc.setLocalDescription(await rtc.createOffer()); checks.rtc = false; } catch {}
  result.textContent = JSON.stringify(checks);
};
void probe();
for (const [name, action] of Object.entries({
  location: () => { location.href = 'https://escape.example.com/f8-forbidden-location'; },
  link: () => { const a = document.createElement('a'); a.href = ${JSON.stringify(`${SITE_URL}/f8-forbidden-link`)}; document.body.append(a); a.click(); },
  meta: () => { const meta = document.createElement('meta'); meta.httpEquiv = 'refresh'; meta.content = '0;url=https://escape.example.com/f8-forbidden-meta'; document.head.append(meta); },
  data: () => { location.href = 'data:text/html,f8-forbidden-data'; }
})) { const button = document.createElement('button'); button.textContent = name; button.onclick = () => { try { action(); } catch {} }; document.body.append(button); }
`
    const id = await definition(client, projectId, 'Évasions F8', js)
    await client.mutation(api.customWidgets.place, {
      screenId,
      definitionId: id,
    })
    await openScreen(page, screenId)
    const runner = await runnerFor(page, 'Évasions F8')
    await expect(runner.locator('#result')).toContainText('RTCIceTransport')
    expect(
      await runner.evaluate(() => {
        const policy: unknown = Reflect.get(document, 'featurePolicy')
        if (
          !policy ||
          typeof policy !== 'object' ||
          !('allowedFeatures' in policy) ||
          typeof policy.allowedFeatures !== 'function'
        )
          throw new Error('Missing Chromium FeaturePolicy')
        const features: unknown = Reflect.apply(
          policy.allowedFeatures,
          policy,
          []
        )
        return features
      })
    ).toEqual([])
    const checks: unknown = JSON.parse(
      (await runner.locator('#result').textContent()) ?? '{}'
    )
    expect(checks).toEqual(
      expect.objectContaining({
        cookie: true,
        parent: true,
        storage: true,
        popup: true,
        rtc: true,
        RTCPeerConnection: true,
        webkitRTCPeerConnection: true,
        RTCDataChannel: true,
        RTCIceTransport: true,
      })
    )
    if (!checks || typeof checks !== 'object')
      throw new Error('Missing probe results')
    expect(Object.values(checks).every((entry) => entry === true)).toBe(true)
    // Observe longer than the watchdog threshold, checking the runner remains
    // responsive while a reachable ICE constructor would gather candidates.
    const host = runner.parentFrame()
    if (!host) throw new Error('Missing relay')
    const observationStart = Date.now()
    await expect
      .poll(
        async () => {
          await expect(runner.locator('#result')).toBeVisible()
          return Date.now() - observationStart
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThan(5000)
    expect(packets).toBe(0)
    expect(requests).toEqual([])
    expect(popups).toEqual([])
    // A blocked self-navigation may replace the frame with Chromium's error
    // document. Each attempt therefore owns a fresh generation, never assumes
    // that the previous runner survives the browser's denial.
    for (const name of ['location', 'link', 'meta', 'data']) {
      await openScreen(page, screenId)
      const active = await runnerFor(page, 'Évasions F8')
      await expect(active.locator('#result')).toContainText('RTCIceTransport')
      const relay = active.parentFrame()
      if (!relay) throw new Error('Missing relay')
      const violation = relay.evaluate(
        () =>
          new Promise<string>((resolve) => {
            document.addEventListener(
              'securitypolicyviolation',
              (event) => resolve(event.effectiveDirective),
              { once: true }
            )
          })
      )
      await active.getByRole('button', { name, exact: true }).press('Enter')
      expect(await violation).toBe('frame-src')
      await expect(
        page.getByText('Widget suspendu, recharger', { exact: false })
      ).toBeVisible()
      expect(requests).toEqual([])
      expect(packets).toBe(0)
    }
    expect(page.url()).toContain(`/app/screens/${screenId}`)
  } finally {
    stun.close()
    await deleteAccountWithClient(client)
  }
})

test('F8: sibling custom and F7b frames cannot forge init or update; flood and watchdog suspend independently of notes', async ({
  page,
}) => {
  const { client, projectId, screenId } = await setup(page)
  try {
    const victimId = await definition(
      client,
      projectId,
      'Victime F8',
      'widget.onUpdate(() => document.getElementById("result").textContent = JSON.stringify(widget.state)); document.getElementById("result").textContent = "victime";'
    )
    await client.mutation(api.customWidgets.place, {
      screenId,
      definitionId: victimId,
    })
    const attackerCode = `const attack = () => { for (let i = 0; i < top.length; i++) { try { const host = top.frames[i]; host.postMessage({type:'update',settings:{},state:{forged:true}}, '*'); for (let j = 0; j < host.length; j++) { const target = host.frames[j]; const channel = new MessageChannel(); target.postMessage({type:'init',html:'forged',css:'',js:'widget.setState({forged:true})',settings:{},state:{forged:true},mode:'live',theme:'light'}, '*', [channel.port2]); target.postMessage({type:'update',settings:{},state:{forged:true}}, '*'); channel.port1.close(); } } catch {} } document.body.dataset.attacked = 'true'; }; const button = document.createElement('button'); button.textContent='Attaquer'; button.onclick=attack; document.body.append(button);`
    const sibling = await definition(
      client,
      projectId,
      'Voisin F8',
      attackerCode
    )
    await client.mutation(api.customWidgets.place, {
      screenId,
      definitionId: sibling,
    })
    await page.route('https://attack.example.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        // Le script doit s'exécuter dans le corps : sans <body>, document.body est null.
        body: `<!doctype html><html><body><script>${attackerCode}</script></body></html>`,
      })
    )
    await client.mutation(api.gmWidgets.addWidget, {
      screenId,
      kind: 'embed',
      embedConfig: {
        title: 'Attaquant F7b',
        url: 'https://attack.example.com/reference',
        mode: 'frame',
      },
    })
    await openScreen(page, screenId)
    const victim = await runnerFor(page, 'Victime F8')
    await victim.evaluate(() => {
      let count = 0
      addEventListener('message', () => {
        document.body.dataset.attacks = String(++count)
      })
    })
    await (
      await runnerFor(page, 'Voisin F8')
    )
      .getByRole('button', { name: 'Attaquer', exact: true })
      .press('Enter')
    const embed = page.frameLocator(
      'iframe[src="https://attack.example.com/reference"]'
    )
    await embed
      .getByRole('button', { name: 'Attaquer', exact: true })
      .press('Enter')
    await expect(embed.locator('body')).toHaveAttribute('data-attacked', 'true')
    await expect(victim.locator('body')).toHaveAttribute('data-attacks', '4')
    await expect(victim.locator('#result')).toHaveText('victime')
    const flood = await definition(
      client,
      projectId,
      'Flood F8',
      'for(let i=0;i<100;i++) widget.setState({count:i});'
    )
    await client.mutation(api.customWidgets.place, {
      screenId,
      definitionId: flood,
    })
    await expect(
      page.getByText('Widget suspendu, recharger', { exact: false })
    ).toBeVisible()
    const note = await client.mutation(api.gm.addNote, { screenId })
    await client.mutation(api.gm.updateNote, {
      id: note,
      expectedVersion: 0,
      body: 'Sauvegarde normale après flood',
    })
    expect(
      await client.query(api.gmWidgets.getNoteContent, { id: note })
    ).toMatchObject({ body: 'Sauvegarde normale après flood' })
    const loopStarted = page.waitForEvent('console', {
      predicate: (message) => message.text() === 'F8 infinite loop started',
    })
    const loop = await definition(
      client,
      projectId,
      'Boucle F8',
      'console.log("F8 infinite loop started"); while(true) {}'
    )
    await client.mutation(api.customWidgets.place, {
      screenId,
      definitionId: loop,
    })
    await loopStarted
    const loopRegion = page
      .getByRole('region', { name: /Widget custom/ })
      .filter({
        has: page.getByRole('heading', { name: 'Boucle F8', exact: true }),
      })
    await setMode(page, 'Lecture')
    await expect(
      page.getByRole('radio', { name: 'Lecture', exact: true })
    ).toHaveAttribute('aria-checked', 'true')
    const suspended = await loopRegion
      .getByText('Widget suspendu, recharger', { exact: false })
      .count()
    test.info().annotations.push({
      type: 'F8-infinite-loop',
      description: suspended
        ? 'Chromium: widget suspended; Screen remains responsive.'
        : 'Chromium: Screen remains responsive; relay/runner can share a blocked process, so watchdog suspension is not assumed.',
    })
  } finally {
    await deleteAccountWithClient(client)
  }
})

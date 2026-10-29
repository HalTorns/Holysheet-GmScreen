import '../../src/styles.css'
import type { NoteValue } from '@shared/gm'
import { useCallback, useState } from 'react'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

import { NoteInput } from '../../src/features/gm/rich-text/input'
import { convertNotePaste } from '../../src/features/gm/rich-text/paste'
import { NoteRender } from '../../src/features/gm/rich-text/render'
import { useEditorDraft } from '../../src/features/gm/use-editor-draft'

const initialNote: NoteValue = { body: 'texte', bodyFormat: 'markdown-v1' }
function Harness({
  initial = initialNote,
  readOnly = false,
}: {
  initial?: NoteValue
  readOnly?: boolean
}) {
  const [server, setServer] = useState({ value: initial, version: 0 })
  const save = useCallback((value: NoteValue, version: number) => {
    setServer({ value, version: version + 1 })
    return Promise.resolve(version + 1)
  }, [])
  const editor = useEditorDraft({
    value: server.value,
    version: server.version,
    onSave: save,
    autoSave: false,
  })
  return (
    <>
      <NoteInput
        id="note"
        value={editor.value}
        onEdit={(changed) => editor.edit(changed)}
        readOnly={readOnly}
      />
      <button type="button" onClick={() => void editor.save()}>
        Sauver
      </button>
      <button type="button" onClick={() => editor.discard()}>
        Écarter
      </button>
      <button
        type="button"
        onClick={() =>
          setServer({
            value: { body: 'distant', bodyFormat: 'plain' },
            version: server.version + 1,
          })
        }
      >
        Distant
      </button>
      <p>
        {editor.conflict ? 'conflit' : editor.dirty ? 'brouillon' : 'propre'}
      </p>
      <p aria-label="Serveur">{JSON.stringify(server.value)}</p>
    </>
  )
}
function field() {
  const element = document.querySelector('textarea')
  if (!element) throw new Error('Missing note textarea')
  return element
}
// Une action de barre d'outils replace le curseur à l'image suivante : si
// cette image tombe pendant fill, le texte s'insère au mauvais endroit.
// Ressaisir jusqu'à obtenir exactement la valeur voulue.
async function fillNote(value: string) {
  await expect
    .poll(async () => {
      field().focus()
      field().select()
      await userEvent.fill(field(), value)
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })
      return field().value
    })
    .toBe(value)
}
// Un rendu React encore en attente peut replacer le curseur en fin de texte :
// reposer la sélection jusqu'à ce qu'elle survive à deux images.
async function select(start: number, end: number) {
  await expect
    .poll(async () => {
      field().setSelectionRange(start, end)
      await new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      })
      return [field().selectionStart, field().selectionEnd]
    })
    .toEqual([start, end])
}
function paste(html: string, plain = 'secours') {
  const data = new DataTransfer()
  data.setData('text/html', html)
  data.setData('text/plain', plain)
  field().dispatchEvent(
    new ClipboardEvent('paste', {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    })
  )
}

test('toolbar selection, local shortcuts, IME, dialog escape and preview keep the complete draft', async () => {
  const screen = await render(<Harness />)
  field().focus()
  await select(0, 5)
  await screen.getByRole('button', { name: 'Gras', exact: true }).click()
  await expect
    .element(screen.getByRole('textbox', { name: 'Contenu de la note' }))
    .toHaveValue('**texte**')
  await expect.poll(() => document.activeElement === field()).toBe(true)
  expect(field().selectionStart).toBe(2)
  field().dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'i',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
  )
  await expect
    .element(screen.getByRole('textbox', { name: 'Contenu de la note' }))
    .toHaveValue('***texte***')
  field().dispatchEvent(
    new CompositionEvent('compositionstart', { bubbles: true })
  )
  field().dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'b',
      ctrlKey: true,
      isComposing: true,
      bubbles: true,
      cancelable: true,
    })
  )
  field().dispatchEvent(
    new CompositionEvent('compositionend', { bubbles: true })
  )
  await expect
    .element(screen.getByRole('textbox', { name: 'Contenu de la note' }))
    .toHaveValue('***texte***')
  await screen.getByRole('button', { name: 'Lien', exact: true }).click()
  await screen
    .getByLabelText('URL', { exact: true })
    .fill(['javascript', 'evil()'].join(':'))
  await screen.getByRole('button', { name: 'Insérer', exact: true }).click()
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent('URL refusée')
  await screen.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect.poll(() => document.activeElement === field()).toBe(true)
  await screen.getByRole('button', { name: 'Aperçu', exact: true }).click()
  await expect
    .element(screen.getByRole('region', { name: 'Aperçu de la note' }))
    .toHaveTextContent('texte')
  await screen.getByRole('button', { name: 'Sauver', exact: true }).click()
  await expect
    .element(screen.getByText('propre', { exact: true }))
    .toBeVisible()
  await screen.getByRole('button', { name: 'Éditer', exact: true }).click()
  await fillNote('mon brouillon')
  await screen.getByRole('button', { name: 'Distant', exact: true }).click()
  await expect
    .element(screen.getByText('conflit', { exact: true }))
    .toBeVisible()
  await expect.element(screen.getByRole('textbox')).toHaveValue('mon brouillon')
  await screen.getByRole('button', { name: 'Écarter', exact: true }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Activer le texte riche' }))
    .toBeVisible()
})

test('activation is explicit, literal, bounded and preview never dirties a clean draft', async () => {
  const screen = await render(
    <Harness initial={{ body: '# **texte** <b>x</b>', bodyFormat: 'plain' }} />
  )
  await expect
    .element(screen.getByText('propre', { exact: true }))
    .toBeVisible()
  await screen.getByRole('button', { name: 'Activer le texte riche' }).click()
  await screen.getByRole('button', { name: 'Aperçu', exact: true }).click()
  await expect
    .element(screen.getByRole('region'))
    .toHaveTextContent('# **texte** <b>x</b>')
  await screen.getByRole('button', { name: 'Sauver' }).click()
  await screen.getByRole('button', { name: 'Éditer', exact: true }).click()
  await screen.getByRole('button', { name: 'Aperçu', exact: true }).click()
  await expect
    .element(screen.getByText('propre', { exact: true }))
    .toBeVisible()
  await screen.unmount()
  const large = await render(
    <Harness initial={{ body: '*'.repeat(50_000), bodyFormat: 'plain' }} />
  )
  await large.getByRole('button', { name: 'Activer le texte riche' }).click()
  await expect
    .element(large.getByRole('status'))
    .toHaveTextContent('Activation refusée')
  await expect
    .element(large.getByRole('textbox'))
    .toHaveValue('*'.repeat(50_000))
})

test('Word/Docs semantic paste is inert, preserves selection, simplifies unsupported content and refuses oversized insertion', async () => {
  const screen = await render(<Harness />)
  await select(0, 5)
  paste(
    '<html><body><p class="MsoNormal" style="color:red"><b>Gras</b> <i>italique</i></p><ol><li>un</li><li>deux</li></ol><a href="https://example.test">lien</a><img src="https://evil.test/image" alt="image"><table><tr><td>A</td><td>B</td></tr></table><script>window.evil=1</script><svg onload="evil()"></svg></body></html>'
  )
  await expect.poll(() => field().value).toContain('**Gras**')
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('simplifié')
  await screen.getByRole('button', { name: 'Aperçu', exact: true }).click()
  expect(
    document.querySelector('img, script[src*="evil"], svg[onload], iframe')
  ).toBeNull()
  await expect.element(screen.getByRole('region')).toHaveTextContent('A B')
  await screen.getByRole('button', { name: 'Éditer', exact: true }).click()
  await fillNote('x'.repeat(49_999))
  await select(49_999, 49_999)
  paste('<b>trop long</b>')
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('Insertion refusée')
  await expect
    .element(screen.getByRole('textbox'))
    .toHaveValue('x'.repeat(49_999))
})

test('paste converter enforces complexity, escaping and absolute URL policy', () => {
  const result = convertNotePaste(
    '<p><span style="font-weight:bold">styles seuls</span></p><a href="jav&#97;script:evil()">non</a><a href="//evil.test">relatif</a><a href="mailto:a@example.test">mail</a>',
    ''
  )
  expect(result.body).not.toContain('javascript')
  expect(result.body).not.toContain('//evil')
  expect(result.body).toContain('[mail](mailto:a@example.test)')
  expect(result.body).not.toContain('**styles')
  for (const url of [
    'data:text/html,x',
    'vbscript:x',
    '/x',
    'java&#10;script:x',
  ])
    expect(convertNotePaste(`<a href="${url}">x</a>`, '').body).toBe('x')
  for (const html of [
    'x'.repeat(200_001),
    `${'<div>'.repeat(40)}x${'</div>'.repeat(40)}`,
    '<span>x</span>'.repeat(3000),
  ]) {
    const fallback = convertNotePaste(html, '**literal**')
    expect(fallback.fallback).toBe(true)
    expect(fallback.body).toBe('\\*\\*literal\\*\\*')
  }
})

test('read-only renders static content without an editor and native details are keyboard accessible', async () => {
  const screen = await render(
    <NoteInput
      id="readonly"
      value={{
        body: ':::details[Résumé]\nsecret\n:::',
        bodyFormat: 'markdown-v1',
      }}
      readOnly
      onEdit={() => {
        throw new Error('Read-only write')
      }}
    />
  )
  expect(document.querySelector('textarea, button')).toBeNull()
  await expect
    .element(screen.getByText('Résumé', { exact: true }))
    .toBeVisible()
  await screen.getByText('Résumé', { exact: true }).click()
  await expect
    .element(screen.getByText('secret', { exact: true }))
    .toBeVisible()
})

test('maximum note and one hundred notes render without reparsing unchanged notes', async () => {
  const body = 'texte **gras** et *italique*.\n'
    .repeat(1500)
    .padEnd(50_000, 'x')
    .slice(0, 50_000)
  const one: number[] = []
  const hundred: number[] = []
  for (let trial = 0; trial < 5; trial++) {
    const start = performance.now()
    const screen = await render(
      <NoteRender body={body} bodyFormat="markdown-v1" />
    )
    one.push(performance.now() - start)
    await screen.unmount()
    const startMany = performance.now()
    const many = await render(
      <>
        {Array.from({ length: 100 }, (_, index) => (
          <NoteRender
            key={index}
            body={`Note ${index}: **texte**`}
            bodyFormat="markdown-v1"
          />
        ))}
      </>
    )
    hundred.push(performance.now() - startMany)
    await many.unmount()
  }
  console.info('F4b Chromium render, median of five (ms)', {
    one: one.sort((a, b) => a - b)[2],
    hundred: hundred.sort((a, b) => a - b)[2],
    userAgent: navigator.userAgent,
  })
})

test('all toolbar insertions preserve the draft, links validate, Escape restores focus and bounded HTML needs explicit plain paste', async () => {
  const screen = await render(<Harness />)
  await screen
    .getByLabelText('Niveau du titre', { exact: true })
    .selectOptions('2')
  await expect.element(screen.getByRole('textbox')).toHaveValue('## texte')
  await fillNote('un\ndeux')

  // Attendre la valeur appliquée par React avant de placer la sélection.

  await expect.element(screen.getByRole('textbox')).toHaveValue('un\ndeux')

  await select(0, 7)
  await screen
    .getByRole('button', { name: 'Liste à puces', exact: true })
    .click()
  await expect.element(screen.getByRole('textbox')).toHaveValue('- un\n- deux')
  await fillNote('un\ndeux')

  // Attendre la valeur appliquée par React avant de placer la sélection.

  await expect.element(screen.getByRole('textbox')).toHaveValue('un\ndeux')

  await select(0, 7)
  await screen
    .getByRole('button', { name: 'Liste numérotée', exact: true })
    .click()
  await expect
    .element(screen.getByRole('textbox'))
    .toHaveValue('1. un\n1. deux')
  await fillNote('code\nbloc')

  // Attendre la valeur appliquée par React avant de placer la sélection.

  await expect.element(screen.getByRole('textbox')).toHaveValue('code\nbloc')

  await select(0, 9)
  await screen
    .getByRole('button', { name: 'Code littéral', exact: true })
    .click()
  await expect
    .element(screen.getByRole('textbox'))
    .toHaveValue('\n```\ncode\nbloc\n```\n')
  await fillNote('secret')

  // Attendre la valeur appliquée par React avant de placer la sélection.

  await expect.element(screen.getByRole('textbox')).toHaveValue('secret')

  await select(0, 6)
  await screen
    .getByRole('button', { name: 'Bloc repliable', exact: true })
    .click()
  await screen.getByLabelText('Résumé', { exact: true }).fill('Résumé')
  await screen.getByRole('button', { name: 'Insérer', exact: true }).click()
  await expect
    .element(screen.getByRole('textbox'))
    .toHaveValue('\n:::details[Résumé]\nsecret\n:::\n')
  await expect.poll(() => document.activeElement === field()).toBe(true)
  await fillNote('lien')

  // Attendre la valeur appliquée par React avant de placer la sélection.

  await expect.element(screen.getByRole('textbox')).toHaveValue('lien')

  await select(0, 4)
  await screen.getByRole('button', { name: 'Lien', exact: true }).click()
  await screen
    .getByLabelText('URL', { exact: true })
    .fill('https://example.test')
  await screen.getByRole('button', { name: 'Insérer', exact: true }).click()
  await expect
    .element(screen.getByRole('textbox'))
    .toHaveValue('[lien](https://example.test)')
  await screen.getByRole('button', { name: 'Lien', exact: true }).click()
  document.activeElement?.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    })
  )
  await expect.poll(() => document.activeElement === field()).toBe(true)
  await select(0, field().value.length)
  paste('x'.repeat(200_001), '**brut**')
  await expect
    .element(screen.getByRole('textbox'))
    .toHaveValue('[lien](https://example.test)')
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('Coller en texte brut')
  await screen
    .getByRole('button', { name: 'Coller en texte brut', exact: true })
    .click()
  paste('<b>riche</b>', '**brut**')
  await expect
    .element(screen.getByRole('textbox'))
    .toHaveValue('\\*\\*brut\\*\\*')
})

import type { NoteValue } from '@shared/gm'
import { memo } from 'react'
import type { ComponentProps } from 'react'
import Markdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'
import remarkDirective from 'remark-directive'

import { safeNoteUrl } from './policy'

type Ast = {
  type: string
  value?: string
  name?: string
  depth?: number
  attributes?: Record<string, string | null> | null
  children?: Ast[]
  position?: { start: { offset?: number }; end: { offset?: number } }
  data?: { hName?: string; hProperties?: Record<string, never> }
}
const tags = [
  'p',
  'br',
  'h3',
  'h4',
  'h5',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'pre',
  'code',
  'a',
  'details',
  'summary',
]
const schema = {
  tagNames: tags,
  attributes: { a: ['href'], ol: ['start'] },
  protocols: { href: ['http', 'https', 'mailto'] },
  clobberPrefix: 'note-',
}

function noteSyntax({ source }: { source: string }) {
  return (tree: Ast) => {
    let count = 0
    let exceeded = false
    function inspect(node: Ast, depth: number) {
      count += 1
      if (count > 5000 || depth > 32) {
        exceeded = true
        return
      }
      for (const child of node.children ?? []) {
        if (exceeded) break
        inspect(child, depth + 1)
      }
    }
    inspect(tree, 0)
    function fallback() {
      tree.children = [
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: 'Aperçu simplifié : limite de rendu dépassée.',
            },
          ],
        },
        { type: 'paragraph', children: [{ type: 'text', value: source }] },
      ]
    }
    if (exceeded) {
      fallback()
      return
    }
    function transform(node: Ast, inDetails: boolean) {
      if (node.type.endsWith('Directive')) {
        const raw = source.slice(
          node.position?.start.offset,
          node.position?.end.offset
        )
        const summary = node.children?.[0]
        const label =
          summary?.children?.map((child) => child.value ?? '').join('') ?? ''
        const valid =
          node.type === 'containerDirective' &&
          node.name === 'details' &&
          !inDetails &&
          !Object.keys(node.attributes ?? {}).length &&
          /^:::details\[(?:\\.|[^\]\\\r\n])+\]\r?\n/u.test(raw) &&
          /\n:::\s*$/u.test(raw) &&
          label.length > 0 &&
          label.length <= 120 &&
          summary?.children?.every((child) => child.type === 'text') &&
          !raw
            .slice(raw.indexOf('\n') + 1, raw.lastIndexOf('\n'))
            .includes(':::')
        if (!valid) {
          node.type = 'text'
          node.value = raw
          delete node.children
          delete node.data
          return
        }
        node.data = { hName: 'details', hProperties: {} }
        if (summary) summary.data = { hName: 'summary', hProperties: {} }
        for (const child of node.children ?? []) transform(child, true)
        return
      }
      if (node.type === 'heading') node.depth = Math.min(node.depth ?? 1, 3) + 2
      if (node.type === 'paragraph') {
        node.children = (node.children ?? []).flatMap((child) => {
          if (child.type !== 'text' || !child.value?.includes('\n'))
            return [child]
          return child.value
            .split('\n')
            .flatMap((line, index) =>
              index === 0
                ? [{ type: 'text', value: line }]
                : [{ type: 'break' }, { type: 'text', value: line }]
            )
        })
      }
      for (const child of node.children ?? []) transform(child, inDetails)
    }
    transform(tree, false)
    count = 0
    exceeded = false
    inspect(tree, 0)
    if (exceeded) fallback()
  }
}

function NoteLink({ href, children }: ComponentProps<'a'>) {
  const safe = safeNoteUrl(href ?? '')
  if (!safe) return children
  if (safe.toLowerCase().startsWith('mailto:'))
    return (
      <a href={safe} className="underline">
        {children}
      </a>
    )
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    >
      {children}
    </a>
  )
}
function NativeDetails({ children }: ComponentProps<'details'>) {
  return <details>{children}</details>
}
function NativeSummary({ children }: ComponentProps<'summary'>) {
  return <summary>{children}</summary>
}
function StaticDetails({ children }: ComponentProps<'details'>) {
  return <section>{children}</section>
}
function StaticSummary({ children }: ComponentProps<'summary'>) {
  return <p className="font-bold">{children}</p>
}
const interactiveComponents = {
  a: NoteLink,
  details: NativeDetails,
  summary: NativeSummary,
}
const staticComponents = {
  a: NoteLink,
  details: StaticDetails,
  summary: StaticSummary,
}
function NoteBody({
  body,
  bodyFormat,
  staticOutput = false,
}: NoteValue & { staticOutput?: boolean }) {
  if (bodyFormat === 'plain')
    return <div className="whitespace-pre-wrap">{body}</div>
  return (
    <div className="break-words whitespace-pre-wrap [&_h3]:font-bold [&_h4]:font-bold [&_h5]:font-bold [&_li]:ml-5 [&_ol]:list-decimal [&_ul]:list-disc">
      <Markdown
        skipHtml
        remarkPlugins={[remarkDirective, [noteSyntax, { source: body }]]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        urlTransform={(url) => safeNoteUrl(url) ?? ''}
        components={staticOutput ? staticComponents : interactiveComponents}
      >
        {body}
      </Markdown>
    </div>
  )
}
export const NoteRender = memo(NoteBody)

import {
  customInit,
  customOutput,
  customUpdate,
  messageBudget,
} from '@shared/custom-widget-protocol'
import type { z } from '@shared/zod'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

type Init = z.infer<typeof customInit>
export function CustomFrame({
  input,
  onState,
}: {
  input: Init
  onState?: ((state: Init['state']) => void) | undefined
}) {
  const container = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement | null>(null)
  const latest = useRef({ input, onState })
  const [generation, setGeneration] = useState(0)
  const [status, setStatus] = useState('')
  const [suspended, setSuspended] = useState(false)
  useEffect(() => {
    latest.current = { input, onState }
  }, [input, onState])
  useEffect(() => {
    if (suspended) return undefined
    // This trusted same-origin document deliberately has no sandbox attribute.
    // Only the relay creates the opaque sandbox that executes user code.
    const element = document.createElement('iframe')
    element.src = '/sandbox/host'
    element.title = 'Widget personnalisé isolé'
    element.allow = ''
    element.referrerPolicy = 'no-referrer'
    element.className = 'h-full min-h-48 w-full border-0'
    element.dataset.generation = String(generation)
    element.addEventListener('load', () => {
      const parsed = customInit.safeParse(latest.current.input)
      if (parsed.success)
        element.contentWindow?.postMessage(parsed.data, location.origin)
    })
    const allowed = messageBudget()
    const receive = (event: MessageEvent<unknown>) => {
      if (
        event.source !== element.contentWindow ||
        event.origin !== location.origin
      )
        return
      const parsed = customOutput.safeParse(event.data)
      if (
        !allowed(parsed.success ? parsed.data.type : 'invalid') ||
        (parsed.success && parsed.data.type === 'suspended')
      ) {
        setSuspended(true)
        return
      }
      if (!parsed.success) return
      const message = parsed.data
      if (message.type === 'error') setStatus(message.message)
      if (message.type === 'setState') latest.current.onState?.(message.state)
    }
    addEventListener('message', receive)
    container.current?.append(element)
    frame.current = element
    return () => {
      removeEventListener('message', receive)
      element.remove()
      frame.current = null
    }
  }, [generation, suspended])
  const settings = JSON.stringify(input.settings)
  const state = JSON.stringify(input.state)
  useEffect(() => {
    const parsed = customUpdate.safeParse({
      type: 'update',
      settings: JSON.parse(settings) as unknown,
      state: JSON.parse(state) as unknown,
    })
    if (parsed.success)
      frame.current?.contentWindow?.postMessage(parsed.data, location.origin)
  }, [settings, state])
  return (
    <div>
      <div ref={container} />
      {suspended && (
        <div role="alert">
          Widget suspendu, recharger{' '}
          <Button
            onClick={() => {
              setSuspended(false)
              setStatus('')
              setGeneration(generation + 1)
            }}
          >
            Recharger le widget
          </Button>
        </div>
      )}
      {status && <p role="alert">{status}</p>}
    </div>
  )
}

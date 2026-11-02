import { expect, test } from 'vitest'

import protocol from '../../src/lib/sandbox/protocol.txt?raw'
import runner from '../../src/lib/sandbox/runner.txt?raw'

const input = {
  type: 'init',
  html: '<output id="value">base</output>',
  css: '',
  js: 'widget.onUpdate(() => document.getElementById("value").textContent = String(widget.state.count)); widget.setState({count: 1});',
  state: {},
  settings: {},
  mode: 'preview',
  theme: 'light',
}
function receive(port: MessagePort, type: string) {
  return new Promise<MessageEvent<unknown>>((resolve) => {
    port.addEventListener(
      'message',
      function listener(event: MessageEvent<unknown>) {
        const value: unknown = event.data
        if (
          value &&
          typeof value === 'object' &&
          'type' in value &&
          value.type === type
        ) {
          port.removeEventListener('message', listener)
          resolve(event)
        }
      }
    )
    port.start()
  })
}
test('opaque runner accepts parent init once, rejects wrong origin/schema and keeps updates on its private port', async () => {
  const frame = document.createElement('iframe')
  frame.sandbox.add('allow-scripts')
  const loaded = new Promise<void>((resolve) => {
    frame.addEventListener('load', () => resolve(), { once: true })
  })
  frame.srcdoc = `<script>(()=>{${protocol}\n${runner.replace('__APP_ORIGIN__', JSON.stringify(location.origin))}})();</script>`
  document.body.append(frame)
  const channel = new MessageChannel()
  const wrong = new MessageChannel()
  try {
    await loaded
    if (!frame.contentWindow) throw new Error('Missing frame')
    // A synthetic event cannot forge source to the parent's WindowProxy.
    frame.contentWindow.postMessage({ type: 'init' }, '*', [wrong.port2])
    const ready = receive(channel.port1, 'ready')
    const state = receive(channel.port1, 'setState')
    frame.contentWindow.postMessage(input, '*', [channel.port2])
    await ready
    expect((await state).data).toEqual({
      type: 'setState',
      state: { count: 1 },
    })
    // The untrusted global postMessage path is deliberately inert after init.
    frame.contentWindow.postMessage(
      { type: 'update', state: { count: 999 }, settings: {} },
      '*'
    )
    frame.contentWindow.postMessage(
      { ...input, js: 'widget.setState({forged:true})' },
      '*'
    )
    const pong = receive(channel.port1, 'pong')
    channel.port1.postMessage({ type: 'ping' })
    await pong
    // Parent cannot access either document or persistent storage of this origin.
    expect(() => frame.contentWindow?.document).toThrow()
  } finally {
    channel.port1.close()
    wrong.port1.close()
    frame.remove()
  }
})

test('app boundary rejects forged origin/source and oversized state, renders errors as text and suspends a flood', async () => {
  const { render } = await import('vitest-browser-react')
  const { CustomFrame } = await import('../../src/features/gm/custom-frame')
  const { vi } = await import('vitest')
  const onState = vi.fn()
  const screen = await render(
    <CustomFrame
      input={{
        type: 'init',
        html: '',
        css: '',
        js: '',
        settings: {},
        state: {},
        mode: 'preview',
        theme: 'light',
      }}
      onState={onState}
    />
  )
  const frame = screen.getByTitle('Widget personnalisé isolé').element()
  if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow)
    throw new Error('Missing frame')
  const send = (
    data: unknown,
    origin = location.origin,
    source: Window = frame.contentWindow ?? window
  ) => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }))
  }
  send(
    { type: 'setState', state: { forged: true } },
    'https://wrong.example.com'
  )
  send({ type: 'setState', state: { forged: true } }, location.origin, window)
  send({ type: 'setState', state: 'x'.repeat(8193) })
  send({ type: 'setState', state: {}, extra: true })
  expect(onState).not.toHaveBeenCalled()
  send({ type: 'error', message: '<img src=x onerror=alert(1)>' })
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent('<img src=x onerror=alert(1)>')
  expect(document.querySelector('img[src="x"]')).toBeNull()
  for (let index = 0; index < 11; index++)
    send({ type: 'setState', state: { index } })
  await expect
    .element(screen.getByText('Widget suspendu, recharger', { exact: false }))
    .toBeVisible()
  expect(onState.mock.calls.length).toBeLessThanOrEqual(10)
})

test('real relay watchdog suspends a frame that never answers its private heartbeat', async () => {
  const { default: host } = await import('../../src/lib/sandbox/host.txt?raw')
  const relay = document.createElement('iframe')
  const loaded = new Promise<void>((resolve) => {
    relay.addEventListener('load', () => resolve(), { once: true })
  })
  const url = URL.createObjectURL(
    new Blob(
      [
        `<base href="${location.origin}/"><script>(()=>{${protocol}\n${host}})();</script>`,
      ],
      { type: 'text/html' }
    )
  )
  relay.src = url
  document.body.append(relay)
  try {
    await loaded
    const suspended = new Promise<void>((resolve) => {
      addEventListener(
        'message',
        function listener(event: MessageEvent<unknown>) {
          const value = event.data
          if (
            event.source === relay.contentWindow &&
            event.origin === location.origin &&
            value &&
            typeof value === 'object' &&
            'type' in value &&
            value.type === 'suspended'
          ) {
            removeEventListener('message', listener)
            resolve()
          }
        }
      )
    })
    relay.contentWindow?.postMessage(input, location.origin)
    await suspended
    expect(relay.contentDocument?.querySelector('iframe')).toBeNull()
  } finally {
    relay.remove()
    URL.revokeObjectURL(url)
  }
}, 15_000)

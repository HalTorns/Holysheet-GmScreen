import host from './host.txt?raw'
import protocol from './protocol.txt?raw'
import runner from './runner.txt?raw'

export async function sandboxDocument(kind: 'host' | 'runner', origin: string) {
  const script = `(() => {\n${protocol}\n${kind === 'host' ? host : runner.replace('__APP_ORIGIN__', JSON.stringify(origin))}\n})();`
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(script)
  )
  const hash = btoa(String.fromCodePoint(...new Uint8Array(digest)))
  const csp =
    kind === 'host'
      ? `default-src 'none'; script-src 'sha256-${hash}'; frame-src ${origin}/sandbox/runner; frame-ancestors 'self'; base-uri 'none'; form-action 'none'`
      : `default-src 'none'; script-src 'sha256-${hash}' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none'; worker-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'; webrtc 'block'`
  return new Response(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Sandbox ${kind} F8.1</title></head><body><script>${script}</script></body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': csp,
      },
    }
  )
}

// Disable every feature exposed by the supported Chromium, plus known cross-browser features.
export const sandboxPermissionsPolicy =
  'accelerometer aria-notify autoplay bluetooth browsing-topics camera captured-surface-control ch-device-memory ch-downlink ch-dpr ch-ect ch-prefers-color-scheme ch-prefers-reduced-motion ch-prefers-reduced-transparency ch-rtt ch-save-data ch-ua ch-ua-arch ch-ua-bitness ch-ua-form-factors ch-ua-full-version ch-ua-full-version-list ch-ua-high-entropy-values ch-ua-mobile ch-ua-model ch-ua-platform ch-ua-platform-version ch-ua-wow64 ch-viewport-height ch-viewport-width ch-width clipboard-read clipboard-write compute-pressure cross-origin-isolated deferred-fetch deferred-fetch-minimal digital-credentials-create digital-credentials-get display-capture encrypted-media fullscreen gamepad geolocation gyroscope hid identity-credentials-get idle-detection interest-cohort keyboard-map language-detector language-model local-fonts local-network local-network-access loopback-network magnetometer media-playback-while-not-visible microphone midi on-device-speech-recognition otp-credentials payment picture-in-picture private-state-token-issuance private-state-token-redemption publickey-credentials-create publickey-credentials-get screen-wake-lock serial speaker-selection storage-access summarizer sync-xhr translator unload usb web-share window-management xr-spatial-tracking'
    .split(' ')
    .map((feature) => `${feature}=()`)
    .join(', ')

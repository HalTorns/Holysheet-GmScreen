import { afterEach, expect, test, vi } from 'vitest'

import { internal } from '../../convex/_generated/api'
import { createBackendTest } from './fixtures'

const relay = vi.hoisted(() => ({
  sendMail: vi.fn(
    (_message: {
      from: { address: string }
      to: string
      subject: string
      text: string
    }) => Promise.resolve({ rejected: [] as string[] })
  ),
  close: vi.fn(),
  createTransport: vi.fn((_options: Record<string, unknown>) => ({})),
}))
vi.mock('nodemailer', () => ({
  createTransport: (options: Record<string, unknown>) => {
    relay.createTransport(options)
    return { sendMail: relay.sendMail, close: relay.close }
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

function configure(security: 'tls' | 'starttls') {
  vi.stubEnv('AUTH_EMAIL_PROVIDER', 'smtp')
  vi.stubEnv('AUTH_EMAIL_FROM', 'admin@holysheet.fr')
  vi.stubEnv('SMTP_HOST', 'smtp.example.test')
  vi.stubEnv('SMTP_PORT', security === 'tls' ? '465' : '587')
  vi.stubEnv('SMTP_SECURITY', security)
  vi.stubEnv('SMTP_USER', 'synthetic-user')
  vi.stubEnv('SMTP_PASSWORD', 'synthetic-relay-password')
  vi.stubEnv('SMTP_EHLO_NAME', 'gmscreen.holysheet.fr')
}

test.each(['tls', 'starttls'] as const)(
  'SMTP internal action enforces encryption and fixed sender (%s)',
  async (security) => {
    configure(security)
    const backend = createBackendTest()
    await backend.action(internal.smtp.deliver, {
      email: 'recipient@example.test',
      subject: 'Vérification',
      text: 'Synthetic authentication message.',
    })
    const options = relay.createTransport.mock.calls[0]?.[0]
    expect(options?.secure).toBe(security === 'tls')
    expect(options?.requireTLS).toBe(security === 'starttls')
    expect(options?.debug).toBe(false)
    expect(options?.disableFileAccess).toBe(true)
    expect(
      relay.sendMail.mock.calls[0]?.[0].from.address === 'admin@holysheet.fr'
    ).toBe(true)
    expect(relay.close).toHaveBeenCalledOnce()
  }
)

test('SMTP provider errors are sanitized and incomplete configuration cannot send', async () => {
  configure('tls')
  const backend = createBackendTest()
  relay.sendMail.mockRejectedValueOnce(
    new Error('Synthetic sensitive provider reply')
  )
  await expect(
    backend.action(internal.smtp.deliver, {
      email: 'recipient@example.test',
      subject: 'Test',
      text: 'Message',
    })
  ).rejects.toThrow('SMTP delivery failed.')
  expect(relay.close).toHaveBeenCalledOnce()
  vi.stubEnv('SMTP_PASSWORD', '')
  await expect(
    backend.action(internal.smtp.deliver, {
      email: 'recipient@example.test',
      subject: 'Test',
      text: 'Message',
    })
  ).rejects.toThrow('Configuration d’environnement invalide')
  expect(relay.sendMail).toHaveBeenCalledOnce()
})

test('SMTP refuses header injection before opening a transport', async () => {
  configure('tls')
  const backend = createBackendTest()
  await expect(
    backend.action(internal.smtp.deliver, {
      email: 'recipient@example.test',
      subject: 'Test\r\nBcc: other@example.test',
      text: 'Message',
    })
  ).rejects.toThrow('Invalid email message')
  expect(relay.createTransport).not.toHaveBeenCalled()
})

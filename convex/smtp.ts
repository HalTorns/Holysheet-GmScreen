'use node'

import { v } from 'convex/values'
import { createTransport } from 'nodemailer'

import { appConfig } from '../shared/app-config'
import { emailSchema } from '../shared/validation'
import { internalAction } from './_generated/server'
import { getEmailSettings, getSmtpSettings } from './lib/emailEnvironment'

export const deliver = internalAction({
  args: { email: v.string(), subject: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (_ctx, { email, subject, text }) => {
    const settings = getEmailSettings()
    if (settings.AUTH_EMAIL_PROVIDER !== 'smtp')
      throw new Error('SMTP is not configured.')
    const smtp = getSmtpSettings(settings)
    const secure = smtp.SMTP_SECURITY === 'tls'
    const recipient = emailSchema.safeParse(email)
    if (
      !recipient.success ||
      subject.length > 200 ||
      /[\r\n]/.test(subject) ||
      text.length > 16_384
    )
      throw new Error('Invalid email message.')
    const transport = createTransport({
      host: smtp.SMTP_HOST,
      port: smtp.SMTP_PORT,
      secure,
      requireTLS: !secure,
      tls: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
      auth: { user: smtp.SMTP_USER, pass: smtp.SMTP_PASSWORD },
      ...(smtp.SMTP_EHLO_NAME ? { name: smtp.SMTP_EHLO_NAME } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    })
    try {
      const result = await transport.sendMail({
        from: { name: appConfig.name, address: settings.AUTH_EMAIL_FROM },
        to: recipient.data,
        subject,
        text,
      })
      if (result.rejected.length > 0) throw new Error('Recipient rejected.')
    } catch {
      // Provider errors may contain recipients, credentials or message contents.
      throw new Error(
        'SMTP delivery failed. Check the private relay configuration and connectivity.'
      )
    } finally {
      transport.close()
    }
    return null
  },
})

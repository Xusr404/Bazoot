import nodemailer from 'nodemailer'
import { Mailer } from './Mailer.js'

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : [])

const categoryForSubject = (subject = '') => {
  const lower = subject.toLowerCase()

  if (lower.includes('verify')) return 'verification'
  if (lower.includes('reset')) return 'password-reset'
  if (lower.includes('invite') || lower.includes('invited')) return 'invitation'

  return 'general'
}

const normalizeSendResult = (info = {}) => ({
  provider: 'smtp',
  messageId: info.messageId ?? null,
  accepted: asArray(info.accepted),
  rejected: asArray(info.rejected),
})

// Real delivery through any SMTP relay (own mail server, Gmail app password,
// Mailgun/SendGrid/Postmark SMTP endpoints, …).
export class SmtpMailer extends Mailer {
  constructor({ host, port, secure, user, pass, from, timeoutMs = 10_000, transport }) {
    super()
    this.from = from
    this.transport =
      transport ??
      nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user ? { user, pass } : undefined,
        connectionTimeout: timeoutMs,
        greetingTimeout: timeoutMs,
        socketTimeout: timeoutMs,
      })
  }

  get provider() {
    return 'smtp'
  }

  get isConfigured() {
    return true
  }

  async verify() {
    if (typeof this.transport.verify !== 'function') {
      return true
    }

    await this.transport.verify()
    return true
  }

  async send({ to, subject, text, html }) {
    const category = categoryForSubject(subject)

    try {
      const info = await this.transport.sendMail({ from: this.from, to, subject, text, html })
      const result = normalizeSendResult(info)

      console.log(
        `[mail] provider=smtp category=${category} to=${to} messageId=${result.messageId ?? 'n/a'} accepted=${result.accepted.length} rejected=${result.rejected.length}`,
      )

      return result
    } catch (error) {
      console.error(`[mail] provider=smtp category=${category} to=${to} failed=${error.message}`)
      throw error
    }
  }
}

// Outbound email abstraction. SmtpMailer sends real mail; ConsoleMailer is the
// zero-config fallback that prints messages (incl. verification links) to the
// server console so the whole flow works without an SMTP account.
/* eslint-disable no-unused-vars */
export class Mailer {
  get provider() {
    return 'unknown'
  }

  /** Real delivery (true) vs console fallback (false). */
  get isConfigured() {
    return false
  }

  /** @param {{ to: string, subject: string, text: string, html?: string }} message */
  async send(message) {
    throw new Error('Not implemented')
  }
}

export class ConsoleMailer extends Mailer {
  get provider() {
    return 'console'
  }

  async send({ to, subject, text }) {
    console.log(
      [
        '┌─ [mail] (console mode — configure MAIL_PROVIDER=smtp + SMTP_* in server/.env for real delivery)',
        `│ To:      ${to}`,
        `│ Subject: ${subject}`,
        ...text.split('\n').map((line) => `│ ${line}`),
        '└─',
      ].join('\n'),
    )

    return { provider: this.provider, messageId: null, accepted: [to], rejected: [] }
  }
}

/** Test double: records every message instead of sending. */
export class CapturingMailer extends Mailer {
  constructor() {
    super()
    this.sent = []
  }

  get isConfigured() {
    return true
  }

  get provider() {
    return 'capture'
  }

  async send(message) {
    this.sent.push(message)
    return { provider: this.provider, messageId: null, accepted: [message.to], rejected: [] }
  }
}

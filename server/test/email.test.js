import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CapturingMailer, ConsoleMailer } from '../src/email/Mailer.js'
import { SmtpMailer } from '../src/email/SmtpMailer.js'
import { createMailer, resolveMailConfig } from '../src/email/createMailer.js'

const baseEnv = {
  mailProvider: 'auto',
  smtpHost: '',
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: '',
  smtpPass: '',
  smtpTimeoutMs: 10_000,
  mailFrom: 'Bazoot <no-reply@example.com>',
  emailVerification: 'auto',
}

describe('createMailer', () => {
  it('uses console mode when MAIL_PROVIDER=auto and SMTP is not configured', () => {
    const { mailer, mailProvider, mailConfigured, requireVerification } = createMailer(baseEnv)

    assert.equal(mailer instanceof ConsoleMailer, true)
    assert.equal(mailProvider, 'console')
    assert.equal(mailConfigured, false)
    assert.equal(requireVerification, false)
  })

  it('uses SMTP when MAIL_PROVIDER=auto and SMTP_HOST is configured', () => {
    const { mailer, mailProvider, mailConfigured, requireVerification } = createMailer({
      ...baseEnv,
      smtpHost: 'email-smtp.eu-central-1.amazonaws.com',
      smtpUser: 'AKIA...',
      smtpPass: 'secret',
    })

    assert.equal(mailer instanceof SmtpMailer, true)
    assert.equal(mailProvider, 'smtp')
    assert.equal(mailConfigured, true)
    assert.equal(requireVerification, true)
  })

  it('forces console mode when MAIL_PROVIDER=console even if SMTP exists', () => {
    const { mailer, mailProvider, mailConfigured, requireVerification } = createMailer({
      ...baseEnv,
      mailProvider: 'console',
      smtpHost: 'smtp.example.com',
    })

    assert.equal(mailer instanceof ConsoleMailer, true)
    assert.equal(mailProvider, 'console')
    assert.equal(mailConfigured, false)
    assert.equal(requireVerification, false)
  })

  it('reports a warning when MAIL_PROVIDER=smtp is missing SMTP_HOST', () => {
    const { mailer, mailProvider, mailConfigured, mailWarnings } = createMailer({
      ...baseEnv,
      mailProvider: 'smtp',
    })

    assert.equal(mailer instanceof ConsoleMailer, true)
    assert.equal(mailProvider, 'console')
    assert.equal(mailConfigured, false)
    assert.deepEqual(mailWarnings, [
      'MAIL_PROVIDER=smtp requires SMTP_HOST; using console mailer until SMTP is configured',
    ])
  })

  it('normalizes unknown provider values to auto with a warning', () => {
    assert.deepEqual(resolveMailConfig({ ...baseEnv, mailProvider: 'sendgrid' }), {
      requestedProvider: 'auto',
      provider: 'console',
      configured: false,
      warnings: ['Unknown MAIL_PROVIDER="sendgrid", using auto'],
    })
  })
})

describe('Mailer implementations', () => {
  it('returns normalized results from CapturingMailer', async () => {
    const mailer = new CapturingMailer()
    const message = { to: 'user@example.com', subject: 'Hello', text: 'Body' }

    const result = await mailer.send(message)

    assert.deepEqual(result, {
      provider: 'capture',
      messageId: null,
      accepted: ['user@example.com'],
      rejected: [],
    })
    assert.deepEqual(mailer.sent, [message])
  })

  it('returns normalized results from SmtpMailer and verifies transport', async () => {
    let verified = false
    const mailer = new SmtpMailer({
      from: 'Bazoot <no-reply@example.com>',
      transport: {
        async verify() {
          verified = true
        },
        async sendMail(message) {
          assert.equal(message.from, 'Bazoot <no-reply@example.com>')
          assert.equal(message.to, 'user@example.com')
          return {
            messageId: '<smtp-123@example.com>',
            accepted: ['user@example.com'],
            rejected: [],
          }
        },
      },
    })

    const originalLog = console.log
    console.log = () => {}

    try {
      assert.equal(await mailer.verify(), true)
      const result = await mailer.send({
        to: 'user@example.com',
        subject: 'Reset your Bazoot password',
        text: 'Body',
      })

      assert.equal(verified, true)
      assert.deepEqual(result, {
        provider: 'smtp',
        messageId: '<smtp-123@example.com>',
        accepted: ['user@example.com'],
        rejected: [],
      })
    } finally {
      console.log = originalLog
    }
  })
})

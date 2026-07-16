import { ConsoleMailer } from './Mailer.js'
import { SmtpMailer } from './SmtpMailer.js'

const VALID_MAIL_PROVIDERS = new Set(['auto', 'console', 'smtp'])

const normalizedProvider = (value) => {
  const provider = String(value || 'auto').toLowerCase()

  return VALID_MAIL_PROVIDERS.has(provider) ? provider : 'auto'
}

export const resolveMailConfig = (env) => {
  const requestedProvider = normalizedProvider(env.mailProvider)
  const warnings = []

  if (env.mailProvider && requestedProvider !== String(env.mailProvider).toLowerCase()) {
    warnings.push(`Unknown MAIL_PROVIDER="${env.mailProvider}", using auto`)
  }

  if (requestedProvider === 'console') {
    return { requestedProvider, provider: 'console', configured: false, warnings }
  }

  if (requestedProvider === 'smtp' && !env.smtpHost) {
    warnings.push('MAIL_PROVIDER=smtp requires SMTP_HOST; using console mailer until SMTP is configured')
    return { requestedProvider, provider: 'console', configured: false, warnings }
  }

  if (requestedProvider === 'smtp' || env.smtpHost) {
    return { requestedProvider, provider: 'smtp', configured: true, warnings }
  }

  return { requestedProvider, provider: 'console', configured: false, warnings }
}

// Mailer + verification policy from env (Phase 9D style: all config in one place).
//
// EMAIL_VERIFICATION modes:
//   auto (default) - enforce verification only when real mail is configured
//   on             - always enforce (links go to the console without SMTP)
//   off            - never enforce (accounts are active immediately)
export const createMailer = (env) => {
  const mailConfig = resolveMailConfig(env)
  const mailer = mailConfig.provider === 'smtp'
    ? new SmtpMailer({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpSecure,
        user: env.smtpUser,
        pass: env.smtpPass,
        from: env.mailFrom,
        timeoutMs: env.smtpTimeoutMs,
      })
    : new ConsoleMailer()

  const requireVerification =
    env.emailVerification === 'on' ||
    (env.emailVerification !== 'off' && mailer.isConfigured)

  return {
    mailer,
    requireVerification,
    mailProvider: mailConfig.provider,
    mailConfigured: mailer.isConfigured,
    mailWarnings: mailConfig.warnings,
  }
}

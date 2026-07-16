const FIELD_PATTERNS = {
  username: /\b(username|nickname)\b|player already connected/i,
  email: /\bemail\b/i,
  password: /\bpassword\b/i,
  organization: /\b(organization|workspace)\b/i,
  invitation: /\b(pin|invitation)\b|game not found/i,
  identifier: /\b(account|username|email)\b/i,
  subject: /\b(subject|quiz title)\b/i,
}

export const hasFieldError = (message, field) =>
  Boolean(message && FIELD_PATTERNS[field]?.test(String(message)))

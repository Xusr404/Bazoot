// Email templates. Plain text first (always works), simple HTML variant.

export const verificationEmail = ({ username, verifyUrl }) => ({
  subject: 'Verify your Bazoot manager account',
  text: [
    `Hi ${username},`,
    '',
    'a manager account was created for you on Bazoot.',
    'Click the link below to verify your email address and activate the account:',
    '',
    verifyUrl,
    '',
    'The link is valid for 24 hours. If you did not expect this email, ignore it.',
  ].join('\n'),
  html: [
    `<p>Hi ${username},</p>`,
    '<p>a manager account was created for you on <strong>Bazoot</strong>.</p>',
    '<p>Click the button below to verify your email address and activate the account:</p>',
    `<p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#ff9900;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:6px">Verify email</a></p>`,
    `<p>Or open this link: <a href="${verifyUrl}">${verifyUrl}</a></p>`,
    '<p>The link is valid for 24 hours. If you did not expect this email, ignore it.</p>',
  ].join('\n'),
})

export const passwordResetEmail = ({ username, resetUrl }) => ({
  subject: 'Reset your Bazoot password',
  text: [
    `Hi ${username},`,
    '',
    'we received a request to reset the password for your Bazoot manager account.',
    'Click the link below to choose a new password:',
    '',
    resetUrl,
    '',
    'The link is valid for 1 hour. If you did not request this, ignore this email —',
    'your password stays unchanged.',
  ].join('\n'),
  html: [
    `<p>Hi ${username},</p>`,
    '<p>we received a request to reset the password for your <strong>Bazoot</strong> manager account.</p>',
    '<p>Click the button below to choose a new password:</p>',
    `<p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#ff9900;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:6px">Reset password</a></p>`,
    `<p>Or open this link: <a href="${resetUrl}">${resetUrl}</a></p>`,
    '<p>The link is valid for 1 hour. If you did not request this, ignore this email — your password stays unchanged.</p>',
  ].join('\n'),
})

export const invitationEmail = ({ inviteUrl, role }) => ({
  subject: 'You are invited to Bazoot',
  text: [
    'You have been invited to join Bazoot.',
    '',
    `Your assigned role is ${role}.`,
    'Open the invitation link below to accept:',
    '',
    inviteUrl,
    '',
    'The link is valid for 24 hours. If you did not expect this email, ignore it.',
  ].join('\n'),
  html: [
    '<p>You have been invited to join <strong>Bazoot</strong>.</p>',
    `<p>Your assigned role is <strong>${role}</strong>.</p>`,
    '<p>Open the invitation below to accept:</p>',
    `<p><a href="${inviteUrl}" style="display:inline-block;padding:12px 24px;background:#ff9900;color:#ffffff;font-weight:bold;text-decoration:none;border-radius:6px">Accept invitation</a></p>`,
    `<p>Or open this link: <a href="${inviteUrl}">${inviteUrl}</a></p>`,
    '<p>The link is valid for 24 hours. If you did not expect this email, ignore it.</p>',
  ].join('\n'),
})

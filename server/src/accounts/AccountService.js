import {
  validateEmail,
  validateManagerPassword,
  validateManagerUsername,
} from '@bazoot/shared/validation'
import crypto from 'node:crypto'
import { ConsoleMailer } from '../email/Mailer.js'
import { invitationEmail, passwordResetEmail, verificationEmail } from '../email/templates.js'
import { GameError } from '../utils/errors.js'
import { hashPassword, verifyPassword } from './passwords.js'

const RESEND_COOLDOWN_MS = 60_000
const RESET_COOLDOWN_MS = 60_000
const ACCOUNT_ROLES = new Set(['owner', 'admin', 'editor'])

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

// Verified unless explicitly false — accounts created before the email feature
// (or with verification disabled) stay usable.
const isVerified = (account) => account.emailVerified !== false
// For installations created before roles existed, preserve one administrator
// without granting admin access to every legacy account.
const accountRole = (account, accounts) =>
  account.role ?? (accounts.indexOf(account) === 0 ? 'admin' : 'editor')

const organizationSlug = (name) =>
  String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'organization'

const validateOrganizationName = (name) => {
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) {
    throw new GameError('Organization name must be 2–80 characters')
  }
}

const validateRole = (role) => {
  if (!ACCOUNT_ROLES.has(role)) {
    throw new GameError('Invalid account role')
  }
}

// All account rules in one place; socket handlers stay thin. Every method
// throws GameError for rule violations (forwarded to the client as a toast).
export class AccountService {
  constructor({
    store,
    sessions,
    mailer = new ConsoleMailer(),
    requireVerification = false,
    allowRegistration = false,
    publicUrl = 'http://localhost:5005',
    verificationTtlMs = 24 * 60 * 60 * 1000,
    passwordResetTtlMs = 60 * 60 * 1000,
  }) {
    this.store = store
    this.sessions = sessions
    this.mailer = mailer
    this.requireVerification = requireVerification
    this.allowRegistration = allowRegistration
    this.publicUrl = publicUrl.replace(/\/$/, '')
    this.verificationTtlMs = verificationTtlMs
    this.passwordResetTtlMs = passwordResetTtlMs
    this.mutationQueue = Promise.resolve()
  }

  /**
   * Serialises all load-modify-save mutations so concurrent requests (two
   * sockets racing first-run setup, double-clicked submits) can never lose
   * writes or create duplicate accounts.
   */
  runExclusive(operation) {
    const result = this.mutationQueue.then(operation)
    this.mutationQueue = result.catch(() => {})

    return result
  }

  setAllowRegistration(allowRegistration) {
    this.allowRegistration = allowRegistration
  }

  async hasAccounts() {
    return (await this.store.load()).length > 0
  }

  async organizationState() {
    const accounts = await this.store.load()
    let organizations = await this.store.loadOrganizations()
    let memberships = await this.store.loadMemberships()
    let invitations = await this.store.loadInvitations()

    if (accounts.length > 0 && organizations.length === 0) {
      const createdAt = accounts[0].createdAt ?? new Date().toISOString()
      const organization = {
        id: crypto.randomUUID(),
        name: 'Bazoot Workspace',
        slug: 'bazoot-workspace',
        createdBy: accounts[0].username,
        createdAt,
      }

      organizations = [organization]
      memberships = accounts.map((account, index) => ({
        organizationId: organization.id,
        username: account.username,
        role: index === 0 ? 'owner' : accountRole(account, accounts),
        joinedAt: account.createdAt ?? createdAt,
      }))
      invitations = invitations.map((invitation) => ({
        ...invitation,
        organizationId: invitation.organizationId ?? organization.id,
      }))

      await this.store.saveOrganizations(organizations)
      await this.store.saveMemberships(memberships)
      await this.store.saveInvitations(invitations)
    }

    return { accounts, organizations, memberships, invitations }
  }

  async organizationsFor(username) {
    const { organizations, memberships } = await this.organizationState()
    const roles = new Map(
      memberships
        .filter((membership) => membership.username === username)
        .map((membership) => [membership.organizationId, membership.role]),
    )

    return organizations
      .filter((organization) => roles.has(organization.id))
      .map((organization) => ({ ...organization, role: roles.get(organization.id) }))
  }

  async legacyOrganizationId() {
    const { organizations } = await this.organizationState()

    return organizations[0]?.id ?? null
  }

  async organizationContext(username, organizationId, { strict = false } = {}) {
    const organizations = await this.organizationsFor(username)
    const requested = organizations.find((candidate) => candidate.id === organizationId)

    if (strict && organizationId && !requested) {
      throw new GameError('You do not belong to that organization')
    }

    const organization = requested ?? organizations[0] ?? null

    return { organizations, organization, role: organization?.role ?? null }
  }

  async createOrganization(username, name) {
    validateOrganizationName(name)

    return this.runExclusive(async () => {
      const { organizations, memberships } = await this.organizationState()
      const base = organizationSlug(name)
      let slug = base
      let suffix = 2

      while (organizations.some((organization) => organization.slug === slug)) {
        slug = `${base}-${suffix}`
        suffix += 1
      }

      const organization = {
        id: crypto.randomUUID(),
        name: name.trim(),
        slug,
        createdBy: username,
        createdAt: new Date().toISOString(),
      }

      organizations.push(organization)
      memberships.push({
        organizationId: organization.id,
        username,
        role: 'owner',
        joinedAt: organization.createdAt,
      })
      await this.store.saveOrganizations(organizations)
      await this.store.saveMemberships(memberships)

      return { ...organization, role: 'owner' }
    })
  }

  async renameOrganization(username, organizationId, name) {
    validateOrganizationName(name)

    return this.runExclusive(async () => {
      const { organizations, memberships } = await this.organizationState()
      const membership = memberships.find(
        (candidate) =>
          candidate.username === username && candidate.organizationId === organizationId,
      )

      if (membership?.role !== 'owner') {
        throw new GameError('Only organization owners can rename this workspace')
      }

      const organization = organizations.find((candidate) => candidate.id === organizationId)

      if (!organization) {
        throw new GameError('Organization not found')
      }

      const base = organizationSlug(name)
      let slug = base
      let suffix = 2

      while (organizations.some((candidate) => candidate !== organization && candidate.slug === slug)) {
        slug = `${base}-${suffix}`
        suffix += 1
      }

      organization.name = name.trim()
      organization.slug = slug
      await this.store.saveOrganizations(organizations)

      return { ...organization, role: membership.role }
    })
  }

  async leaveOrganization(username, organizationId) {
    return this.runExclusive(async () => {
      const { memberships } = await this.organizationState()
      const membership = memberships.find(
        (candidate) =>
          candidate.username === username && candidate.organizationId === organizationId,
      )

      if (!membership) {
        throw new GameError('You do not belong to that organization')
      }

      if (memberships.filter((candidate) => candidate.username === username).length <= 1) {
        throw new GameError('Create or join another workspace before leaving this one')
      }

      if (
        membership.role === 'owner' &&
        !memberships.some(
          (candidate) =>
            candidate !== membership &&
            candidate.organizationId === organizationId &&
            candidate.role === 'owner',
        )
      ) {
        throw new GameError('Assign another owner before leaving this workspace')
      }

      await this.store.saveMemberships(memberships.filter((candidate) => candidate !== membership))

      return this.organizationContext(username)
    })
  }

  async deleteOrganization(username, organizationId) {
    return this.runExclusive(async () => {
      const { accounts, organizations, memberships, invitations } = await this.organizationState()
      const membership = memberships.find(
        (candidate) =>
          candidate.username === username && candidate.organizationId === organizationId,
      )

      if (membership?.role !== 'owner') {
        throw new GameError('Only organization owners can delete this workspace')
      }

      if (memberships.filter((candidate) => candidate.username === username).length <= 1) {
        throw new GameError('Create or join another workspace before deleting this one')
      }

      const remainingMemberships = memberships.filter(
        (candidate) => candidate.organizationId !== organizationId,
      )
      const activeUsernames = new Set(remainingMemberships.map((candidate) => candidate.username))
      const removedAccounts = accounts.filter((account) => !activeUsernames.has(account.username))

      await this.store.saveOrganizations(
        organizations.filter((organization) => organization.id !== organizationId),
      )
      await this.store.saveMemberships(remainingMemberships)
      await this.store.saveInvitations(
        invitations.filter((invitation) => invitation.organizationId !== organizationId),
      )
      await this.store.save(accounts.filter((account) => activeUsernames.has(account.username)))

      for (const account of removedAccounts) {
        this.sessions.revokeAllFor(account.username)
      }

      return this.organizationContext(username)
    })
  }

  async listAccounts(organizationId) {
    const accounts = await this.store.load()
    const { memberships } = await this.organizationState()
    const scopedMemberships = organizationId
      ? memberships.filter((membership) => membership.organizationId === organizationId)
      : memberships
    const roles = new Map(scopedMemberships.map((membership) => [membership.username, membership.role]))

    return accounts.filter((account) => roles.has(account.username)).map((account) => ({
      username: account.username,
      email: account.email,
      emailVerified: isVerified(account),
      role: roles.get(account.username) ?? accountRole(account, accounts),
      approvalPending: account.approvalPending === true,
      createdAt: account.createdAt,
    }))
  }

  async listInvitations(organizationId) {
    const now = Date.now()
    await this.organizationState()

    return (await this.store.loadInvitations())
      .filter(
        (invitation) =>
          invitation.expiresAt > now &&
          (!organizationId || invitation.organizationId === organizationId),
      )
      .map(({ email, role, createdAt, expiresAt, existingAccount }) => ({
        email,
        role,
        createdAt,
        expiresAt,
        existingAccount,
      }))
  }

  async roleFor(username, organizationId) {
    const { role } = await this.organizationContext(username, organizationId)

    return role
  }

  validateCredentialShape(username, password) {
    const usernameResult = validateManagerUsername(username)

    if (!usernameResult.ok) {
      throw new GameError(usernameResult.message)
    }

    const passwordResult = validateManagerPassword(password)

    if (!passwordResult.ok) {
      throw new GameError(passwordResult.message)
    }
  }

  /**
   * Create an account. With verification enabled, an email address is required
   * and the account stays locked until the emailed link is confirmed —
   * `exemptFromVerification` skips that (first-run setup: whoever can run setup
   * already owns the server, so verifying them adds nothing).
   */
  async createAccount(
    username,
    password,
    email,
    { exemptFromVerification = false, role = 'editor', organizationId = undefined } = {},
  ) {
    this.validateCredentialShape(username, password)
    validateRole(role)

    const needsVerification = this.requireVerification && !exemptFromVerification

    if (needsVerification && !email) {
      throw new GameError('An email address is required')
    }

    if (email) {
      const emailResult = validateEmail(email)

      if (!emailResult.ok) {
        throw new GameError(emailResult.message)
      }
    }

    return this.runExclusive(() =>
      this.createAccountLocked(username, password, email, needsVerification, role, organizationId),
    )
  }

  /** Body of createAccount — must only run inside runExclusive. */
  async createAccountLocked(
    username,
    password,
    email,
    needsVerification,
    role = 'editor',
    organizationId = undefined,
    isSuperAdmin = false,
  ) {
    const accounts = await this.store.load()

    if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) {
      throw new GameError('This username is already taken')
    }

    if (email && accounts.some((a) => a.email?.toLowerCase() === email.toLowerCase())) {
      throw new GameError('This email is already in use')
    }

    const { salt, hash } = await hashPassword(password)
    const account = {
      username,
      salt,
      hash,
      email: email || undefined,
      emailVerified: !needsVerification,
      role,
      isSuperAdmin,
      createdAt: new Date().toISOString(),
    }

    if (needsVerification) {
      await this.issueVerification(account)
    }

    accounts.push(account)
    await this.store.save(accounts)

    const targetOrganizationId =
      organizationId === undefined ? (await this.store.loadOrganizations())[0]?.id : organizationId

    if (targetOrganizationId) {
      const memberships = await this.store.loadMemberships()
      memberships.push({
        organizationId: targetOrganizationId,
        username,
        role,
        joinedAt: account.createdAt,
      })
      await this.store.saveMemberships(memberships)
    }
  }

  /** First-run bootstrap: only allowed while no account exists (race-safe). */
  async setupInitial(username, password, email, sessionMetadata) {
    this.validateCredentialShape(username, password)

    if (email) {
      const emailResult = validateEmail(email)

      if (!emailResult.ok) {
        throw new GameError(emailResult.message)
      }
    }

    return this.runExclusive(async () => {
      if ((await this.store.load()).length > 0) {
        throw new GameError('Setup is already complete')
      }

      await this.createAccountLocked(username, password, email, false, 'admin', undefined, true)
      const organization = {
        id: crypto.randomUUID(),
        name: 'Bazoot Workspace',
        slug: 'bazoot-workspace',
        createdBy: username,
        createdAt: new Date().toISOString(),
      }
      await this.store.saveOrganizations([organization])
      await this.store.saveMemberships([
        {
          organizationId: organization.id,
          username,
          role: 'owner',
          joinedAt: organization.createdAt,
        },
      ])

      return {
        token: this.sessions.create(username, sessionMetadata),
        username,
        role: 'owner',
        organization: { ...organization, role: 'owner' },
        organizations: [{ ...organization, role: 'owner' }],
      }
    })
  }

  /**
   * Public self-registration. Gated by `allowRegistration`; registered accounts
   * are editors and follow the same validation, uniqueness, and verification
   * rules as accounts created by an admin.
   */
  async register(username, password, email, organizationName) {
    if (!this.allowRegistration) {
      throw new GameError('Registration is not open on this server')
    }

    validateOrganizationName(organizationName)
    await this.createAccount(username, password, email, { organizationId: null })
    await this.createOrganization(username, organizationName)
  }

  async createInvitation(email, role = 'editor', organizationId) {
    const emailResult = validateEmail(email)

    if (!emailResult.ok) {
      throw new GameError(emailResult.message)
    }

    validateRole(role)

    return this.runExclusive(async () => {
      const { accounts, organizations, memberships } = await this.organizationState()
      const targetOrganizationId = organizationId ?? organizations[0]?.id

      if (!targetOrganizationId) {
        throw new GameError('Create an organization before inviting people')
      }

      const normalizedEmail = email.toLowerCase()
      const account = accounts.find((candidate) => candidate.email?.toLowerCase() === normalizedEmail)

      if (
        account &&
        memberships.some(
          (membership) =>
            membership.organizationId === targetOrganizationId &&
            membership.username === account.username,
        )
      ) {
        throw new GameError('This account is already a member of the organization')
      }

      if (account?.approvalPending) {
        throw new GameError('This account is already waiting for approval')
      }

      const invitations = (await this.store.loadInvitations()).filter(
        (invitation) =>
          invitation.expiresAt > Date.now() &&
          !(
            invitation.email.toLowerCase() === normalizedEmail &&
            invitation.organizationId === targetOrganizationId
          ),
      )
      const token = crypto.randomBytes(32).toString('hex')
      const invitation = {
        email,
        role,
        organizationId: targetOrganizationId,
        existingAccount: Boolean(account),
        tokenHash: sha256(token),
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + this.verificationTtlMs,
      }
      const inviteUrl = `${this.publicUrl}/manager/invite?token=${token}`

      try {
        await this.mailer.send({ to: email, ...invitationEmail({ inviteUrl, role: invitation.role }) })
      } catch (error) {
        console.error('Invitation email failed:', error.message)
        throw new GameError('Could not send the invitation email — check the server mail settings')
      }

      invitations.push(invitation)
      await this.store.saveInvitations(invitations)

      return {
        email,
        role: invitation.role,
        organizationId: targetOrganizationId,
        inviteUrl,
        existingAccount: invitation.existingAccount,
      }
    })
  }

  async cancelInvitation(email, organizationId) {
    if (typeof email !== 'string' || email.trim().length === 0) {
      throw new GameError('An email is required to cancel an invitation')
    }

    const normalizedEmail = email.toLowerCase()

    return this.runExclusive(async () => {
      const { organizations } = await this.organizationState()
      const targetOrganizationId = organizationId ?? organizations[0]?.id
      const invitations = await this.store.loadInvitations()
      const remaining = invitations.filter(
        (invitation) =>
          invitation.email.toLowerCase() !== normalizedEmail ||
          (targetOrganizationId && invitation.organizationId !== targetOrganizationId),
      )

      if (remaining.length === invitations.length) {
        throw new GameError('No pending invitation for that email')
      }

      await this.store.saveInvitations(remaining)

      return { email }
    })
  }

  async inspectInvitation(token) {
    if (typeof token !== 'string' || token.length === 0) {
      throw new GameError('This invitation link is incomplete')
    }

    await this.organizationState()
    const invitation = (await this.store.loadInvitations()).find(
      (candidate) => candidate.tokenHash === sha256(token),
    )

    if (!invitation) {
      throw new GameError('This invitation link is invalid or has already been used')
    }

    if (invitation.expiresAt <= Date.now()) {
      throw new GameError('This invitation link has expired')
    }

    const organization = (await this.store.loadOrganizations()).find(
      (candidate) => candidate.id === invitation.organizationId,
    )

    return {
      email: invitation.email,
      role: invitation.role,
      existingAccount: invitation.existingAccount,
      organization: organization
        ? { id: organization.id, name: organization.name, slug: organization.slug }
        : null,
    }
  }

  async acceptInvitation(token, username, password) {
    if (typeof token !== 'string' || token.length === 0) {
      throw new GameError('This invitation link is incomplete')
    }

    return this.runExclusive(async () => {
      await this.organizationState()
      const tokenHash = sha256(token)
      const invitations = await this.store.loadInvitations()
      const invitation = invitations.find((candidate) => candidate.tokenHash === tokenHash)

      if (!invitation) {
        throw new GameError('This invitation link is invalid or has already been used')
      }

      if (invitation.expiresAt <= Date.now()) {
        throw new GameError('This invitation link has expired')
      }

      const accounts = await this.store.load()
      const account = accounts.find(
        (candidate) => candidate.email?.toLowerCase() === invitation.email.toLowerCase(),
      )

      if (account) {
        account.emailVerified = true
        account.approvalPending = false
        account.verification = undefined
        await this.store.save(accounts)
        const memberships = await this.store.loadMemberships()

        if (
          !memberships.some(
            (membership) =>
              membership.organizationId === invitation.organizationId &&
              membership.username === account.username,
          )
        ) {
          memberships.push({
            organizationId: invitation.organizationId,
            username: account.username,
            role: invitation.role,
            joinedAt: new Date().toISOString(),
          })
          await this.store.saveMemberships(memberships)
        }
        await this.store.saveInvitations(
          invitations.filter((candidate) => candidate !== invitation),
        )

        return { state: 'active', username: account.username }
      }

      this.validateCredentialShape(username, password)

      if (accounts.some((candidate) => candidate.username.toLowerCase() === username.toLowerCase())) {
        throw new GameError('This username is already taken')
      }

      const { salt, hash } = await hashPassword(password)
      accounts.push({
        username,
        salt,
        hash,
        email: invitation.email,
        emailVerified: true,
        approvalPending: true,
        role: invitation.role,
        createdAt: new Date().toISOString(),
      })
      await this.store.save(accounts)
      const memberships = await this.store.loadMemberships()
      memberships.push({
        organizationId: invitation.organizationId,
        username,
        role: invitation.role,
        joinedAt: new Date().toISOString(),
      })
      await this.store.saveMemberships(memberships)
      await this.store.saveInvitations(invitations.filter((candidate) => candidate !== invitation))

      return { state: 'pending', username }
    })
  }

  async approveAccount(username, organizationId) {
    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const account = accounts.find((candidate) => candidate.username === username)

      if (!account) {
        throw new GameError('Account not found')
      }

      if (organizationId) {
        const memberships = await this.store.loadMemberships()

        if (
          !memberships.some(
            (membership) =>
              membership.organizationId === organizationId && membership.username === username,
          )
        ) {
          throw new GameError('Account is not a member of this organization')
        }
      }

      if (!account.approvalPending) {
        throw new GameError('This account is already active')
      }

      account.approvalPending = false
      await this.store.save(accounts)
    })
  }

  /** Generates a fresh token, stores its hash on the account, sends the mail. */
  async issueVerification(account) {
    const token = crypto.randomBytes(32).toString('hex')

    account.verification = {
      tokenHash: sha256(token),
      expiresAt: Date.now() + this.verificationTtlMs,
      lastSentAt: Date.now(),
    }

    const verifyUrl = `${this.publicUrl}/manager/verify?token=${token}`

    try {
      await this.mailer.send({ to: account.email, ...verificationEmail({ username: account.username, verifyUrl }) })
    } catch (error) {
      console.error('Verification email failed:', error.message)
      throw new GameError('Could not send the verification email — check the server mail settings')
    }
  }

  /**
   * Confirms a verification link.
   * The token hash is kept (marked used) after success so a re-clicked email
   * link can answer "already verified" instead of a scary error.
   * @returns {Promise<{ username: string, alreadyVerified: boolean }>}
   */
  async verifyEmail(token) {
    if (typeof token !== 'string' || token.length === 0) {
      throw new GameError('This verification link is incomplete')
    }

    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const tokenHash = sha256(token)
      const account = accounts.find((a) => a.verification?.tokenHash === tokenHash)

      if (!account) {
        throw new GameError(
          'This verification link is invalid or has been replaced by a newer one',
        )
      }

      if (isVerified(account)) {
        return { username: account.username, alreadyVerified: true }
      }

      if (account.verification.expiresAt <= Date.now()) {
        throw new GameError('This verification link has expired — request a new one')
      }

      account.emailVerified = true
      account.verification = { tokenHash, usedAt: Date.now() }
      await this.store.save(accounts)

      return { username: account.username, alreadyVerified: false }
    })
  }

  /**
   * Sends a fresh verification email. Silently succeeds for unknown/verified
   * accounts so usernames and emails cannot be probed.
   */
  async resendVerification(identifier) {
    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const needle = String(identifier ?? '').toLowerCase()
      const account = accounts.find(
        (a) => a.username.toLowerCase() === needle || a.email?.toLowerCase() === needle,
      )

      if (!account || isVerified(account) || !account.email) {
        return
      }

      const lastSentAt = account.verification?.lastSentAt ?? 0

      if (Date.now() - lastSentAt < RESEND_COOLDOWN_MS) {
        throw new GameError('Please wait a minute before requesting another email')
      }

      await this.issueVerification(account)
      await this.store.save(accounts)
    })
  }

  /**
   * Corrects the email of a NOT-yet-verified account (typo rescue) and sends a
   * fresh verification link to the new address immediately (no cooldown — the
   * old address never worked).
   */
  async changeEmail(username, newEmail, organizationId) {
    const emailResult = validateEmail(newEmail)

    if (!emailResult.ok) {
      throw new GameError(emailResult.message)
    }

    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const account = accounts.find((a) => a.username === username)

      if (!account) {
        throw new GameError('Account not found')
      }

      if (organizationId) {
        const memberships = await this.store.loadMemberships()

        if (
          !memberships.some(
            (membership) =>
              membership.organizationId === organizationId && membership.username === username,
          )
        ) {
          throw new GameError('Account is not a member of this organization')
        }
      }

      if (isVerified(account)) {
        throw new GameError('This account is already verified — its email cannot be changed here')
      }

      if (
        accounts.some(
          (a) => a !== account && a.email?.toLowerCase() === newEmail.toLowerCase(),
        )
      ) {
        throw new GameError('This email is already in use')
      }

      account.email = newEmail
      await this.issueVerification(account)
      await this.store.save(accounts)
    })
  }

  /** @returns {Promise<{ token: string, username: string }>} */
  async login(username, password, sessionMetadata) {
    const accounts = await this.store.load()
    const account = accounts.find((a) => a.username.toLowerCase() === String(username).toLowerCase())

    // Same error for unknown user and wrong password — no username probing.
    if (!account || !(await verifyPassword(String(password), account.salt, account.hash))) {
      throw new GameError('Invalid username or password')
    }

    if (!isVerified(account)) {
      throw new GameError(
        'Email not verified — check your inbox or request a new link',
        'EMAIL_UNVERIFIED',
      )
    }

    if (account.approvalPending) {
      throw new GameError('Your invitation is waiting for admin approval', 'APPROVAL_PENDING')
    }

    const context = await this.organizationContext(account.username)

    return {
      token: this.sessions.create(account.username, sessionMetadata),
      username: account.username,
      role: context.role,
      organization: context.organization,
      organizations: context.organizations,
    }
  }

  /** @returns {string | null} username for a live session token */
  resume(token, sessionMetadata) {
    return this.sessions.resolve(token, sessionMetadata)
  }

  logout(token) {
    this.sessions.revoke(token)
  }

  async accountSettings(username, currentToken) {
    const accounts = await this.store.load()
    const account = accounts.find((candidate) => candidate.username === username)

    if (!account) {
      throw new GameError('Account not found')
    }

    return {
      username: account.username,
      email: account.email,
      emailVerified: isVerified(account),
      createdAt: account.createdAt,
      sessions: this.sessions.listFor(username, currentToken),
    }
  }

  logoutAll(username) {
    this.sessions.revokeAllFor(username)
  }

  logoutSession(username, sessionId, currentToken) {
    if (this.sessions.idFor(currentToken) === sessionId) {
      throw new GameError('Use the main log out action to log out this device')
    }

    if (!this.sessions.revokeFor(username, sessionId)) {
      throw new GameError('Session not found')
    }
  }

  sessionId(token) {
    return this.sessions.idFor(token)
  }

  async changeOwnEmail(username, currentPassword, newEmail) {
    const emailResult = validateEmail(newEmail)

    if (!emailResult.ok) {
      throw new GameError(emailResult.message)
    }

    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const account = accounts.find((candidate) => candidate.username === username)

      if (!account || !(await verifyPassword(String(currentPassword), account.salt, account.hash))) {
        throw new GameError('Current password is incorrect')
      }

      if (
        accounts.some(
          (candidate) =>
            candidate !== account && candidate.email?.toLowerCase() === newEmail.toLowerCase(),
        )
      ) {
        throw new GameError('This email is already in use')
      }

      if (account.email?.toLowerCase() === newEmail.toLowerCase() && isVerified(account)) {
        throw new GameError('This is already your verified email address')
      }

      account.email = newEmail
      account.emailVerified = false
      await this.issueVerification(account)
      await this.store.save(accounts)
    })
  }

  async deleteOwnAccount(username, currentPassword) {
    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const account = accounts.find((candidate) => candidate.username === username)

      if (!account || !(await verifyPassword(String(currentPassword), account.salt, account.hash))) {
        throw new GameError('Current password is incorrect')
      }

      const { memberships } = await this.organizationState()
      const ownedMemberships = memberships.filter(
        (membership) => membership.username === username && membership.role === 'owner',
      )

      for (const membership of ownedMemberships) {
        const hasOtherOwner = memberships.some(
          (candidate) =>
            candidate.username !== username &&
            candidate.organizationId === membership.organizationId &&
            candidate.role === 'owner',
        )

        if (!hasOtherOwner) {
          throw new GameError('Assign another owner in every workspace before deleting your account')
        }
      }

      await this.store.saveMemberships(
        memberships.filter((membership) => membership.username !== username),
      )
      await this.store.save(accounts.filter((candidate) => candidate !== account))
      this.sessions.revokeAllFor(username)
    })
  }

  async deleteAccount(username, organizationId) {
    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const account = accounts.find((candidate) => candidate.username === username)

      if (!account) {
        throw new GameError('Account not found')
      }

      const { memberships } = await this.organizationState()
      const membership = memberships.find(
        (candidate) =>
          candidate.username === username &&
          (!organizationId || candidate.organizationId === organizationId),
      )

      if (!membership) {
        throw new GameError('Account is not a member of this organization')
      }

      const organizationMembers = memberships.filter(
        (candidate) => candidate.organizationId === membership.organizationId,
      )

      if (
        membership.role === 'owner' &&
        !organizationMembers.some(
          (candidate) => candidate !== membership && candidate.role === 'owner',
        )
      ) {
        throw new GameError('The last owner cannot be removed')
      }

      const remainingMemberships = memberships.filter((candidate) => candidate !== membership)
      await this.store.saveMemberships(remainingMemberships)

      if (!remainingMemberships.some((candidate) => candidate.username === username)) {
        await this.store.save(accounts.filter((candidate) => candidate !== account))
        this.sessions.revokeAllFor(username)
      }
    })
  }

  async adminOverview() {
    const { accounts, organizations } = await this.organizationState()
    const pendingApprovals = accounts.filter((a) => a.approvalPending === true).length
    const pendingInvitations = (await this.store.loadInvitations()).filter(
      (i) => i.expiresAt > Date.now(),
    ).length

    return { totalAccounts: accounts.length, totalWorkspaces: organizations.length, pendingApprovals, pendingInvitations }
  }

  async listAllAccountsAdmin() {
    const { accounts, organizations, memberships } = await this.organizationState()
    const orgMap = new Map(organizations.map((o) => [o.id, o]))

    return accounts.map((account) => {
      const accountMemberships = memberships.filter((m) => m.username === account.username)

      return {
        username: account.username,
        email: account.email,
        emailVerified: isVerified(account),
        approvalPending: account.approvalPending === true,
        createdAt: account.createdAt,
        workspaces: accountMemberships.map((m) => ({
          id: m.organizationId,
          name: orgMap.get(m.organizationId)?.name ?? 'Unknown',
          role: m.role,
        })),
      }
    })
  }

  async listAllWorkspacesAdmin() {
    const { organizations, memberships } = await this.organizationState()

    return organizations.map((org) => {
      const orgMemberships = memberships.filter((m) => m.organizationId === org.id)
      const owners = orgMemberships.filter((m) => m.role === 'owner').map((m) => m.username)

      return {
        id: org.id,
        name: org.name,
        createdBy: org.createdBy,
        createdAt: org.createdAt,
        memberCount: orgMemberships.length,
        owners,
      }
    })
  }

  async changeRole(username, role, organizationId) {
    validateRole(role)

    return this.runExclusive(async () => {
      const { memberships } = await this.organizationState()
      const membership = memberships.find(
        (candidate) =>
          candidate.username === username &&
          (!organizationId || candidate.organizationId === organizationId),
      )

      if (!membership) {
        throw new GameError('Account is not a member of this organization')
      }

      if (
        membership.role === 'owner' &&
        role !== 'owner' &&
        !memberships.some(
          (candidate) =>
            candidate !== membership &&
            candidate.organizationId === membership.organizationId &&
            candidate.role === 'owner',
        )
      ) {
        throw new GameError('The last owner cannot be changed')
      }

      membership.role = role
      await this.store.saveMemberships(memberships)
      this.sessions.revokeAllFor(username)
    })
  }

  async changePassword(username, currentPassword, newPassword) {
    const passwordResult = validateManagerPassword(newPassword)

    if (!passwordResult.ok) {
      throw new GameError(passwordResult.message)
    }

    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const account = accounts.find((a) => a.username === username)

      if (!account || !(await verifyPassword(String(currentPassword), account.salt, account.hash))) {
        throw new GameError('Current password is incorrect')
      }

      const { salt, hash } = await hashPassword(newPassword)
      account.salt = salt
      account.hash = hash
      await this.store.save(accounts)
    })
  }

  /**
   * Starts a forgot-password flow: emails a reset link to the account's address.
   * Silently succeeds for unknown accounts, accounts without an email, and
   * repeat requests within the cooldown — so neither usernames/emails nor send
   * timing can be probed.
   */
  async requestPasswordReset(identifier) {
    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const needle = String(identifier ?? '').toLowerCase()
      const account = accounts.find(
        (a) => a.username.toLowerCase() === needle || a.email?.toLowerCase() === needle,
      )

      if (!account || !account.email) {
        return
      }

      if (Date.now() - (account.reset?.lastSentAt ?? 0) < RESET_COOLDOWN_MS) {
        return
      }

      const token = crypto.randomBytes(32).toString('hex')
      account.reset = {
        tokenHash: sha256(token),
        expiresAt: Date.now() + this.passwordResetTtlMs,
        lastSentAt: Date.now(),
      }

      const resetUrl = `${this.publicUrl}/manager/reset-password?token=${token}`

      try {
        await this.mailer.send({
          to: account.email,
          ...passwordResetEmail({ username: account.username, resetUrl }),
        })
      } catch (error) {
        console.error('Password reset email failed:', error.message)
        throw new GameError('Could not send the reset email — check the server mail settings')
      }

      await this.store.save(accounts)
    })
  }

  /**
   * Completes a reset from an emailed link. Clicking the link proves control of
   * the address, so the email is also marked verified. All existing sessions for
   * the account are revoked.
   * @returns {Promise<{ username: string }>}
   */
  async resetPassword(token, newPassword) {
    if (typeof token !== 'string' || token.length === 0) {
      throw new GameError('This reset link is incomplete')
    }

    const passwordResult = validateManagerPassword(newPassword)

    if (!passwordResult.ok) {
      throw new GameError(passwordResult.message)
    }

    return this.runExclusive(async () => {
      const accounts = await this.store.load()
      const tokenHash = sha256(token)
      const account = accounts.find((a) => a.reset?.tokenHash === tokenHash)

      if (!account) {
        throw new GameError('This reset link is invalid or has already been used')
      }

      if (account.reset.expiresAt <= Date.now()) {
        throw new GameError('This reset link has expired — request a new one')
      }

      const { salt, hash } = await hashPassword(newPassword)
      account.salt = salt
      account.hash = hash
      account.emailVerified = true
      account.reset = undefined
      await this.store.save(accounts)
      this.sessions.revokeAllFor(account.username)

      return { username: account.username }
    })
  }
  async isSuperAdmin(username) {
    const accounts = await this.store.load()
    const account = accounts.find((a) => a.username === username)
    
    if (!account) return false
    
    // Explicit flag
    if (account.isSuperAdmin !== undefined) {
      return account.isSuperAdmin
    }
    
    // Legacy fallback: first account is super admin
    return accounts.indexOf(account) === 0
  }
}

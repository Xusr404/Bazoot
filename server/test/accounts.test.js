import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { AccountService } from '../src/accounts/AccountService.js'
import { MemoryAccountStore } from '../src/accounts/AccountStore.js'
import { hashPassword, verifyPassword } from '../src/accounts/passwords.js'
import { SessionManager } from '../src/accounts/SessionManager.js'
import { CapturingMailer } from '../src/email/Mailer.js'
import { GameError } from '../src/utils/errors.js'
import { createDatabase } from '../src/db/createDatabase.js'

const makeSessionManager = (overrides = {}) => {
  const db = createDatabase(':memory:')
  return new SessionManager({ db, ...overrides })
}

const makeService = (overrides = {}) =>
  new AccountService({
    store: new MemoryAccountStore(),
    sessions: makeSessionManager(),
    ...overrides,
  })

const tokenFromMail = (mail) => mail.text.match(/token=([0-9a-f]{64})/)[1]

describe('passwords', () => {
  it('verifies a hashed password and rejects a wrong one', async () => {
    const { salt, hash } = await hashPassword('correct horse battery')
    assert.equal(await verifyPassword('correct horse battery', salt, hash), true)
    assert.equal(await verifyPassword('wrong password', salt, hash), false)
  })

  it('salts every hash individually', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    assert.notEqual(a.salt, b.salt)
    assert.notEqual(a.hash, b.hash)
  })
})

describe('SessionManager', () => {
  it('resolves live tokens and rejects unknown ones', () => {
    const sessions = makeSessionManager()
    const token = sessions.create('alice')
    assert.equal(sessions.resolve(token), 'alice')
    assert.equal(sessions.resolve('nope'), null)
    assert.equal(sessions.resolve(undefined), null)
  })

  it('expires tokens after the ttl', () => {
    const sessions = makeSessionManager({ ttlMs: -1 })
    const token = sessions.create('alice')
    assert.equal(sessions.resolve(token), null)
  })

  it('revokes single tokens and all tokens of a user', () => {
    const sessions = makeSessionManager()
    const t1 = sessions.create('alice')
    const t2 = sessions.create('alice')
    const t3 = sessions.create('bob')

    sessions.revoke(t1)
    assert.equal(sessions.resolve(t1), null)
    assert.equal(sessions.resolve(t2), 'alice')

    sessions.revokeAllFor('alice')
    assert.equal(sessions.resolve(t2), null)
    assert.equal(sessions.resolve(t3), 'bob')
  })

  it('lists a user’s active sessions without exposing token hashes', () => {
    const sessions = makeSessionManager()
    const current = sessions.create('alice', {
      userAgent: 'Mozilla/5.0 Chrome/120.0 Windows',
      address: '127.0.0.1',
    })
    sessions.create('alice')
    sessions.create('bob')

    const listed = sessions.listFor('alice', current)
    assert.equal(listed.length, 2)
    assert.equal(listed.filter((session) => session.current).length, 1)
    assert.equal(listed.every((session) => session.id.length === 12), true)
    assert.equal(JSON.stringify(listed).includes(current), false)
    assert.equal(listed.find((session) => session.current).address, '127.0.0.1')
    assert.match(listed.find((session) => session.current).userAgent, /Chrome/)
  })

  it('revokes one identified session without affecting the user’s other sessions', () => {
    const sessions = makeSessionManager()
    const current = sessions.create('alice')
    const other = sessions.create('alice')
    const otherId = sessions.listFor('alice', current).find((session) => !session.current).id

    assert.equal(sessions.revokeFor('alice', otherId), true)
    assert.equal(sessions.resolve(other), null)
    assert.equal(sessions.resolve(current), 'alice')
  })

  it('migrates legacy sessions.json into SQLite on load', (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bazoot-sessions-'))
    const filePath = path.join(directory, 'sessions.json')
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

    // Create a mock legacy file
    const tokenHash = 'fakehash1234567890abcdef'
    const expiresAt = Date.now() + 1000000
    fs.writeFileSync(filePath, JSON.stringify({
      sessions: [
        { tokenHash, username: 'alice', expiresAt }
      ]
    }))

    const sessions = makeSessionManager({ filePath })
    
    // File should be deleted
    assert.equal(fs.existsSync(filePath), false)
    
    // Session should be in SQLite
    const active = sessions.listFor('alice')
    assert.equal(active.length, 1)
    assert.equal(active[0].id, tokenHash.slice(0, 12))
  })
})

describe('AccountService', () => {
  it('setupInitial creates the first account once', async () => {
    const service = makeService()
    assert.equal(await service.hasAccounts(), false)

    const session = await service.setupInitial('admin', 'password123')
    assert.equal(session.username, 'admin')
    assert.equal(session.role, 'owner')
    assert.equal(session.organization.name, 'Bazoot Workspace')
    assert.equal(service.resume(session.token), 'admin')
    assert.equal(await service.hasAccounts(), true)
    assert.equal((await service.listAccounts())[0].role, 'owner')

    await assert.rejects(() => service.setupInitial('other', 'password123'), GameError)
  })

  it('rejects malformed credentials and duplicates (case-insensitive)', async () => {
    const service = makeService()
    await service.setupInitial('admin', 'password123')

    await assert.rejects(() => service.createAccount('ab', 'password123'), GameError) // too short
    await assert.rejects(() => service.createAccount('bad name!', 'password123'), GameError)
    await assert.rejects(() => service.createAccount('newuser', 'short'), GameError)
    await assert.rejects(() => service.createAccount('ADMIN', 'password123'), GameError)
  })

  it('login returns a session for valid credentials, one error for all failures', async () => {
    const service = makeService()
    await service.setupInitial('admin', 'password123')

    const session = await service.login('admin', 'password123')
    assert.equal(service.resume(session.token), 'admin')

    await assert.rejects(() => service.login('admin', 'wrong-password'), /Invalid username or password/)
    await assert.rejects(() => service.login('ghost', 'password123'), /Invalid username or password/)
  })

  it('logout revokes the session', async () => {
    const service = makeService()
    const { token } = await service.setupInitial('admin', 'password123')
    service.logout(token)
    assert.equal(service.resume(token), null)
  })

  it('deleteAccount protects the last account and kills sessions', async () => {
    const service = makeService()
    await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123')
    const helperSession = await service.login('helper', 'password123')

    await assert.rejects(() => service.deleteAccount('ghost'), /not found/)
    await service.deleteAccount('helper')
    assert.equal(service.resume(helperSession.token), null)

    await assert.rejects(() => service.deleteAccount('admin'), /last owner/)
  })

  it('assigns editor by default and supports admin role changes', async () => {
    const service = makeService()
    await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123')

    assert.equal(await service.roleFor('admin'), 'owner')
    assert.equal(await service.roleFor('helper'), 'editor')

    await service.changeRole('helper', 'admin')
    assert.equal(await service.roleFor('helper'), 'admin')

    await service.changeRole('helper', 'editor')
    assert.equal(await service.roleFor('helper'), 'editor')
    await assert.rejects(() => service.changeRole('helper', 'viewer'), /Invalid account role/)
  })

  it('migrates the first legacy account to owner and later accounts to editor', async () => {
    const store = new MemoryAccountStore()
    const service = makeService({ store })
    await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123')

    const accounts = await store.load()
    for (const account of accounts) {
      delete account.role
    }
    await store.save(accounts)
    await store.saveOrganizations([])
    await store.saveMemberships([])

    assert.equal(await service.roleFor('admin'), 'owner')
    assert.equal(await service.roleFor('helper'), 'editor')
    await assert.rejects(() => service.changeRole('admin', 'editor'), /last owner/)
    await assert.rejects(() => service.deleteAccount('admin'), /last owner/)
  })

  it('revokes sessions after a role change', async () => {
    const service = makeService()
    await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123')
    const session = await service.login('helper', 'password123')

    await service.changeRole('helper', 'admin')
    assert.equal(service.resume(session.token), null)
  })

  it('verification disabled: accounts are active immediately, email optional', async () => {
    const service = makeService()
    await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123', 'helper@example.com')

    const session = await service.login('helper', 'password123')
    assert.equal(session.username, 'helper')

    const accounts = await service.listAccounts()
    assert.equal(accounts.find((a) => a.username === 'helper').emailVerified, true)
  })

  it('changePassword requires the current password', async () => {
    const service = makeService()
    await service.setupInitial('admin', 'old-password-1')

    await assert.rejects(
      () => service.changePassword('admin', 'wrong', 'new-password-1'),
      /Current password is incorrect/,
    )

    await service.changePassword('admin', 'old-password-1', 'new-password-1')
    await assert.rejects(() => service.login('admin', 'old-password-1'), GameError)
    const session = await service.login('admin', 'new-password-1')
    assert.equal(session.username, 'admin')
  })

  it('lists account settings and logs out every session', async () => {
    const service = makeService()
    const initial = await service.setupInitial('admin', 'password123', 'admin@example.com')
    const second = await service.login('admin', 'password123')

    const settings = await service.accountSettings('admin', second.token)
    assert.equal(settings.username, 'admin')
    assert.equal(settings.email, 'admin@example.com')
    assert.equal(settings.sessions.length, 2)
    assert.equal(settings.sessions.filter((session) => session.current).length, 1)

    service.logoutAll('admin')
    assert.equal(service.resume(initial.token), null)
    assert.equal(service.resume(second.token), null)
  })

  it('deletes an own account only after ownership and password safeguards pass', async () => {
    const service = makeService()
    const initial = await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123')

    await assert.rejects(
      () => service.deleteOwnAccount('admin', 'wrong-password'),
      /Current password is incorrect/,
    )
    await assert.rejects(
      () => service.deleteOwnAccount('admin', 'password123'),
      /Assign another owner/,
    )

    await service.changeRole('helper', 'owner', initial.organization.id)
    await service.deleteOwnAccount('admin', 'password123')
    assert.equal((await service.listAccounts(initial.organization.id)).some((account) => account.username === 'admin'), false)
  })

  it('creates and switches between organizations with scoped memberships', async () => {
    const service = makeService()
    const initial = await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123')
    const second = await service.createOrganization('admin', 'Second Workspace')

    const organizations = await service.organizationsFor('admin')
    assert.deepEqual(
      organizations.map(({ name, role }) => ({ name, role })),
      [
        { name: 'Bazoot Workspace', role: 'owner' },
        { name: 'Second Workspace', role: 'owner' },
      ],
    )
    assert.deepEqual(
      (await service.listAccounts(initial.organization.id)).map((account) => account.username),
      ['admin', 'helper'],
    )
    assert.deepEqual(
      (await service.listAccounts(second.id)).map((account) => account.username),
      ['admin'],
    )
    await assert.rejects(
      () => service.organizationContext('helper', second.id, { strict: true }),
      /do not belong/,
    )
  })

  it('stores membership roles separately from organization records', async () => {
    const store = new MemoryAccountStore()
    const service = makeService({ store })
    await service.setupInitial('admin', 'password123')

    assert.equal((await store.loadOrganizations())[0].role, undefined)
    assert.equal((await store.loadMemberships())[0].role, 'owner')
  })

  it('renames, leaves, and deletes workspaces without orphaning the acting user', async () => {
    const service = makeService()
    const initial = await service.setupInitial('admin', 'password123')
    const second = await service.createOrganization('admin', 'Second Workspace')

    const renamed = await service.renameOrganization('admin', second.id, 'Renamed Workspace')
    assert.equal(renamed.name, 'Renamed Workspace')

    const afterDelete = await service.deleteOrganization('admin', second.id)
    assert.equal(afterDelete.organization.id, initial.organization.id)
    assert.equal((await service.organizationsFor('admin')).length, 1)
    await assert.rejects(
      () => service.deleteOrganization('admin', initial.organization.id),
      /Create or join another workspace/,
    )
  })

  it('requires another owner before an owner leaves a workspace', async () => {
    const service = makeService()
    const initial = await service.setupInitial('admin', 'password123')
    const second = await service.createOrganization('admin', 'Second Workspace')
    await service.createAccount('helper', 'password123', undefined, {
      role: 'editor',
      organizationId: second.id,
    })

    await assert.rejects(
      () => service.leaveOrganization('admin', second.id),
      /Assign another owner/,
    )
    await service.changeRole('helper', 'owner', second.id)
    const context = await service.leaveOrganization('admin', second.id)
    assert.equal(context.organization.id, initial.organization.id)
  })
})

describe('email verification', () => {
  const makeVerifyingService = (overrides = {}) => {
    const mailer = new CapturingMailer()
    const service = makeService({
      mailer,
      requireVerification: true,
      publicUrl: 'http://example.test:5005',
      ...overrides,
    })

    return { service, mailer }
  }

  it('first-run setup is exempt from verification', async () => {
    const { service, mailer } = makeVerifyingService()
    await service.setupInitial('admin', 'password123', 'admin@example.com')

    assert.equal(mailer.sent.length, 0)
    const session = await service.login('admin', 'password123')
    assert.equal(session.username, 'admin')
  })

  it('new accounts require an email and stay locked until verified', async () => {
    const { service, mailer } = makeVerifyingService()
    await service.setupInitial('admin', 'password123')

    await assert.rejects(
      () => service.createAccount('helper', 'password123'),
      /email address is required/i,
    )
    await assert.rejects(
      () => service.createAccount('helper', 'password123', 'not-an-email'),
      GameError,
    )

    await service.createAccount('helper', 'password123', 'helper@example.com')
    assert.equal(mailer.sent.length, 1)
    assert.equal(mailer.sent[0].to, 'helper@example.com')
    assert.match(mailer.sent[0].text, /http:\/\/example\.test:5005\/manager\/verify\?token=/)

    await assert.rejects(() => service.login('helper', 'password123'), /Email not verified/)
  })

  it('the emailed token verifies the account; re-clicks answer "already verified"', async () => {
    const { service, mailer } = makeVerifyingService()
    await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123', 'helper@example.com')

    const token = tokenFromMail(mailer.sent[0])
    const first = await service.verifyEmail(token)
    assert.deepEqual(first, { username: 'helper', alreadyVerified: false })

    const session = await service.login('helper', 'password123')
    assert.equal(session.username, 'helper')

    // clicking the same email link again is graceful, garbage is rejected
    const again = await service.verifyEmail(token)
    assert.deepEqual(again, { username: 'helper', alreadyVerified: true })
    await assert.rejects(() => service.verifyEmail('deadbeef'), /invalid or has been replaced/)
  })

  it('login before verification fails with the EMAIL_UNVERIFIED code', async () => {
    const { service } = makeVerifyingService()
    await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123', 'helper@example.com')

    await assert.rejects(
      () => service.login('helper', 'password123'),
      (error) => error instanceof GameError && error.code === 'EMAIL_UNVERIFIED',
    )
  })

  it('changeEmail corrects a typo on unverified accounts and reissues the link', async () => {
    const { service, mailer } = makeVerifyingService()
    await service.setupInitial('admin', 'password123', 'admin@example.com')
    await service.createAccount('helper', 'password123', 'typo@example.com')
    const oldToken = tokenFromMail(mailer.sent[0])

    await assert.rejects(() => service.changeEmail('helper', 'not-an-email'), GameError)
    await assert.rejects(() => service.changeEmail('ghost', 'new@example.com'), /not found/)
    await assert.rejects(
      () => service.changeEmail('helper', 'ADMIN@example.com'),
      /already in use/,
    )
    await assert.rejects(
      () => service.changeEmail('admin', 'other@example.com'),
      /already verified/,
    )

    await service.changeEmail('helper', 'fixed@example.com')
    assert.equal(mailer.sent.length, 2)
    assert.equal(mailer.sent[1].to, 'fixed@example.com')

    // old link is dead, new link works
    await assert.rejects(() => service.verifyEmail(oldToken), /invalid or has been replaced/)
    const result = await service.verifyEmail(tokenFromMail(mailer.sent[1]))
    assert.deepEqual(result, { username: 'helper', alreadyVerified: false })

    const accounts = await service.listAccounts()
    assert.equal(accounts.find((a) => a.username === 'helper').email, 'fixed@example.com')
  })

  it('lets a verified user replace their own email after confirming their password', async () => {
    const { service, mailer } = makeVerifyingService()
    await service.setupInitial('admin', 'password123', 'admin@example.com')

    await assert.rejects(
      () => service.changeOwnEmail('admin', 'wrong-password', 'new@example.com'),
      /Current password is incorrect/,
    )

    await service.changeOwnEmail('admin', 'password123', 'new@example.com')
    const settings = await service.accountSettings('admin')
    assert.equal(settings.email, 'new@example.com')
    assert.equal(settings.emailVerified, false)
    assert.equal(mailer.sent.at(-1).to, 'new@example.com')

    await service.verifyEmail(tokenFromMail(mailer.sent.at(-1)))
    assert.equal((await service.accountSettings('admin')).emailVerified, true)
  })

  it('concurrent mutations cannot lose accounts or double-run setup', async () => {
    const service = makeService()
    await service.setupInitial('admin', 'password123')

    await Promise.all([
      service.createAccount('helper1', 'password123'),
      service.createAccount('helper2', 'password123'),
    ])
    assert.equal((await service.listAccounts()).length, 3)

    const fresh = makeService()
    const results = await Promise.allSettled([
      fresh.setupInitial('first', 'password123'),
      fresh.setupInitial('second', 'password123'),
    ])
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal((await fresh.listAccounts()).length, 1)
  })

  it('expired tokens are rejected', async () => {
    const { service, mailer } = makeVerifyingService({ verificationTtlMs: -1 })
    await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123', 'helper@example.com')

    const token = tokenFromMail(mailer.sent[0])
    await assert.rejects(() => service.verifyEmail(token), /expired/)
  })

  it('resend rotates the token, throttles, and never reveals account existence', async () => {
    const { service, mailer } = makeVerifyingService()
    await service.setupInitial('admin', 'password123')
    await service.createAccount('helper', 'password123', 'helper@example.com')
    const firstToken = tokenFromMail(mailer.sent[0])

    // cooldown right after the initial mail
    await assert.rejects(() => service.resendVerification('helper'), /wait a minute/)

    // unknown identifiers and verified accounts: silent success
    await service.resendVerification('ghost')
    await service.resendVerification('admin')
    assert.equal(mailer.sent.length, 1)

    // after the cooldown a new token is issued and the old one dies
    const stored = (await service.store.load()).find((a) => a.username === 'helper')
    stored.verification.lastSentAt = 0
    await service.store.save(await service.store.load())

    await service.resendVerification('helper@example.com')
    assert.equal(mailer.sent.length, 2)
    const secondToken = tokenFromMail(mailer.sent[1])
    assert.notEqual(firstToken, secondToken)

    await assert.rejects(() => service.verifyEmail(firstToken), /invalid or has been replaced/)
    const result = await service.verifyEmail(secondToken)
    assert.deepEqual(result, { username: 'helper', alreadyVerified: false })
  })

  it('rejects duplicate emails', async () => {
    const { service } = makeVerifyingService()
    await service.setupInitial('admin', 'password123', 'admin@example.com')

    await assert.rejects(
      () => service.createAccount('helper', 'password123', 'ADMIN@example.com'),
      /already in use/,
    )
  })
})

describe('self-registration', () => {
  it('is rejected unless allowRegistration is enabled', async () => {
    const service = makeService() // allowRegistration defaults to false
    await service.setupInitial('admin', 'password123')

    await assert.rejects(
      () => service.register('newbie', 'password123', 'newbie@example.com'),
      /not open/i,
    )
    assert.equal((await service.listAccounts()).length, 1)
  })

  it('uses runtime registration changes immediately', async () => {
    const service = makeService()
    await service.setupInitial('admin', 'password123')

    service.setAllowRegistration(true)

    await service.register('newbie', 'password123', 'newbie@example.com', 'Newbie Studio')
    assert.equal((await service.listAccounts()).some((account) => account.username === 'newbie'), true)
  })

  it('creates an active account when enabled and verification is off', async () => {
    const service = makeService({ allowRegistration: true })
    await service.setupInitial('admin', 'password123')

    await service.register('newbie', 'password123', 'newbie@example.com', 'Newbie Studio')
    const session = await service.login('newbie', 'password123')
    assert.equal(session.username, 'newbie')
    assert.equal(session.organization.name, 'Newbie Studio')
    assert.equal(session.role, 'owner')
  })

  it('still honours verification rules when enabled (email required, stays locked)', async () => {
    const mailer = new CapturingMailer()
    const service = makeService({
      allowRegistration: true,
      requireVerification: true,
      mailer,
      publicUrl: 'http://example.test:5005',
    })
    await service.setupInitial('admin', 'password123')

    await assert.rejects(
      () => service.register('newbie', 'password123', undefined, 'Newbie Studio'),
      /email address is required/i,
    )

    await service.register('newbie', 'password123', 'newbie@example.com', 'Newbie Studio')
    assert.equal(mailer.sent.length, 1)
    await assert.rejects(() => service.login('newbie', 'password123'), /Email not verified/)
  })
})

describe('invitations', () => {
  const makeInvitationService = () => {
    const mailer = new CapturingMailer()
    const service = makeService({ mailer, publicUrl: 'http://example.test:5005' })

    return { service, mailer }
  }

  it('creates a pending account from a new-user invitation and requires approval', async () => {
    const { service, mailer } = makeInvitationService()
    await service.setupInitial('admin', 'password123')

    const created = await service.createInvitation('new@example.com', 'editor')
    assert.match(created.inviteUrl, /\/manager\/invite\?token=/)
    assert.equal((await service.listInvitations()).length, 1)

    const token = tokenFromMail(mailer.sent[0])
    assert.deepEqual(await service.inspectInvitation(token), {
      email: 'new@example.com',
      role: 'editor',
      existingAccount: false,
      organization: {
        id: created.organizationId,
        name: 'Bazoot Workspace',
        slug: 'bazoot-workspace',
      },
    })

    assert.deepEqual(await service.acceptInvitation(token, 'newuser', 'password123'), {
      state: 'pending',
      username: 'newuser',
    })
    assert.equal((await service.listInvitations()).length, 0)
    assert.equal((await service.listAccounts()).find((account) => account.username === 'newuser').approvalPending, true)
    await assert.rejects(() => service.login('newuser', 'password123'), /waiting for admin approval/)

    await service.approveAccount('newuser')
    assert.equal((await service.login('newuser', 'password123')).role, 'editor')
  })

  it('cancels a pending invitation so it can no longer be accepted', async () => {
    const { service, mailer } = makeInvitationService()
    await service.setupInitial('admin', 'password123')

    await service.createInvitation('new@example.com', 'editor')
    const token = tokenFromMail(mailer.sent[0])
    assert.equal((await service.listInvitations()).length, 1)

    await service.cancelInvitation('NEW@example.com') // match is case-insensitive
    assert.equal((await service.listInvitations()).length, 0)

    await assert.rejects(() => service.inspectInvitation(token), /invalid or has already been used/)
    await assert.rejects(() => service.cancelInvitation('new@example.com'), /No pending invitation/)
  })

  it('automatically activates an existing account with the matching email', async () => {
    const { service, mailer } = makeInvitationService()
    await service.setupInitial('admin', 'password123')
    await service.createAccount('existing', 'password123', 'existing@example.com')
    const second = await service.createOrganization('admin', 'Second Workspace')

    const created = await service.createInvitation('existing@example.com', 'admin', second.id)
    assert.equal(created.existingAccount, true)
    assert.equal(created.role, 'admin')

    const result = await service.acceptInvitation(tokenFromMail(mailer.sent[0]))
    assert.deepEqual(result, { state: 'active', username: 'existing' })
    assert.equal(await service.roleFor('existing', second.id), 'admin')
  })

  it('keeps invitations and approvals scoped to their organization', async () => {
    const { service, mailer } = makeInvitationService()
    const initial = await service.setupInitial('admin', 'password123')
    const second = await service.createOrganization('admin', 'Second Workspace')

    await service.createInvitation('new@example.com', 'editor', initial.organization.id)
    await service.createInvitation('new@example.com', 'admin', second.id)

    assert.equal((await service.listInvitations(initial.organization.id)).length, 1)
    assert.equal((await service.listInvitations(second.id)).length, 1)

    await service.acceptInvitation(tokenFromMail(mailer.sent[0]), 'newuser', 'password123')
    await assert.rejects(
      () => service.approveAccount('newuser', second.id),
      /not a member of this organization/,
    )
    await service.approveAccount('newuser', initial.organization.id)
  })

  it('does not invite an existing member back into the same organization', async () => {
    const { service } = makeInvitationService()
    const initial = await service.setupInitial('admin', 'password123', 'admin@example.com')

    await assert.rejects(
      () => service.createInvitation('admin@example.com', 'editor', initial.organization.id),
      /already a member/,
    )
  })

  it('rejects expired, used, and invalid invitations', async () => {
    const mailer = new CapturingMailer()
    const service = makeService({
      mailer,
      publicUrl: 'http://example.test:5005',
      verificationTtlMs: -1,
    })
    await service.setupInitial('admin', 'password123')
    await service.createInvitation('new@example.com', 'editor')
    const token = tokenFromMail(mailer.sent[0])

    await assert.rejects(() => service.inspectInvitation(token), /expired/)
    await assert.rejects(() => service.acceptInvitation(token, 'newuser', 'password123'), /expired/)
    await assert.rejects(() => service.inspectInvitation('deadbeef'), /invalid/)
  })
})

describe('password reset', () => {
  const makeResetService = (overrides = {}) => {
    const mailer = new CapturingMailer()
    const service = makeService({ mailer, publicUrl: 'http://example.test:5005', ...overrides })

    return { service, mailer }
  }

  it('emails a reset link whose token sets a new password and revokes sessions', async () => {
    const { service, mailer } = makeResetService()
    await service.setupInitial('admin', 'old-password-1', 'admin@example.com')
    const session = await service.login('admin', 'old-password-1')

    await service.requestPasswordReset('admin@example.com')
    assert.equal(mailer.sent.length, 1)
    assert.equal(mailer.sent[0].to, 'admin@example.com')
    assert.match(mailer.sent[0].text, /http:\/\/example\.test:5005\/manager\/reset-password\?token=/)

    const token = tokenFromMail(mailer.sent[0])
    const result = await service.resetPassword(token, 'new-password-1')
    assert.equal(result.username, 'admin')

    await assert.rejects(() => service.login('admin', 'old-password-1'), GameError)
    assert.equal((await service.login('admin', 'new-password-1')).username, 'admin')
    assert.equal(service.resume(session.token), null) // old session revoked
  })

  it('accepts a username as the identifier too', async () => {
    const { service, mailer } = makeResetService()
    await service.setupInitial('admin', 'password123', 'admin@example.com')

    await service.requestPasswordReset('admin')
    assert.equal(mailer.sent.length, 1)
  })

  it('is silent for unknown accounts, accounts without email, and within cooldown', async () => {
    const noEmail = makeResetService()
    await noEmail.service.setupInitial('admin', 'password123') // no email

    await noEmail.service.requestPasswordReset('ghost') // unknown identifier
    await noEmail.service.requestPasswordReset('admin') // account has no email
    assert.equal(noEmail.mailer.sent.length, 0)

    const withEmail = makeResetService()
    await withEmail.service.setupInitial('admin', 'password123', 'admin@example.com')
    await withEmail.service.requestPasswordReset('admin')
    await withEmail.service.requestPasswordReset('admin') // cooldown — silent, no 2nd mail
    assert.equal(withEmail.mailer.sent.length, 1)
  })

  it('rejects expired, invalid, and already-used tokens', async () => {
    const expiredSvc = makeResetService({ passwordResetTtlMs: -1 })
    await expiredSvc.service.setupInitial('admin', 'password123', 'admin@example.com')
    await expiredSvc.service.requestPasswordReset('admin')
    await assert.rejects(
      () => expiredSvc.service.resetPassword(tokenFromMail(expiredSvc.mailer.sent[0]), 'new-password-1'),
      /expired/,
    )

    const { service, mailer } = makeResetService()
    await service.setupInitial('admin', 'password123', 'admin@example.com')
    await service.requestPasswordReset('admin')
    const token = tokenFromMail(mailer.sent[0])
    await service.resetPassword(token, 'new-password-1')

    await assert.rejects(
      () => service.resetPassword(token, 'another-pass-1'),
      /invalid or has already been used/,
    )
    await assert.rejects(
      () => service.resetPassword('deadbeef', 'another-pass-1'),
      /invalid or has already been used/,
    )
  })

  it('marks the email verified on reset (the link proves ownership)', async () => {
    const { service, mailer } = makeResetService({ requireVerification: true })
    await service.setupInitial('admin', 'password123', 'admin@example.com')
    await service.createAccount('helper', 'password123', 'helper@example.com')
    await assert.rejects(() => service.login('helper', 'password123'), /Email not verified/)

    await service.requestPasswordReset('helper@example.com')
    const resetMail = mailer.sent.filter((m) => m.to === 'helper@example.com').at(-1)
    await service.resetPassword(tokenFromMail(resetMail), 'brand-new-1')

    assert.equal((await service.login('helper', 'brand-new-1')).username, 'helper')
  })
})

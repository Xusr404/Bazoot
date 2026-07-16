import { AccountStore } from './AccountStore.js'
import fs from 'node:fs'

function withTransaction(db, fn) {
  db.exec('BEGIN')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (err) {
    try { db.exec('ROLLBACK') } catch {}
    throw err
  }
}

function rowToAccount(row) {
  const account = {
    username: row.username,
    salt: row.salt,
    hash: row.hash,
    role: row.role,
    createdAt: row.created_at,
    emailVerified: row.email_verified !== 0,
  }
  if (row.email !== null) account.email = row.email
  if (row.approval_pending !== 0) account.approvalPending = true
  if (row.verification !== null) account.verification = JSON.parse(row.verification)
  if (row.reset !== null) account.reset = JSON.parse(row.reset)
  return account
}

function accountToRow(account) {
  return {
    username: account.username,
    salt: account.salt,
    hash: account.hash,
    email: account.email ?? null,
    email_verified: account.emailVerified === false ? 0 : 1,
    approval_pending: account.approvalPending === true ? 1 : 0,
    role: account.role ?? 'editor',
    created_at: account.createdAt ?? new Date().toISOString(),
    verification: account.verification ? JSON.stringify(account.verification) : null,
    reset: account.reset ? JSON.stringify(account.reset) : null,
  }
}

function importLegacyData(db, filePath) {
  if (!filePath || db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count > 0) {
    return
  }

  let data

  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return
  }

  if (!Array.isArray(data.accounts) || data.accounts.length === 0) {
    return
  }

  const insertAccount = db.prepare(`
    INSERT INTO accounts
      (username, salt, hash, email, email_verified, approval_pending, role, created_at, verification, reset)
    VALUES
      ($username, $salt, $hash, $email, $email_verified, $approval_pending, $role, $created_at, $verification, $reset)
  `)
  const insertOrganization = db.prepare(`
    INSERT INTO organizations (id, name, slug, created_by, created_at)
    VALUES ($id, $name, $slug, $created_by, $created_at)
  `)
  const insertMembership = db.prepare(`
    INSERT INTO memberships (organization_id, username, role, joined_at)
    VALUES ($organization_id, $username, $role, $joined_at)
  `)
  const insertInvitation = db.prepare(`
    INSERT INTO invitations (token_hash, email, role, organization_id, existing_account, created_at, expires_at)
    VALUES ($token_hash, $email, $role, $organization_id, $existing_account, $created_at, $expires_at)
  `)

  withTransaction(db, () => {
    for (const account of data.accounts) insertAccount.run(accountToRow(account))
    for (const organization of data.organizations ?? []) {
      insertOrganization.run({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        created_by: organization.createdBy,
        created_at: organization.createdAt,
      })
    }
    for (const membership of data.memberships ?? []) {
      insertMembership.run({
        organization_id: membership.organizationId,
        username: membership.username,
        role: membership.role,
        joined_at: membership.joinedAt,
      })
    }
    for (const invitation of data.invitations ?? []) {
      insertInvitation.run({
        token_hash: invitation.tokenHash,
        email: invitation.email,
        role: invitation.role,
        organization_id: invitation.organizationId,
        existing_account: invitation.existingAccount ? 1 : 0,
        created_at: invitation.createdAt,
        expires_at: invitation.expiresAt,
      })
    }
  })
}

export class SQLiteAccountStore extends AccountStore {
  constructor({ db, legacyFilePath = null }) {
    super()
    this.db = db
    importLegacyData(db, legacyFilePath)
  }

  async load() {
    return this.db.prepare('SELECT * FROM accounts').all().map(rowToAccount)
  }

  async save(accounts) {
    const insert = this.db.prepare(`
      INSERT INTO accounts
        (username, salt, hash, email, email_verified, approval_pending, role, created_at, verification, reset)
      VALUES
        ($username, $salt, $hash, $email, $email_verified, $approval_pending, $role, $created_at, $verification, $reset)
    `)
    withTransaction(this.db, () => {
      this.db.exec('DELETE FROM accounts')
      for (const account of accounts) insert.run(accountToRow(account))
    })
  }

  async loadOrganizations() {
    return this.db.prepare('SELECT * FROM organizations').all().map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }))
  }

  async saveOrganizations(organizations) {
    const insert = this.db.prepare(`
      INSERT INTO organizations (id, name, slug, created_by, created_at)
      VALUES ($id, $name, $slug, $created_by, $created_at)
    `)
    withTransaction(this.db, () => {
      this.db.exec('DELETE FROM organizations')
      for (const org of organizations) {
        insert.run({
          id: org.id,
          name: org.name,
          slug: org.slug,
          created_by: org.createdBy,
          created_at: org.createdAt,
        })
      }
    })
  }

  async loadMemberships() {
    return this.db.prepare('SELECT * FROM memberships').all().map((row) => ({
      organizationId: row.organization_id,
      username: row.username,
      role: row.role,
      joinedAt: row.joined_at,
    }))
  }

  async saveMemberships(memberships) {
    const insert = this.db.prepare(`
      INSERT INTO memberships (organization_id, username, role, joined_at)
      VALUES ($organization_id, $username, $role, $joined_at)
    `)
    withTransaction(this.db, () => {
      this.db.exec('DELETE FROM memberships')
      for (const m of memberships) {
        insert.run({
          organization_id: m.organizationId,
          username: m.username,
          role: m.role,
          joined_at: m.joinedAt,
        })
      }
    })
  }

  async loadInvitations() {
    return this.db.prepare('SELECT * FROM invitations').all().map((row) => ({
      tokenHash: row.token_hash,
      email: row.email,
      role: row.role,
      organizationId: row.organization_id,
      existingAccount: row.existing_account !== 0,
      createdAt: row.created_at,
      expiresAt: Number(row.expires_at),
    }))
  }

  async saveInvitations(invitations) {
    const insert = this.db.prepare(`
      INSERT INTO invitations (token_hash, email, role, organization_id, existing_account, created_at, expires_at)
      VALUES ($token_hash, $email, $role, $organization_id, $existing_account, $created_at, $expires_at)
    `)
    withTransaction(this.db, () => {
      this.db.exec('DELETE FROM invitations')
      for (const inv of invitations) {
        insert.run({
          token_hash: inv.tokenHash,
          email: inv.email,
          role: inv.role,
          organization_id: inv.organizationId,
          existing_account: inv.existingAccount ? 1 : 0,
          created_at: inv.createdAt,
          expires_at: inv.expiresAt,
        })
      }
    })
  }
}

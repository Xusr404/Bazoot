import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, it } from 'node:test'
import { SQLiteAccountStore } from '../src/accounts/SQLiteAccountStore.js'
import { createDatabase } from '../src/db/createDatabase.js'

const temporaryDirectories = []

const makeStore = (legacyData) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bazoot-sqlite-accounts-'))
  temporaryDirectories.push(directory)
  const legacyFilePath = path.join(directory, 'accounts.json')
  fs.writeFileSync(legacyFilePath, JSON.stringify(legacyData))
  const db = createDatabase(path.join(directory, 'bazoot.db'))

  return { db, store: new SQLiteAccountStore({ db, legacyFilePath }) }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('SQLiteAccountStore legacy import', () => {
  it('imports legacy account data when the database is empty', async () => {
    const account = {
      username: 'admin',
      salt: 'salt',
      hash: 'hash',
      email: 'admin@example.com',
      emailVerified: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const organization = {
      id: 'org-1',
      name: 'Workspace',
      slug: 'workspace',
      createdBy: 'admin',
      createdAt: account.createdAt,
    }
    const membership = {
      organizationId: organization.id,
      username: account.username,
      role: 'owner',
      joinedAt: account.createdAt,
    }
    const invitation = {
      tokenHash: 'token',
      email: 'editor@example.com',
      role: 'editor',
      organizationId: organization.id,
      existingAccount: false,
      createdAt: account.createdAt,
      expiresAt: 1_800_000_000_000,
    }
    const { db, store } = makeStore({
      accounts: [account],
      organizations: [organization],
      memberships: [membership],
      invitations: [invitation],
    })

    assert.deepEqual(await store.load(), [{ ...account, role: 'editor' }])
    assert.deepEqual(await store.loadOrganizations(), [organization])
    assert.deepEqual(await store.loadMemberships(), [membership])
    assert.deepEqual(await store.loadInvitations(), [invitation])
    db.close()
  })

  it('does not overwrite an already populated database', async () => {
    const { db, store } = makeStore({
      accounts: [{
        username: 'legacy',
        salt: 'salt',
        hash: 'hash',
        createdAt: '2026-01-01T00:00:00.000Z',
      }],
    })
    await store.save([{
      username: 'current',
      salt: 'salt',
      hash: 'hash',
      createdAt: '2026-02-01T00:00:00.000Z',
    }])

    const reloaded = new SQLiteAccountStore({
      db,
      legacyFilePath: path.join(temporaryDirectories.at(-1), 'accounts.json'),
    })

    assert.deepEqual((await reloaded.load()).map(({ username }) => username), ['current'])
    db.close()
  })
})

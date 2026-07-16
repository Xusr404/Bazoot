import fs from 'node:fs/promises'
import path from 'node:path'
import { AccountStore } from './AccountStore.js'

// JSON-file account storage (default). The file holds only usernames and
// scrypt hashes — never plaintext passwords. Keep it out of version control.
export class FileAccountStore extends AccountStore {
  constructor({ filePath }) {
    super()
    this.filePath = filePath
  }

  async readData() {
    try {
      return JSON.parse(await fs.readFile(this.filePath, 'utf-8'))
    } catch {
      return {}
    }
  }

  async writeData(changes) {
    const data = { ...(await this.readData()), ...changes }
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2))
  }

  async load() {
    const data = await this.readData()

    return Array.isArray(data.accounts) ? data.accounts : []
  }

  async save(accounts) {
    await this.writeData({ accounts })
  }

  async loadInvitations() {
    const data = await this.readData()

    return Array.isArray(data.invitations) ? data.invitations : []
  }

  async saveInvitations(invitations) {
    await this.writeData({ invitations })
  }

  async loadOrganizations() {
    const data = await this.readData()

    return Array.isArray(data.organizations) ? data.organizations : []
  }

  async saveOrganizations(organizations) {
    await this.writeData({ organizations })
  }

  async loadMemberships() {
    const data = await this.readData()

    return Array.isArray(data.memberships) ? data.memberships : []
  }

  async saveMemberships(memberships) {
    await this.writeData({ memberships })
  }
}

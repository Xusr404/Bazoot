// Storage interface for manager accounts. Default is FileAccountStore (JSON on
// disk); MemoryAccountStore exists for tests and ephemeral setups.
/* eslint-disable no-unused-vars */
export class AccountStore {
  /** @returns {Promise<Array<{ username: string, salt: string, hash: string, role?: 'admin' | 'editor', createdAt: string }>>} */
  async load() {
    throw new Error('Not implemented')
  }

  async save(accounts) {
    throw new Error('Not implemented')
  }

  async loadInvitations() {
    return []
  }

  async saveInvitations(invitations) {
    throw new Error('Not implemented')
  }

  async loadOrganizations() {
    return []
  }

  async saveOrganizations(organizations) {
    throw new Error('Not implemented')
  }

  async loadMemberships() {
    return []
  }

  async saveMemberships(memberships) {
    throw new Error('Not implemented')
  }
}

export class MemoryAccountStore extends AccountStore {
  constructor(initial = []) {
    super()
    this.accounts = [...initial]
    this.invitations = []
    this.organizations = []
    this.memberships = []
  }

  async load() {
    return [...this.accounts]
  }

  async save(accounts) {
    this.accounts = [...accounts]
  }

  async loadInvitations() {
    return [...this.invitations]
  }

  async saveInvitations(invitations) {
    this.invitations = [...invitations]
  }

  async loadOrganizations() {
    return [...this.organizations]
  }

  async saveOrganizations(organizations) {
    this.organizations = [...organizations]
  }

  async loadMemberships() {
    return [...this.memberships]
  }

  async saveMemberships(memberships) {
    this.memberships = [...memberships]
  }
}

const STORAGE_KEY = 'manager_token'
const ORGANIZATION_KEY = 'manager_organization'
const DEFAULT_ORGANIZATION_KEY = 'manager_default_organization'

// Manager session token persistence — survives page refreshes; the server
// decides whether it is still valid.
export const getManagerToken = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export const setManagerToken = (token) => {
  try {
    localStorage.setItem(STORAGE_KEY, token)
  } catch {
    // private mode etc. — session just won't survive a refresh
  }
}

export const clearManagerToken = () => {
  try {
    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(ORGANIZATION_KEY)
  } catch {
    // ignore
  }
}

export const getManagerOrganization = () => {
  try {
    return localStorage.getItem(ORGANIZATION_KEY)
  } catch {
    return null
  }
}

export const setManagerOrganization = (organizationId) => {
  try {
    localStorage.setItem(ORGANIZATION_KEY, organizationId)
  } catch {
    // private mode etc. — active organization falls back to the first membership
  }
}

export const getManagerDefaultOrganization = () => {
  try {
    return localStorage.getItem(DEFAULT_ORGANIZATION_KEY)
  } catch {
    return null
  }
}

export const setManagerDefaultOrganization = (organizationId) => {
  try {
    localStorage.setItem(DEFAULT_ORGANIZATION_KEY, organizationId)
  } catch {
    // private mode etc. — fall back to the active or first workspace
  }
}

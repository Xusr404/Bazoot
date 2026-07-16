export const MANAGER_PATHS = {
  home: '/manager',
  workspaces: '/manager/workspaces',
  accountSettings: '/manager/account',
  register: '/manager/register',
  forgotPassword: '/manager/forgot-password',
  admin: '/manager/admin',
}

const workspaceBase = (organizationId) =>
  `/manager/workspaces/${encodeURIComponent(organizationId)}`

export const managerWorkspacePath = (organizationId, view = 'quizzes') =>
  `${workspaceBase(organizationId)}/${view}`

export const managerNewQuizPath = (organizationId) =>
  `${workspaceBase(organizationId)}/quizzes/new`

export const managerEditPath = (organizationId, quizzId) =>
  `${workspaceBase(organizationId)}/quizzes/${encodeURIComponent(quizzId)}/edit`

export const managerWorkspaceSwitchPath = (organizationId, currentView) =>
  managerWorkspacePath(
    organizationId,
    currentView === 'accounts' ? 'members' : currentView === 'settings' ? 'settings' : 'quizzes',
  )

export const matchManagerRoute = (pathname) => {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  if (path === MANAGER_PATHS.home) {
    return { route: 'home', view: 'workspaces', access: 'public' }
  }

  if (path === MANAGER_PATHS.workspaces) {
    return { route: 'workspaces', view: 'workspaces', access: 'protected' }
  }

  if (path === MANAGER_PATHS.register) {
    return { route: 'register', view: 'register', access: 'public' }
  }

  if (path === MANAGER_PATHS.forgotPassword) {
    return { route: 'forgot', view: 'forgot', access: 'public' }
  }

  if (path === MANAGER_PATHS.accountSettings) {
    return { route: 'account', view: 'account', access: 'protected' }
  }

  if (path === MANAGER_PATHS.admin) {
    return { route: 'admin', view: 'admin', access: 'protected' }
  }

  const workspaceMatch = path.match(
    /^\/manager\/workspaces\/([^/]+)\/(quizzes|members|settings)$/,
  )

  if (workspaceMatch) {
    try {
      return {
        route: 'workspace',
        view:
          workspaceMatch[2] === 'quizzes'
            ? 'list'
            : workspaceMatch[2] === 'members'
              ? 'accounts'
              : 'settings',
        organizationId: decodeURIComponent(workspaceMatch[1]),
        access: 'protected',
      }
    } catch {
      return { view: 'unknown' }
    }
  }

  const newMatch = path.match(/^\/manager\/workspaces\/([^/]+)\/quizzes\/new$/)

  if (newMatch) {
    try {
      return {
        route: 'workspace-new',
        view: 'editor',
        organizationId: decodeURIComponent(newMatch[1]),
        editingId: null,
        access: 'protected',
      }
    } catch {
      return { view: 'unknown' }
    }
  }

  const editMatch = path.match(/^\/manager\/workspaces\/([^/]+)\/quizzes\/([^/]+)\/edit$/)

  if (editMatch) {
    try {
      return {
        route: 'workspace-edit',
        view: 'editor',
        organizationId: decodeURIComponent(editMatch[1]),
        editingId: decodeURIComponent(editMatch[2]),
        access: 'protected',
      }
    } catch {
      return { view: 'unknown' }
    }
  }

  return { view: 'unknown' }
}

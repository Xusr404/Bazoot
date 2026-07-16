import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MANAGER_PATHS,
  managerEditPath,
  managerNewQuizPath,
  managerWorkspacePath,
  managerWorkspaceSwitchPath,
  matchManagerRoute,
} from '../src/utils/managerRoutes.js'

describe('manager routes', () => {
  it('matches workspace list and workspace-scoped views', () => {
    const organizationId = 'workspace-1'

    assert.deepEqual(matchManagerRoute(MANAGER_PATHS.home), {
      route: 'home',
      view: 'workspaces',
      access: 'public',
    })
    assert.deepEqual(matchManagerRoute(`${MANAGER_PATHS.workspaces}/`), {
      route: 'workspaces',
      view: 'workspaces',
      access: 'protected',
    })
    assert.deepEqual(matchManagerRoute(MANAGER_PATHS.accountSettings), {
      route: 'account',
      view: 'account',
      access: 'protected',
    })
    assert.deepEqual(matchManagerRoute(managerWorkspacePath(organizationId)), {
      route: 'workspace',
      view: 'list',
      organizationId,
      access: 'protected',
    })
    assert.deepEqual(matchManagerRoute(managerWorkspacePath(organizationId, 'members')), {
      route: 'workspace',
      view: 'accounts',
      organizationId,
      access: 'protected',
    })
    assert.deepEqual(matchManagerRoute(managerWorkspacePath(organizationId, 'settings')), {
      route: 'workspace',
      view: 'settings',
      organizationId,
      access: 'protected',
    })
  })

  it('round-trips encoded workspace and quiz ids through editor URLs', () => {
    const organizationId = 'workspace id'
    const editingId = 'quiz id/with symbols'

    assert.deepEqual(matchManagerRoute(managerNewQuizPath(organizationId)), {
      route: 'workspace-new',
      view: 'editor',
      organizationId,
      editingId: null,
      access: 'protected',
    })
    assert.deepEqual(matchManagerRoute(managerEditPath(organizationId, editingId)), {
      route: 'workspace-edit',
      view: 'editor',
      organizationId,
      editingId,
      access: 'protected',
    })
  })

  it('keeps public manager auth routes and rejects malformed URLs', () => {
    assert.deepEqual(matchManagerRoute(MANAGER_PATHS.register), {
      route: 'register',
      view: 'register',
      access: 'public',
    })
    assert.deepEqual(matchManagerRoute(MANAGER_PATHS.forgotPassword), {
      route: 'forgot',
      view: 'forgot',
      access: 'public',
    })
    assert.deepEqual(matchManagerRoute('/manager/not-a-route'), { view: 'unknown' })
    assert.deepEqual(
      matchManagerRoute('/manager/workspaces/id/quizzes/%E0%A4%A/edit'),
      { view: 'unknown' },
    )
  })

  it('keeps the current tab when switching workspaces', () => {
    assert.equal(
      managerWorkspaceSwitchPath('workspace-2', 'list'),
      '/manager/workspaces/workspace-2/quizzes',
    )
    assert.equal(
      managerWorkspaceSwitchPath('workspace-2', 'accounts'),
      '/manager/workspaces/workspace-2/members',
    )
    assert.equal(
      managerWorkspaceSwitchPath('workspace-2', 'settings'),
      '/manager/workspaces/workspace-2/settings',
    )
    assert.equal(
      managerWorkspaceSwitchPath('workspace-2', 'workspaces'),
      '/manager/workspaces/workspace-2/quizzes',
    )
  })
})

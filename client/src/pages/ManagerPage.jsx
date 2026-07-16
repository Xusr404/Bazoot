import { EVENTS } from '@bazoot/shared/events'
import { STATUS } from '@bazoot/shared/gameStates'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useLocation, useNavigate } from 'react-router'
import { ActiveGameBanner } from '../components/layout/ActiveGameBanner.jsx'
import { AuthShell } from '../components/layout/AuthShell.jsx'
import { CreateOrganizationDialog } from '../components/layout/CreateOrganizationDialog.jsx'
import { ManagerHeader } from '../components/layout/ManagerHeader.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useSocketEvent } from '../hooks/useSocket.js'
import {
  clearManagerToken,
  getManagerDefaultOrganization,
  getManagerOrganization,
  getManagerToken,
  setManagerOrganization,
  setManagerToken,
} from '../utils/managerSession.js'
import {
  MANAGER_PATHS,
  managerEditPath,
  managerNewQuizPath,
  managerWorkspacePath,
  managerWorkspaceSwitchPath,
  matchManagerRoute,
} from '../utils/managerRoutes.js'
import {
  AccountSettingsScreen,
  AccountsScreen,
  AdminScreen,
  ForgotPasswordScreen,
  ManagerAuthScreen,
  ManagerSetupScreen,
  RegisterScreen,
  QuizWizard,
  SelectQuizScreen,
  WorkspacesScreen,
  WorkspaceSettingsScreen,
} from '../screens/index.js'
import { clearStoredDraft, draftStorageKey } from '../screens/quizWizard/quizDraft.js'
import { RouteNotFoundPage } from './RouteNotFoundPage.jsx'

// Manager landing page. Auth states: loading → setup (first run) | login |
// ready (quiz list / editor / accounts). Sessions resume via a stored token.
export const ManagerPage = () => {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const {
    isConnected,
    connect,
    dispatch,
    gameId,
    status,
    players,
    createGame,
    createQuizz,
    updateQuizz,
    checkManagerAuth,
    createOrganization,
    renameOrganization,
    leaveOrganization,
    deleteOrganization,
    logoutManager,
  } = useGame()

  const [authView, setAuthView] = useState('loading') // loading | setup | login | register | forgot | ready
  const [username, setUsername] = useState(null)
  const [accountRole, setAccountRole] = useState(null)
  const [organization, setOrganization] = useState(null)
  const [organizations, setOrganizations] = useState([])
  const [createOrganizationOpen, setCreateOrganizationOpen] = useState(false)
  const [creatingOrganization, setCreatingOrganization] = useState(false)
  const [workspaceMutationPending, setWorkspaceMutationPending] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [unverifiedUsername, setUnverifiedUsername] = useState(null)
  const [allowRegistration, setAllowRegistration] = useState(false)
  const [quizzList, setQuizzList] = useState([])
  const [quizzListLoaded, setQuizzListLoaded] = useState(false)
  // In-flight save: blocks duplicate submits; hostAfterSave chains the saved
  // quiz straight into a live lobby ("Save & host now").
  const [saving, setSaving] = useState(false)
  const [hostAfterSave, setHostAfterSave] = useState(false)
  const [pendingSavedQuizzId, setPendingSavedQuizzId] = useState(null)
  const [managerFieldError, setManagerFieldError] = useState(null)

  const {
    view: managerView,
    route: managerRoute,
    organizationId: routeOrganizationId = null,
    editingId = null,
  } = matchManagerRoute(pathname)
  const searchParams = new URLSearchParams(search)
  const returnTo = searchParams.get('returnTo')
  const routeRequiresAuth =
    managerRoute === 'workspaces' ||
    managerRoute === 'account' ||
    managerRoute === 'admin' ||
    managerRoute === 'workspace' ||
    managerRoute === 'workspace-new' ||
    managerRoute === 'workspace-edit'
  const routeWorkspaceReady =
    !routeOrganizationId || (organization?.id && routeOrganizationId === organization.id)
  const editingQuizz = editingId ? quizzList.find((quizz) => quizz.id === editingId) : null
  const pendingSavedQuizz =
    pendingSavedQuizzId ? quizzList.find((quizz) => quizz.id === pendingSavedQuizzId) : null

  useEffect(() => {
    if (!isConnected) {
      connect()
    }
  }, [connect, isConnected])

  // Ask the server what to show — on mount and on every (re)connect, so a
  // reconnected socket re-arms its server-side auth from the stored token.
  useEffect(() => {
    if (isConnected) {
      checkManagerAuth(
        getManagerToken(),
        routeOrganizationId ?? getManagerDefaultOrganization() ?? getManagerOrganization(),
      )
    }
  }, [isConnected, checkManagerAuth, routeOrganizationId])

  useSocketEvent(
    EVENTS.MANAGER_AUTH_STATE,
    ({ state, username: name, role, organization: activeOrganization, organizations: availableOrganizations, allowRegistration: allow }) => {
    // The flag rides along with login/setup states; keep the last known value
    // for states (authenticated/unverified follow-ups) that omit it.
    if (typeof allow === 'boolean') {
      setAllowRegistration(allow)
    }

      if (state === 'authenticated') {
        setUsername(name)
        setAccountRole(role)
        setIsSuperAdmin(isSuperAdmin)
        setOrganization(activeOrganization)
        setOrganizations(availableOrganizations ?? [])
        if (activeOrganization?.id) {
          setManagerOrganization(activeOrganization.id)
        }
        setUnverifiedUsername(null)
        setAuthView('ready')
        if (!returnTo && routeOrganizationId && routeOrganizationId !== activeOrganization?.id) {
          navigate(managerWorkspacePath(activeOrganization.id), { replace: true })
        }
    } else if (state === 'unverified') {
      // Correct credentials, email not verified yet — login screen shows
      // an explanation panel with a one-click resend.
      setUnverifiedUsername(name)
      setAuthView('login')
    } else {
        if (state === 'login') {
          clearManagerToken()

        // Returning to login straight after a successful registration.
        if (managerView === 'register') {
          toast.success('Account created — check your inbox to verify if prompted, then log in')
          navigate(`${MANAGER_PATHS.home}${authSearch}`, { replace: true })
        }
      }

      setUsername(null)
      setAccountRole(null)
      setOrganization(null)
      setOrganizations([])
      setAuthView(state)
    }
    },
  )

  useSocketEvent(EVENTS.MANAGER_AUTH_SUCCESS, ({ token, username: name, role, organization: activeOrganization, organizations: availableOrganizations, isSuperAdmin }) => {
    setManagerToken(token)
    setUsername(name)
    setAccountRole(role)
    setIsSuperAdmin(isSuperAdmin)
    setOrganization(activeOrganization)
    setOrganizations(availableOrganizations ?? [])
    if (activeOrganization?.id) {
      setManagerOrganization(activeOrganization.id)
    }
    setUnverifiedUsername(null)
    setAuthView('ready')
    const defaultOrganizationId = getManagerDefaultOrganization()

    if (
      !returnTo &&
      defaultOrganizationId &&
      defaultOrganizationId !== activeOrganization.id &&
      availableOrganizations?.some((candidate) => candidate.id === defaultOrganizationId)
    ) {
      navigate(managerWorkspacePath(defaultOrganizationId), { replace: true })
    }
  })

  useSocketEvent(
    EVENTS.MANAGER_ORGANIZATION_CONTEXT,
    ({ organization: activeOrganization, organizations: availableOrganizations, role }) => {
      setOrganization(activeOrganization)
      setOrganizations(availableOrganizations)
      setManagerOrganization(activeOrganization.id)
      setAccountRole(role)
      setCreatingOrganization(false)
      setWorkspaceMutationPending(false)
      setManagerFieldError(null)
      setCreateOrganizationOpen(false)
      if (!returnTo && routeOrganizationId && routeOrganizationId !== activeOrganization.id) {
        navigate(managerWorkspacePath(activeOrganization.id), { replace: true })
      } else if (!returnTo && creatingOrganization) {
        navigate(managerWorkspacePath(activeOrganization.id))
      }
      toast.success(`Workspace ready: ${activeOrganization.name}`)
    },
  )

  useSocketEvent(EVENTS.MANAGER_QUIZZ_LIST, (list) => {
    setQuizzList(list)
    setQuizzListLoaded(true)
  })

  useSocketEvent(EVENTS.MANAGER_QUIZZ_SAVED, ({ quizzId } = {}) => {
    // The server also emits this for deletes triggered from the list view —
    // only a save from the editor should clear the wizard state.
    if (managerView !== 'editor') {
      return
    }

    clearStoredDraft(draftStorageKey(editingQuizz?.id))
    toast.success('Quiz saved')

    if (hostAfterSave && quizzId) {
      // Keep `saving` on until MANAGER_GAME_CREATED navigates away.
      createGame(quizzId)

      return
    }

    setSaving(false)
    setManagerFieldError(null)
    setPendingSavedQuizzId(!editingQuizz?.id ? quizzId ?? null : null)
  })

  useSocketEvent(EVENTS.MANAGER_ACCOUNTS_LIST, (accounts) => {
    const currentAccount = accounts.find((account) => account.username === username)

    // Own account deleted elsewhere → server already dropped our auth.
    if (username && !currentAccount) {
      clearManagerToken()
      setAuthView('login')
      navigate(MANAGER_PATHS.home, { replace: true })
    } else if (currentAccount) {
      setAccountRole(currentAccount.role)
    }
  })

  useSocketEvent(EVENTS.MANAGER_GAME_CREATED, ({ gameId, inviteCode }) => {
    dispatch({ type: 'SET_GAME_ID', gameId })
    dispatch({
      type: 'SET_STATUS',
      name: STATUS.SHOW_ROOM,
      data: { text: 'Waiting for the players', inviteCode },
    })
    navigate(`/party/manager/${gameId}`)
  })

  useSocketEvent(EVENTS.MANAGER_VERIFICATION_SENT, () => {
    toast.success('If that account needs verification, an email is on its way')
  })

  const handleManagerError = (message) => {
    setManagerFieldError({
      action:
        creatingOrganization ? 'createOrganization'
          : workspaceMutationPending ? 'workspace'
            : saving ? 'quiz'
              : null,
      message,
    })
    toast.error(message)
    setSaving(false)
    setCreatingOrganization(false)
    setWorkspaceMutationPending(false)
  }
  useSocketEvent(EVENTS.MANAGER_ERROR_MESSAGE, handleManagerError)
  useSocketEvent(EVENTS.GAME_ERROR_MESSAGE, handleManagerError)

  const handleLogout = () => {
    logoutManager(getManagerToken())
    clearManagerToken()
    setUsername(null)
    setAccountRole(null)
    setOrganization(null)
    setOrganizations([])
    setAuthView('login')
    navigate(MANAGER_PATHS.home, { replace: true })
  }

  const handleSave = (quizz, { host = false } = {}) => {
    if (saving) {
      return
    }

    setSaving(true)
    setManagerFieldError(null)
    setHostAfterSave(host)

    if (editingQuizz?.id) {
      updateQuizz(editingQuizz.id, quizz)
    } else {
      createQuizz(quizz)
    }
  }

  useEffect(() => {
    if (
      managerView !== 'unknown' &&
      routeRequiresAuth &&
      (authView === 'login' || authView === 'setup' || authView === 'unverified') &&
      pathname !== MANAGER_PATHS.home
    ) {
      const nextReturnTo = `${pathname}${search}`
      navigate(`${MANAGER_PATHS.home}?returnTo=${encodeURIComponent(nextReturnTo)}`, {
        replace: true,
      })
    }
  }, [authView, managerView, navigate, pathname, routeRequiresAuth, search])

  useEffect(() => {
    if (authView !== 'ready' || !returnTo || !returnTo.startsWith('/')) {
      return
    }

    if (returnTo !== `${pathname}${search}`) {
      navigate(returnTo, { replace: true })
    }
  }, [authView, navigate, pathname, returnTo, search])

  useEffect(() => {
    if (authView === 'ready' && (managerView === 'register' || managerView === 'forgot')) {
      navigate(MANAGER_PATHS.home, { replace: true })
    }
  }, [authView, managerView, navigate])

  useEffect(() => {
    if (
      authView === 'ready' &&
      routeWorkspaceReady &&
      editingId &&
      quizzListLoaded &&
      !editingQuizz &&
      pendingSavedQuizzId !== editingId
    ) {
      toast.error('That quiz could not be found')
      navigate(managerWorkspacePath(organization.id), { replace: true })
    }
  }, [
    authView,
    editingId,
    editingQuizz,
    navigate,
    organization?.id,
    pendingSavedQuizzId,
    quizzListLoaded,
    routeWorkspaceReady,
  ])

  useEffect(() => {
    if (pendingSavedQuizz) {
      navigate(managerEditPath(organization.id, pendingSavedQuizz.id), { replace: true })
      setPendingSavedQuizzId(null)
    }
  }, [navigate, organization?.id, pendingSavedQuizz])

  if (managerView === 'unknown') {
    return <RouteNotFoundPage scope="manager" backTo={MANAGER_PATHS.home} />
  }

  if (authView === 'ready' && managerView === 'admin' && !isSuperAdmin) {
    return (
      <RouteNotFoundPage
        scope="manager"
        title="Access denied"
        description="You do not have permission to open this area."
        backTo={MANAGER_PATHS.home}
      />
    )
  }

  // The editor is a full-screen workspace, not a centered auth card — it renders
  // its own app-shell (header · canvas · footer) outside AuthShell.
  if (
    authView === 'ready' &&
    routeWorkspaceReady &&
    managerView === 'editor' &&
    (!editingId || editingQuizz)
  ) {
    return (
      <QuizWizard
        key={editingQuizz?.id ?? 'new'}
        initialQuizz={editingQuizz}
        saving={saving}
        errorMessage={managerFieldError?.action === 'quiz' ? managerFieldError.message : ''}
        onChange={() => setManagerFieldError(null)}
        onSave={handleSave}
        onCancel={() => navigate(managerWorkspacePath(organization.id))}
      />
    )
  }

  let content = null

  const effectiveAuthView =
    authView === 'login' && managerView === 'register' && allowRegistration
      ? 'register'
      : authView === 'login' && managerView === 'forgot'
        ? 'forgot'
        : authView
  const authSearch = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''

  if (effectiveAuthView === 'setup') {
    content = <ManagerSetupScreen />
  } else if (effectiveAuthView === 'register') {
    content = <RegisterScreen onBack={() => navigate(`${MANAGER_PATHS.home}${authSearch}`)} />
  } else if (effectiveAuthView === 'forgot') {
    content = <ForgotPasswordScreen onBack={() => navigate(`${MANAGER_PATHS.home}${authSearch}`)} />
  } else if (effectiveAuthView === 'login') {
    content = (
      <ManagerAuthScreen
        unverifiedUsername={unverifiedUsername}
        allowRegistration={allowRegistration}
        onRegister={() => navigate(`${MANAGER_PATHS.register}${authSearch}`)}
        onForgot={() => navigate(`${MANAGER_PATHS.forgotPassword}${authSearch}`)}
      />
    )
  } else if (authView === 'ready' && routeWorkspaceReady && managerView === 'accounts') {
    content = (
      <AccountsScreen
        currentUsername={username}
        currentRole={accountRole}
        workspaceName={organization.name}
        onBack={() => navigate(managerWorkspacePath(organization.id))}
        onManageAccount={() => navigate(MANAGER_PATHS.accountSettings)}
      />
    )
  } else if (authView === 'ready' && managerView === 'account') {
    content = (
      <AccountSettingsScreen
        currentUsername={username}
        organizations={organizations}
        currentOrganizationId={organization.id}
        onBack={() => navigate(managerWorkspacePath(organization.id))}
      />
    )
  } else if (authView === 'ready' && routeWorkspaceReady && managerView === 'settings') {
    content = (
      <WorkspaceSettingsScreen
        organization={organization}
        organizationCount={organizations.length}
        pending={workspaceMutationPending}
        errorMessage={managerFieldError?.action === 'workspace' ? managerFieldError.message : ''}
        onChange={() => setManagerFieldError(null)}
        onRename={(name) => {
          setWorkspaceMutationPending(true)
          setManagerFieldError(null)
          renameOrganization(organization.id, name)
        }}
        onLeave={() => {
          setWorkspaceMutationPending(true)
          leaveOrganization(organization.id)
        }}
        onDelete={() => {
          setWorkspaceMutationPending(true)
          deleteOrganization(organization.id)
        }}
      />
    )
  } else if (authView === 'ready' && managerView === 'workspaces') {
    content = (
      <WorkspacesScreen
        organizations={organizations}
        onOpen={(organizationId) => navigate(managerWorkspacePath(organizationId))}
        onCreate={() => setCreateOrganizationOpen(true)}
      />
    )
  } else if (authView === 'ready' && managerView === 'admin' && isSuperAdmin) {
    content = (
      <AdminScreen onBack={() => navigate(managerWorkspacePath(organization.id))} />
    )
  } else if (authView === 'ready' && routeWorkspaceReady && managerView === 'list') {
    content = (
      <SelectQuizScreen
        quizzList={quizzList}
        workspaceName={organization.name}
        organizations={organizations}
        currentOrganizationId={organization.id}
        onEdit={(quizz) => navigate(managerEditPath(organization.id, quizz.id))}
        onCreate={() => navigate(managerNewQuizPath(organization.id))}
      />
    )
  }

  const showManagerHeader =
    authView === 'ready' &&
    managerView !== 'editor' &&
    managerView !== 'register' &&
    managerView !== 'forgot'

  const managerHeader = showManagerHeader ? (
    <ManagerHeader
      activeView={managerView}
      accountRole={accountRole}
      username={username}
      organization={organization}
      organizations={organizations}
      onQuizzes={() => navigate(managerWorkspacePath(organization.id))}
      onAccounts={() => navigate(managerWorkspacePath(organization.id, 'members'))}
      onAccountSettings={() => navigate(MANAGER_PATHS.accountSettings)}
      onSettings={() => navigate(managerWorkspacePath(organization.id, 'settings'))}
      onWorkspaces={() => navigate(MANAGER_PATHS.workspaces)}
      onAdmin={() => navigate(MANAGER_PATHS.admin)}
      onSwitchOrganization={(organizationId) =>
        navigate(managerWorkspaceSwitchPath(organizationId, managerView))
      }
      onCreateOrganization={() => setCreateOrganizationOpen(true)}
      onLogout={handleLogout}
      isSuperAdmin={isSuperAdmin}
    />
  ) : null

  return (
    <AuthShell
      isConnected={
        isConnected &&
        authView !== 'loading' &&
        routeWorkspaceReady &&
        !(authView === 'ready' && managerView === 'editor' && editingId && !editingQuizz)
      }
      header={managerHeader}
      showLogo={!showManagerHeader}
    >
      {showManagerHeader && gameId && status && (
        <ActiveGameBanner
          statusName={status.name}
          playerCount={players.length}
          onReturn={() => navigate(`/party/manager/${gameId}`)}
        />
      )}
      {content}
      <CreateOrganizationDialog
        open={createOrganizationOpen}
        pending={creatingOrganization}
        errorMessage={
          managerFieldError?.action === 'createOrganization' ? managerFieldError.message : ''
        }
        onChange={() => setManagerFieldError(null)}
        onCreate={(name) => {
          setCreatingOrganization(true)
          setManagerFieldError(null)
          createOrganization(name)
        }}
        onCancel={() => setCreateOrganizationOpen(false)}
      />
    </AuthShell>
  )
}

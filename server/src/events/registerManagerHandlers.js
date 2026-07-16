import { EVENTS } from '@bazoot/shared/events'
import { STATUS } from '@bazoot/shared/gameStates'
import { validateQuizz } from '@bazoot/shared/quizValidation'
import { GameEngine } from '../game/GameEngine.js'
import { GameError } from '../utils/errors.js'
import { safeHandler } from './safeHandler.js'
import { dispatchToEngine } from './dispatchToEngine.js'
import { RateLimiter } from '../utils/RateLimiter.js'

const slugify = (subject) =>
  subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'quiz'

const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_LOCK_MS = 30_000

const loginRateLimiter = new RateLimiter(LOGIN_MAX_ATTEMPTS, LOGIN_LOCK_MS)

// Handler pattern (Phase 6C): validate → call engine/room manager → emit.
export const registerManagerHandlers = ({
  io,
  socket,
  roomManager,
  questionProvider,
  accountService,
  bus,
  env,
  runtimeSettings,
  socketGuard = null,
  metrics = null,
}) => {
  const managerSafeHandler = (handler) =>
    safeHandler(socket, handler, { errorEvent: EVENTS.MANAGER_ERROR_MESSAGE })
  const guardManagerControl = (event) => {
    socketGuard?.assertAllowed(socket, event, 'managerControl')
  }
  const runSerializedEngineAction = (room, action, args = [], expectAck = false) =>
    roomManager.enqueueRoomAction(
      room.gameId,
      () => dispatchToEngine(room, io, room.gameId, action, args, expectAck),
    )
  const sessionMetadata = () => ({
    userAgent: socket.handshake.headers['user-agent'],
    address: socket.handshake.address,
  })

  const ensureOrganizationQuizWorkspace = async (organizationId) => {
    const legacyOrganizationId = await accountService.legacyOrganizationId()

    if (legacyOrganizationId) {
      await questionProvider.migrateLegacyQuizzes(legacyOrganizationId)
    }

    await questionProvider.ensureWorkspace(organizationId)
  }

  const requireManagedRoom = (gameId) => {
    const room = roomManager.getRoom(gameId)

    if (!room) {
      throw new GameError('Game not found')
    }

    if (room.manager.id !== socket.id) {
      throw new GameError('Only the manager can do that')
    }

    return room
  }

  // ── accounts & sessions ─────────────────────────────────────────────────────

  const applyOrganizationContext = async (username, organizationId, strict = false) => {
    const context = await accountService.organizationContext(username, organizationId, { strict })

    if (!context.organization) {
      throw new GameError('This account does not belong to an organization')
    }

    socket.data.organizationId = context.organization.id
    socket.data.managerRole = context.role
    await ensureOrganizationQuizWorkspace(context.organization.id)

    return context
  }

  const emitQuizList = async (targetSocket = socket) => {
    targetSocket.emit(
      EVENTS.MANAGER_QUIZZ_LIST,
      await questionProvider.listQuizzes(targetSocket.data.organizationId),
    )
  }

  const markAuthenticated = async ({ token, username, organization, organizations, role }) => {
    socket.data.isManager = true
    socket.data.managerUsername = username
    socket.data.managerToken = token
    socket.data.organizationId = organization.id
    socket.data.managerRole = role
    await ensureOrganizationQuizWorkspace(organization.id)
    const isSuperAdmin = await accountService.isSuperAdmin(username)
    socket.emit(EVENTS.MANAGER_AUTH_SUCCESS, { token, username, role, organization, organizations, isSuperAdmin })
    await emitQuizList()
  }

  // Simple per-IP + username brute-force brake on credential checks.
  const getLoginLimiterKey = (username) => {
    return `${socket.handshake.address}:${String(username).toLowerCase()}`
  }

  const checkLoginLock = (username) => {
    if (!loginRateLimiter.check(getLoginLimiterKey(username))) {
      throw new GameError('Too many attempts — wait a moment and try again')
    }
  }

  const recordLoginFailure = (username) => {
    loginRateLimiter.recordFailure(getLoginLimiterKey(username))
  }

  socket.on(
    EVENTS.MANAGER_AUTH,
    safeHandler(socket, async ({ username, password }) => {
      checkLoginLock(username)

      try {
        const session = await accountService.login(username, password, sessionMetadata())
        loginRateLimiter.clear(getLoginLimiterKey(username))
        await markAuthenticated(session)
      } catch (error) {
        // Correct credentials but unverified email: not a failed login — tell
        // the client so it can offer a one-click resend for this account.
        if (error.code === 'EMAIL_UNVERIFIED') {
          loginRateLimiter.clear(getLoginLimiterKey(username))
          socket.emit(EVENTS.MANAGER_AUTH_STATE, {
            state: 'unverified',
            username,
            allowRegistration: runtimeSettings.snapshot().allowRegistration,
          })

          return
        }

        if (error.code === 'APPROVAL_PENDING') {
          loginRateLimiter.clear(getLoginLimiterKey(username))
          throw error
        }

        recordLoginFailure(username)
        throw error
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER_AUTH_STATUS,
    safeHandler(socket, async ({ token, organizationId } = {}) => {
      if (!(await accountService.hasAccounts())) {
        socket.emit(EVENTS.MANAGER_AUTH_STATE, {
          state: 'setup',
          allowRegistration: runtimeSettings.snapshot().allowRegistration,
        })

        return
      }

      const username = accountService.resume(token, sessionMetadata())

      if (!username) {
        socket.emit(EVENTS.MANAGER_AUTH_STATE, {
          state: 'login',
          allowRegistration: runtimeSettings.snapshot().allowRegistration,
        })

        return
      }

      socket.data.isManager = true
      socket.data.managerUsername = username
      socket.data.managerToken = token
      const context = await applyOrganizationContext(username, organizationId)
      socket.emit(EVENTS.MANAGER_AUTH_STATE, {
        state: 'authenticated',
        username,
        role: context.role,
        organization: context.organization,
        organizations: context.organizations,
        isSuperAdmin: await accountService.isSuperAdmin(username)
      })
      await emitQuizList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_SETUP,
    safeHandler(socket, async ({ username, password, email }) => {
      const session = await accountService.setupInitial(username, password, email, sessionMetadata())
      console.log(`First manager account created: ${session.username}`)
      await markAuthenticated(session)
    }),
  )

  socket.on(
    EVENTS.MANAGER_REGISTER,
    safeHandler(socket, async ({ username, password, email, organizationName }) => {
      await accountService.register(username, password, email, organizationName)
      console.log(`New manager account registered: ${username}`)
      // Back to the login screen — the account either is active now (verification
      // off) or must be verified via the emailed link first.
      socket.emit(EVENTS.MANAGER_AUTH_STATE, {
        state: 'login',
        allowRegistration: runtimeSettings.snapshot().allowRegistration,
      })
    }),
  )

  socket.on(
    EVENTS.MANAGER_FORGOT_PASSWORD,
    safeHandler(socket, async ({ identifier }) => {
      await accountService.requestPasswordReset(identifier)
      // Always the same reply, even for unknown accounts — no probing.
      socket.emit(EVENTS.MANAGER_PASSWORD_RESET_SENT)
    }),
  )

  socket.on(
    EVENTS.MANAGER_RESET_PASSWORD,
    safeHandler(socket, async ({ token, newPassword }) => {
      const result = await accountService.resetPassword(token, newPassword)
      socket.emit(EVENTS.MANAGER_PASSWORD_RESET_SUCCESS, result)
    }),
  )

  socket.on(
    EVENTS.MANAGER_VERIFY_EMAIL,
    safeHandler(socket, async ({ token }) => {
      const result = await accountService.verifyEmail(token)
      socket.emit(EVENTS.MANAGER_EMAIL_VERIFIED, result)
    }),
  )

  socket.on(
    EVENTS.MANAGER_INSPECT_INVITATION,
    safeHandler(socket, async ({ token }) => {
      socket.emit(EVENTS.MANAGER_INVITATION_DETAILS, await accountService.inspectInvitation(token))
    }),
  )

  socket.on(
    EVENTS.MANAGER_ACCEPT_INVITATION,
    safeHandler(socket, async ({ token, username, password }) => {
      const result = await accountService.acceptInvitation(token, username, password)
      socket.emit(EVENTS.MANAGER_INVITATION_ACCEPTED, result)
      await emitAccountsList()
      await emitInvitationsList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_RESEND_VERIFICATION,
    safeHandler(socket, async ({ username }) => {
      await accountService.resendVerification(username)
      socket.emit(EVENTS.MANAGER_VERIFICATION_SENT)
    }),
  )

  socket.on(
    EVENTS.MANAGER_UPDATE_EMAIL,
    safeHandler(socket, async ({ username, email }) => {
      await requireAdminAccount()
      await accountService.changeEmail(username, email, socket.data.organizationId)
      socket.emit(EVENTS.MANAGER_VERIFICATION_SENT)
      await emitAccountsList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_LOGOUT,
    safeHandler(socket, ({ token } = {}) => {
      accountService.logout(token)
      socket.data.isManager = false
      socket.data.managerUsername = undefined
      socket.data.managerToken = undefined
      socket.data.managerRole = undefined
      socket.data.organizationId = undefined
    }),
  )

  const requireManagerAccount = () => {
    if (!socket.data.isManager) {
      throw new GameError('Not authenticated')
    }

    return socket.data.managerUsername
  }

  const emitAccountSettings = async () => {
    const username = requireManagerAccount()
    socket.emit(
      EVENTS.MANAGER_ACCOUNT_SETTINGS,
      await accountService.accountSettings(username, socket.data.managerToken),
    )
  }

  const logOutUserSockets = (username) => {
    for (const managerSocket of socket.nsp.sockets.values()) {
      if (managerSocket.data.managerUsername !== username) {
        continue
      }

      managerSocket.data.isManager = false
      managerSocket.data.managerUsername = undefined
      managerSocket.data.managerToken = undefined
      managerSocket.data.managerRole = undefined
      managerSocket.data.organizationId = undefined
      managerSocket.emit(EVENTS.MANAGER_AUTH_STATE, { state: 'login' })
    }
  }

  const requireAdminAccount = async () => {
    const username = requireManagerAccount()
    const role = await accountService.roleFor(username, socket.data.organizationId)

    if (role !== 'admin' && role !== 'owner') {
      throw new GameError('Only admins can manage accounts')
    }

    socket.data.managerRole = role

    return username
  }

  const requireOwnerAccount = async () => {
    const username = requireManagerAccount()
    const role = await accountService.roleFor(username, socket.data.organizationId)

    if (role !== 'owner') {
      throw new GameError('Only organization owners can manage owners')
    }

    return username
  }

  const emitAccountsList = async () => {
    for (const managerSocket of socket.nsp.sockets.values()) {
      if (!managerSocket.data.isManager) {
        continue
      }

      const accounts = await accountService.listAccounts(managerSocket.data.organizationId)
      const account = accounts.find(
        (candidate) => candidate.username === managerSocket.data.managerUsername,
      )

      if (account) {
        managerSocket.data.managerRole = account.role
      } else {
        managerSocket.data.isManager = false
        managerSocket.data.managerUsername = undefined
        managerSocket.data.managerToken = undefined
        managerSocket.data.managerRole = undefined
      }

      managerSocket.emit(EVENTS.MANAGER_ACCOUNTS_LIST, accounts)
    }
  }

  const emitInvitationsList = async () => {
    for (const managerSocket of socket.nsp.sockets.values()) {
      if (
        managerSocket.data.isManager &&
        (managerSocket.data.managerRole === 'admin' || managerSocket.data.managerRole === 'owner')
      ) {
        managerSocket.emit(
          EVENTS.MANAGER_INVITATIONS_LIST,
          await accountService.listInvitations(managerSocket.data.organizationId),
        )
      }
    }
  }

  const refreshWorkspaceSockets = async (organizationId, { removed = false } = {}) => {
    for (const managerSocket of socket.nsp.sockets.values()) {
      if (!managerSocket.data.isManager || managerSocket.data.organizationId !== organizationId) {
        continue
      }

      const username = managerSocket.data.managerUsername
      const context = await accountService.organizationContext(
        username,
        removed ? undefined : organizationId,
      )

      if (!context.organization) {
        managerSocket.data.isManager = false
        managerSocket.data.managerUsername = undefined
        managerSocket.data.managerToken = undefined
        managerSocket.data.managerRole = undefined
        managerSocket.data.organizationId = undefined
        managerSocket.emit(EVENTS.MANAGER_AUTH_STATE, { state: 'login' })
        continue
      }

      managerSocket.data.organizationId = context.organization.id
      managerSocket.data.managerRole = context.role
      managerSocket.emit(EVENTS.MANAGER_ORGANIZATION_CONTEXT, context)
      managerSocket.emit(
        EVENTS.MANAGER_QUIZZ_LIST,
        await questionProvider.listQuizzes(context.organization.id),
      )
    }
  }

  socket.on(
    EVENTS.MANAGER_CREATE_ORGANIZATION,
    safeHandler(socket, async ({ name }) => {
      const username = requireManagerAccount()
      const organization = await accountService.createOrganization(username, name)
      const context = await applyOrganizationContext(username, organization.id)
      socket.emit(EVENTS.MANAGER_ORGANIZATION_CONTEXT, context)
      socket.emit(EVENTS.MANAGER_ACCOUNTS_LIST, await accountService.listAccounts(organization.id))
      socket.emit(EVENTS.MANAGER_INVITATIONS_LIST, [])
      await emitQuizList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_SWITCH_ORGANIZATION,
    safeHandler(socket, async ({ organizationId }) => {
      const username = requireManagerAccount()
      const context = await applyOrganizationContext(username, organizationId, true)
      socket.emit(EVENTS.MANAGER_ORGANIZATION_CONTEXT, context)
      socket.emit(
        EVENTS.MANAGER_ACCOUNTS_LIST,
        await accountService.listAccounts(context.organization.id),
      )
      socket.emit(
        EVENTS.MANAGER_INVITATIONS_LIST,
        await accountService.listInvitations(context.organization.id),
      )
      await emitQuizList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_RENAME_ORGANIZATION,
    safeHandler(socket, async ({ organizationId, name }) => {
      const username = await requireOwnerAccount()

      if (organizationId !== socket.data.organizationId) {
        throw new GameError('Switch to the workspace before renaming it')
      }

      await accountService.renameOrganization(username, organizationId, name)
      await refreshWorkspaceSockets(organizationId)
    }),
  )

  socket.on(
    EVENTS.MANAGER_LEAVE_ORGANIZATION,
    safeHandler(socket, async ({ organizationId }) => {
      const username = requireManagerAccount()

      if (organizationId !== socket.data.organizationId) {
        throw new GameError('Switch to the workspace before leaving it')
      }

      const context = await accountService.leaveOrganization(username, organizationId)
      await applyOrganizationContext(username, context.organization.id, true)
      socket.emit(EVENTS.MANAGER_ORGANIZATION_CONTEXT, context)
      await emitQuizList()
      await emitAccountsList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_DELETE_ORGANIZATION,
    safeHandler(socket, async ({ organizationId }) => {
      const username = await requireOwnerAccount()

      if (organizationId !== socket.data.organizationId) {
        throw new GameError('Switch to the workspace before deleting it')
      }

      const context = await accountService.deleteOrganization(username, organizationId)
      await questionProvider.deleteWorkspace(organizationId)
      await applyOrganizationContext(username, context.organization.id, true)
      socket.emit(EVENTS.MANAGER_ORGANIZATION_CONTEXT, context)
      await emitQuizList()
      await refreshWorkspaceSockets(organizationId, { removed: true })
    }),
  )

  socket.on(
    EVENTS.MANAGER_LIST_ACCOUNTS,
    safeHandler(socket, async () => {
      requireManagerAccount()
      socket.emit(
        EVENTS.MANAGER_ACCOUNTS_LIST,
        await accountService.listAccounts(socket.data.organizationId),
      )
    }),
  )

  socket.on(
    EVENTS.MANAGER_LIST_INVITATIONS,
    safeHandler(socket, async () => {
      await requireAdminAccount()
      socket.emit(
        EVENTS.MANAGER_INVITATIONS_LIST,
        await accountService.listInvitations(socket.data.organizationId),
      )
    }),
  )

  socket.on(
    EVENTS.MANAGER_CREATE_INVITATION,
    safeHandler(socket, async ({ email, role }) => {
      await requireAdminAccount()
      const result = await accountService.createInvitation(email, role, socket.data.organizationId)
      socket.emit(EVENTS.MANAGER_INVITATION_CREATED, result)
      await emitInvitationsList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_CANCEL_INVITATION,
    safeHandler(socket, async ({ email }) => {
      await requireAdminAccount()
      await accountService.cancelInvitation(email, socket.data.organizationId)
      await emitInvitationsList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_APPROVE_ACCOUNT,
    safeHandler(socket, async ({ username }) => {
      await requireAdminAccount()
      await accountService.approveAccount(username, socket.data.organizationId)
      await emitAccountsList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_ADD_ACCOUNT,
    safeHandler(socket, async ({ username, password, email, role }) => {
      await requireAdminAccount()
      await accountService.createAccount(username, password, email, {
        role,
        organizationId: socket.data.organizationId,
      })
      await emitAccountsList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_UPDATE_ACCOUNT_ROLE,
    safeHandler(socket, async ({ username, role }) => {
      const self = await requireAdminAccount()
      const currentRole = await accountService.roleFor(username, socket.data.organizationId)

      if (username === self) {
        throw new GameError('You cannot change your own role')
      }

      if (role === 'owner' || currentRole === 'owner') {
        await requireOwnerAccount()
      }

      await accountService.changeRole(username, role, socket.data.organizationId)
      await emitAccountsList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_DELETE_ACCOUNT,
    safeHandler(socket, async ({ username }) => {
      const self = await requireAdminAccount()
      const currentRole = await accountService.roleFor(username, socket.data.organizationId)

      if (username === self) {
        throw new GameError('You cannot remove your own account')
      }

      if (currentRole === 'owner') {
        await requireOwnerAccount()
      }

      await accountService.deleteAccount(username, socket.data.organizationId)

      await emitAccountsList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_CHANGE_PASSWORD,
    safeHandler(socket, async ({ currentPassword, newPassword }) => {
      const self = requireManagerAccount()
      checkLoginLock(self)

      try {
        await accountService.changePassword(self, currentPassword, newPassword)
        loginRateLimiter.clear(getLoginLimiterKey(self))
        socket.emit(
          EVENTS.MANAGER_ACCOUNTS_LIST,
          await accountService.listAccounts(socket.data.organizationId),
        )
        await emitAccountSettings()
      } catch (error) {
        recordLoginFailure(self)
        throw error
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER_GET_ACCOUNT_SETTINGS,
    safeHandler(socket, emitAccountSettings),
  )

  socket.on(
    EVENTS.MANAGER_CHANGE_OWN_EMAIL,
    safeHandler(socket, async ({ currentPassword, email }) => {
      const username = requireManagerAccount()
      checkLoginLock(username)

      try {
        await accountService.changeOwnEmail(username, currentPassword, email)
        loginRateLimiter.clear(getLoginLimiterKey(username))
        socket.emit(EVENTS.MANAGER_VERIFICATION_SENT)
        await emitAccountSettings()
      } catch (error) {
        recordLoginFailure(username)
        throw error
      }
    }),
  )

  socket.on(
    EVENTS.MANAGER_LOGOUT_ALL,
    safeHandler(socket, () => {
      const username = requireManagerAccount()
      accountService.logoutAll(username)
      logOutUserSockets(username)
    }),
  )

  socket.on(
    EVENTS.MANAGER_REVOKE_SESSION,
    safeHandler(socket, async ({ sessionId } = {}) => {
      const username = requireManagerAccount()
      accountService.logoutSession(username, sessionId, socket.data.managerToken)

      for (const managerSocket of socket.nsp.sockets.values()) {
        if (
          managerSocket.data.managerUsername === username &&
          accountService.sessionId(managerSocket.data.managerToken) === sessionId
        ) {
          managerSocket.data.isManager = false
          managerSocket.data.managerUsername = undefined
          managerSocket.data.managerToken = undefined
          managerSocket.data.managerRole = undefined
          managerSocket.data.organizationId = undefined
          managerSocket.emit(EVENTS.MANAGER_AUTH_STATE, { state: 'login' })
        }
      }

      await emitAccountSettings()
    }),
  )

  socket.on(
    EVENTS.MANAGER_DELETE_OWN_ACCOUNT,
    safeHandler(socket, async ({ currentPassword }) => {
      const username = requireManagerAccount()
      checkLoginLock(username)

      try {
        await accountService.deleteOwnAccount(username, currentPassword)
        loginRateLimiter.clear(getLoginLimiterKey(username))
        logOutUserSockets(username)
        await emitAccountsList()
      } catch (error) {
        recordLoginFailure(username)
        throw error
      }
    }),
  )

  // ── quiz editor (writable providers only, authenticated sockets only) ──────

  const requireEditorAccess = () => {
    if (!socket.data.isManager) {
      throw new GameError('Not authenticated')
    }

    if (!questionProvider.isWritable()) {
      throw new GameError('This question source does not support editing')
    }
  }

  const requireValidQuizz = (quizz) => {
    const result = validateQuizz(quizz)

    if (!result.ok) {
      throw new GameError(result.message)
    }
  }

  socket.on(
    EVENTS.MANAGER_CREATE_QUIZZ,
    safeHandler(socket, async ({ quizz }) => {
      requireEditorAccess()

      const existing = await questionProvider.listQuizzes(socket.data.organizationId)
      const base = slugify(quizz.subject)
      let quizzId = base
      let suffix = 2

      while (existing.some((q) => q.id === quizzId)) {
        quizzId = `${base}-${suffix}`
        suffix += 1
      }

      await questionProvider.saveQuizz(socket.data.organizationId, quizzId, quizz)
      socket.emit(EVENTS.MANAGER_QUIZZ_SAVED, { quizzId })
      await emitQuizList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_UPDATE_QUIZZ,
    safeHandler(socket, async ({ quizzId, quizz }) => {
      requireEditorAccess()

      const existing = await questionProvider.getQuestions(socket.data.organizationId, quizzId)

      if (!existing) {
        throw new GameError('Quizz not found')
      }

      await questionProvider.saveQuizz(socket.data.organizationId, quizzId, quizz)
      socket.emit(EVENTS.MANAGER_QUIZZ_SAVED, { quizzId })
      await emitQuizList()
    }),
  )

  socket.on(
    EVENTS.MANAGER_DELETE_QUIZZ,
    safeHandler(socket, async ({ quizzId }) => {
      requireEditorAccess()

      await questionProvider.deleteQuizz(socket.data.organizationId, quizzId)
      socket.emit(EVENTS.MANAGER_QUIZZ_SAVED, { quizzId })
      await emitQuizList()
    }),
  )

  const transferQuizz = async (quizzId, targetOrganizationId, { move = false } = {}) => {
    requireEditorAccess()
    const username = socket.data.managerUsername
    const sourceOrganizationId = socket.data.organizationId

    if (targetOrganizationId === sourceOrganizationId) {
      throw new GameError('Source and target workspace are the same')
    }

    // Verify the user belongs to the target workspace.
    await accountService.organizationContext(username, targetOrganizationId, { strict: true })
    await questionProvider.ensureWorkspace(targetOrganizationId)

    const quizz = await questionProvider.getQuestions(sourceOrganizationId, quizzId)

    if (!quizz) {
      throw new GameError('Quizz not found')
    }

    // Slug-deduplicate in the target workspace.
    const existing = await questionProvider.listQuizzes(targetOrganizationId)
    const base = quizzId
    let newId = base
    let suffix = 2

    while (existing.some((q) => q.id === newId)) {
      newId = `${base}-${suffix}`
      suffix += 1
    }

    await questionProvider.saveQuizz(targetOrganizationId, newId, quizz)

    if (move) {
      await questionProvider.deleteQuizz(sourceOrganizationId, quizzId)
    }

    await emitQuizList()
  }

  socket.on(
    EVENTS.MANAGER_COPY_QUIZZ,
    safeHandler(socket, async ({ quizzId, targetOrganizationId }) => {
      await transferQuizz(quizzId, targetOrganizationId, { move: false })
    }),
  )

  socket.on(
    EVENTS.MANAGER_MOVE_QUIZZ,
    safeHandler(socket, async ({ quizzId, targetOrganizationId }) => {
      await transferQuizz(quizzId, targetOrganizationId, { move: true })
    }),
  )

  socket.on(
    EVENTS.GAME_CREATE,
    managerSafeHandler(async (quizzId) => {
      guardManagerControl(EVENTS.GAME_CREATE)
      requireManagerAccount()
      const quizz = await questionProvider.getQuestions(socket.data.organizationId, quizzId)

      if (!quizz) {
        throw new GameError('Quizz not found')
      }

      // Drafts may be saved at any stage, but a live room always needs a fully
      // playable quiz. Keep this server-side guard even though the editor also
      // disables Host, so API clients cannot bypass it.
      requireValidQuizz(quizz)

      const room = roomManager.createRoom({
        managerSocketId: socket.id,
        managerClientId: socket.handshake.auth.clientId,
        organizationId: socket.data.organizationId,
        hostedBy: socket.data.managerUsername,
      })

      const settings = runtimeSettings.snapshot()

      roomManager.setEngine(room, new GameEngine({
        room,
        quizz,
        bus,
        scoreMax: settings.scoreMax,
        defaultQuestionTime: settings.questionTimeLimit,
        onRoomChanged: () => roomManager.persistRoom(room),
      }))

      socket.join(room.gameId)
      socket.emit(EVENTS.MANAGER_GAME_CREATED, {
        gameId: room.gameId,
        inviteCode: room.inviteCode,
      })
      console.log(`New game created: ${room.inviteCode} subject: ${quizz.subject}`)
    }),
  )

  socket.on(
    EVENTS.MANAGER_START_GAME,
    managerSafeHandler(async ({ gameId }) => {
      guardManagerControl(EVENTS.MANAGER_START_GAME)
      const room = requireManagedRoom(gameId)

      await runSerializedEngineAction(room, 'start')
    }),
  )

  socket.on(
    EVENTS.MANAGER_KICK_PLAYER,
    managerSafeHandler(async ({ gameId, playerId }) => {
      guardManagerControl(EVENTS.MANAGER_KICK_PLAYER)
      const room = requireManagedRoom(gameId)
      const player = roomManager.getPlayerBySocketId(room, playerId)

      if (!player) {
        return
      }

      roomManager.removePlayer(room, playerId)
      await runSerializedEngineAction(room, 'removePlayerStatus', [playerId])

      bus.kick(room.gameId, playerId)
      bus.sendTo(playerId, EVENTS.GAME_RESET, 'You have been kicked by the manager')
      bus.sendTo(room.manager.id, EVENTS.MANAGER_PLAYER_KICKED, playerId)
      bus.broadcast(room.gameId, EVENTS.GAME_TOTAL_PLAYERS, room.players.length)
    }),
  )

  socket.on(
    EVENTS.MANAGER_ABORT_QUIZ,
    managerSafeHandler(async ({ gameId }) => {
      guardManagerControl(EVENTS.MANAGER_ABORT_QUIZ)
      const room = requireManagedRoom(gameId)

      await runSerializedEngineAction(room, 'abortRound')
    }),
  )

  socket.on(
    EVENTS.MANAGER_NEXT_QUESTION,
    managerSafeHandler(async ({ gameId }) => {
      guardManagerControl(EVENTS.MANAGER_NEXT_QUESTION)
      const room = requireManagedRoom(gameId)

      await runSerializedEngineAction(room, 'nextQuestion')
    }),
  )

  socket.on(
    EVENTS.MANAGER_SHOW_LEADERBOARD,
    managerSafeHandler(async ({ gameId }) => {
      guardManagerControl(EVENTS.MANAGER_SHOW_LEADERBOARD)
      const room = requireManagedRoom(gameId)

      await runSerializedEngineAction(room, 'showLeaderboard')
    }),
  )

  socket.on(
    EVENTS.MANAGER_RESET_GAME,
    managerSafeHandler(async ({ gameId }) => {
      guardManagerControl(EVENTS.MANAGER_RESET_GAME)
      const room = requireManagedRoom(gameId)

      await runSerializedEngineAction(room, 'resetGame')
    }),
  )

  socket.on(
    EVENTS.MANAGER_END_GAME,
    managerSafeHandler(async ({ gameId }) => {
      guardManagerControl(EVENTS.MANAGER_END_GAME)
      const room = requireManagedRoom(gameId)

      await roomManager.enqueueRoomAction(room.gameId, () => {
        bus.broadcast(room.gameId, EVENTS.GAME_RESET, 'Game ended by the manager', socket.id)
        socket.emit(EVENTS.MANAGER_GAME_ENDED)
        roomManager.destroyRoom(room.gameId)
      })
    }),
  )

  socket.on(
    EVENTS.MANAGER_RECONNECT,
    managerSafeHandler(async ({ gameId }) => {
      guardManagerControl(EVENTS.MANAGER_RECONNECT)
      const room = roomManager.getManagerRoom(gameId, socket.handshake.auth.clientId)

      if (!room) {
        socket.emit(EVENTS.GAME_RESET, 'Game expired')

        return
      }

      if (room.manager.connected) {
        socket.emit(EVENTS.GAME_RESET, 'Manager already connected')

        return
      }

      socket.join(room.gameId)
      roomManager.reconnectManager(room, socket.id)
      metrics?.recordReconnect?.()

      let status = await runSerializedEngineAction(room, 'managerReconnectStatus', [], true)
      let currentQuestion = await runSerializedEngineAction(room, 'questionProgress', [], true)

      status = status ?? {
        name: STATUS.WAIT,
        data: { text: 'Waiting for players' },
      }
      
      currentQuestion = currentQuestion ?? { current: 1, total: null }

      socket.emit(EVENTS.MANAGER_SUCCESS_RECONNECT, {
        gameId: room.gameId,
        currentQuestion,
        status,
        players: room.players,
      })
      socket.emit(EVENTS.GAME_TOTAL_PLAYERS, room.players.length)

      console.log(`Manager reconnected to game ${room.inviteCode}`)
    }),
  )
}

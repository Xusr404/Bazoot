import { EVENTS } from '@bazoot/shared/events'
import { STATUS } from '@bazoot/shared/gameStates'
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import { useSocket, useSocketEvent } from '../hooks/useSocket.js'

// Single source of client game state (Phase 7B). Listens to server events,
// projects them into state, exposes dispatch actions. No screen component
// reaches past this context, and no game decision is made here — the server
// GameEngine is the only authority.

// Exported for the demo run, whose provider feeds the same screens from a
// simulated engine instead of the live socket.
export const GameContext = createContext(null)

// Statuses each role is allowed to render (mirrors the source's component
// maps). Exported so the demo run filters broadcasts identically — e.g.
// players never see FINISHED; they keep their personal result instead.
export const PLAYER_STATUSES = new Set([
  STATUS.SELECT_ANSWER,
  STATUS.SHOW_QUESTION,
  STATUS.WAIT,
  STATUS.SHOW_START,
  STATUS.SHOW_RESULT,
  STATUS.SHOW_PREPARED,
])

export const MANAGER_STATUSES = new Set([
  ...PLAYER_STATUSES,
  STATUS.SHOW_ROOM,
  STATUS.SHOW_RESPONSES,
  STATUS.SHOW_LEADERBOARD,
  STATUS.FINISHED,
])

const initialState = {
  gameId: null,
  status: null, // { name, data }
  questionProgress: null, // { current, total }
  player: null, // { username, points } — player role only
  players: [], // lobby list — manager role only
}

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_GAME_ID':
      return { ...state, gameId: action.gameId }
    case 'SET_STATUS':
      return { ...state, status: { name: action.name, data: action.data } }
    case 'SET_QUESTION_PROGRESS':
      return { ...state, questionProgress: action.progress }
    case 'SET_PLAYER':
      return { ...state, player: action.player }
    case 'UPDATE_POINTS':
      return { ...state, player: { ...state.player, points: action.points } }
    case 'SET_PLAYERS':
      return { ...state, players: action.players }
    case 'ADD_PLAYER':
      return { ...state, players: [...state.players, action.player] }
    case 'REMOVE_PLAYER':
      return { ...state, players: state.players.filter((p) => p.id !== action.playerId) }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

export const GameProvider = ({ role, children }) => {
  const [state, dispatch] = useReducer(reducer, initialState)
  const { isConnected, connect, emit } = useSocket()
  const allowedStatuses = role === 'manager' ? MANAGER_STATUSES : PLAYER_STATUSES

  useSocketEvent(
    EVENTS.GAME_STATUS,
    useCallback(
      ({ name, data }) => {
        if (allowedStatuses.has(name)) {
          dispatch({ type: 'SET_STATUS', name, data })
        }
      },
      [allowedStatuses],
    ),
  )

  useSocketEvent(
    EVENTS.GAME_UPDATE_QUESTION,
    useCallback((progress) => {
      dispatch({ type: 'SET_QUESTION_PROGRESS', progress })
    }, []),
  )

  // Sent per-player when the score changes outside a reveal (rematch reset).
  useSocketEvent(
    EVENTS.PLAYER_UPDATE_POINTS,
    useCallback((points) => {
      dispatch({ type: 'UPDATE_POINTS', points })
    }, []),
  )

  // ── actions (the only way screens talk to the server) ──────────────────────

  const joinRoom = useCallback((inviteCode) => emit(EVENTS.PLAYER_JOIN, inviteCode), [emit])

  const login = useCallback(
    (gameId, username, avatar) =>
      emit(EVENTS.PLAYER_LOGIN, { gameId, data: { username, avatar } }),
    [emit],
  )

  const sendReaction = useCallback(
    (emoji) => {
      if (state.gameId) {
        emit(EVENTS.PLAYER_REACTION, { gameId: state.gameId, emoji })
      }
    },
    [emit, state.gameId],
  )

  const submitAnswer = useCallback(
    (answerKey) => {
      if (role !== 'player') {
        return
      }

      emit(EVENTS.PLAYER_SELECTED_ANSWER, { gameId: state.gameId, data: { answerKey } })
    },
    [emit, role, state.gameId],
  )

  const authenticateManager = useCallback(
    (username, password) => emit(EVENTS.MANAGER_AUTH, { username, password }),
    [emit],
  )

  const checkManagerAuth = useCallback(
    (token, organizationId) => emit(EVENTS.MANAGER_AUTH_STATUS, { token, organizationId }),
    [emit],
  )

  const setupManager = useCallback(
    (username, password, email) => emit(EVENTS.MANAGER_SETUP, { username, password, email }),
    [emit],
  )

  const registerManager = useCallback(
    (username, password, email, organizationName) =>
      emit(EVENTS.MANAGER_REGISTER, { username, password, email, organizationName }),
    [emit],
  )

  const createOrganization = useCallback(
    (name) => emit(EVENTS.MANAGER_CREATE_ORGANIZATION, { name }),
    [emit],
  )

  const switchOrganization = useCallback(
    (organizationId) => emit(EVENTS.MANAGER_SWITCH_ORGANIZATION, { organizationId }),
    [emit],
  )

  const renameOrganization = useCallback(
    (organizationId, name) => emit(EVENTS.MANAGER_RENAME_ORGANIZATION, { organizationId, name }),
    [emit],
  )

  const leaveOrganization = useCallback(
    (organizationId) => emit(EVENTS.MANAGER_LEAVE_ORGANIZATION, { organizationId }),
    [emit],
  )

  const deleteOrganization = useCallback(
    (organizationId) => emit(EVENTS.MANAGER_DELETE_ORGANIZATION, { organizationId }),
    [emit],
  )

  const requestPasswordReset = useCallback(
    (identifier) => emit(EVENTS.MANAGER_FORGOT_PASSWORD, { identifier }),
    [emit],
  )

  const resetPassword = useCallback(
    (token, newPassword) => emit(EVENTS.MANAGER_RESET_PASSWORD, { token, newPassword }),
    [emit],
  )

  const verifyEmail = useCallback((token) => emit(EVENTS.MANAGER_VERIFY_EMAIL, { token }), [emit])

  const resendVerification = useCallback(
    (username) => emit(EVENTS.MANAGER_RESEND_VERIFICATION, { username }),
    [emit],
  )

  const updateEmail = useCallback(
    (username, email) => emit(EVENTS.MANAGER_UPDATE_EMAIL, { username, email }),
    [emit],
  )

  const logoutManager = useCallback((token) => emit(EVENTS.MANAGER_LOGOUT, { token }), [emit])
  const getAccountSettings = useCallback(() => emit(EVENTS.MANAGER_GET_ACCOUNT_SETTINGS), [emit])
  const changeOwnEmail = useCallback(
    (currentPassword, email) =>
      emit(EVENTS.MANAGER_CHANGE_OWN_EMAIL, { currentPassword, email }),
    [emit],
  )
  const logoutAllManagerSessions = useCallback(() => emit(EVENTS.MANAGER_LOGOUT_ALL), [emit])
  const revokeManagerSession = useCallback(
    (sessionId) => emit(EVENTS.MANAGER_REVOKE_SESSION, { sessionId }),
    [emit],
  )
  const deleteOwnAccount = useCallback(
    (currentPassword) => emit(EVENTS.MANAGER_DELETE_OWN_ACCOUNT, { currentPassword }),
    [emit],
  )

  const listAccounts = useCallback(() => emit(EVENTS.MANAGER_LIST_ACCOUNTS), [emit])
  const listInvitations = useCallback(() => emit(EVENTS.MANAGER_LIST_INVITATIONS), [emit])

  const createInvitation = useCallback(
    (email, accountRole) => emit(EVENTS.MANAGER_CREATE_INVITATION, { email, role: accountRole }),
    [emit],
  )

  const cancelInvitation = useCallback(
    (email) => emit(EVENTS.MANAGER_CANCEL_INVITATION, { email }),
    [emit],
  )

  const inspectInvitation = useCallback(
    (token) => emit(EVENTS.MANAGER_INSPECT_INVITATION, { token }),
    [emit],
  )

  const acceptInvitation = useCallback(
    (token, username, password) =>
      emit(EVENTS.MANAGER_ACCEPT_INVITATION, { token, username, password }),
    [emit],
  )

  const approveAccount = useCallback(
    (username) => emit(EVENTS.MANAGER_APPROVE_ACCOUNT, { username }),
    [emit],
  )

  const addAccount = useCallback(
    (username, password, email, accountRole) =>
      emit(EVENTS.MANAGER_ADD_ACCOUNT, { username, password, email, role: accountRole }),
    [emit],
  )

  const updateAccountRole = useCallback(
    (username, accountRole) =>
      emit(EVENTS.MANAGER_UPDATE_ACCOUNT_ROLE, { username, role: accountRole }),
    [emit],
  )

  const deleteAccount = useCallback(
    (username) => emit(EVENTS.MANAGER_DELETE_ACCOUNT, { username }),
    [emit],
  )

  const changePassword = useCallback(
    (currentPassword, newPassword) =>
      emit(EVENTS.MANAGER_CHANGE_PASSWORD, { currentPassword, newPassword }),
    [emit],
  )

  const createGame = useCallback((quizzId) => emit(EVENTS.GAME_CREATE, quizzId), [emit])

  const createQuizz = useCallback((quizz) => emit(EVENTS.MANAGER_CREATE_QUIZZ, { quizz }), [emit])

  const updateQuizz = useCallback(
    (quizzId, quizz) => emit(EVENTS.MANAGER_UPDATE_QUIZZ, { quizzId, quizz }),
    [emit],
  )

  const deleteQuizz = useCallback(
    (quizzId) => emit(EVENTS.MANAGER_DELETE_QUIZZ, { quizzId }),
    [emit],
  )

  const copyQuizz = useCallback(
    (quizzId, targetOrganizationId) =>
      emit(EVENTS.MANAGER_COPY_QUIZZ, { quizzId, targetOrganizationId }),
    [emit],
  )

  const moveQuizz = useCallback(
    (quizzId, targetOrganizationId) =>
      emit(EVENTS.MANAGER_MOVE_QUIZZ, { quizzId, targetOrganizationId }),
    [emit],
  )

  const adminGetOverview = useCallback(() => emit(EVENTS.ADMIN_GET_OVERVIEW), [emit])
  const adminListAllAccounts = useCallback(() => emit(EVENTS.ADMIN_LIST_ALL_ACCOUNTS), [emit])
  const adminListAllWorkspaces = useCallback(() => emit(EVENTS.ADMIN_LIST_ALL_WORKSPACES), [emit])
  const adminGetActiveRooms = useCallback(() => emit(EVENTS.ADMIN_GET_ACTIVE_ROOMS), [emit])
  const adminGetServerConfig = useCallback(() => emit(EVENTS.ADMIN_GET_SERVER_CONFIG), [emit])
  const adminUpdateServerSettings = useCallback(
    (settings) => emit(EVENTS.ADMIN_UPDATE_SERVER_SETTINGS, settings),
    [emit],
  )

  const kickPlayer = useCallback(
    (playerId) => {
      if (state.gameId) {
        emit(EVENTS.MANAGER_KICK_PLAYER, { gameId: state.gameId, playerId })
      }
    },
    [emit, state.gameId],
  )

  const managerAdvance = useCallback(
    (event) => {
      if (state.gameId) {
        emit(event, { gameId: state.gameId })
      }
    },
    [emit, state.gameId],
  )

  const endGame = useCallback(() => {
    if (state.gameId) {
      emit(EVENTS.MANAGER_END_GAME, { gameId: state.gameId })
    }
  }, [emit, state.gameId])

  const reconnect = useCallback(
    (gameId) =>
      emit(role === 'manager' ? EVENTS.MANAGER_RECONNECT : EVENTS.PLAYER_RECONNECT, { gameId }),
    [emit, role],
  )

  const value = useMemo(
    () => ({
      role,
      isConnected,
      connect,
      ...state,
      dispatch,
      joinRoom,
      login,
      sendReaction,
      submitAnswer,
      authenticateManager,
      checkManagerAuth,
      setupManager,
      registerManager,
      createOrganization,
      switchOrganization,
      renameOrganization,
      leaveOrganization,
      deleteOrganization,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
      resendVerification,
      updateEmail,
      logoutManager,
      getAccountSettings,
      changeOwnEmail,
      logoutAllManagerSessions,
      revokeManagerSession,
      deleteOwnAccount,
      listAccounts,
      listInvitations,
      createInvitation,
      cancelInvitation,
      inspectInvitation,
      acceptInvitation,
      approveAccount,
      addAccount,
      updateAccountRole,
      deleteAccount,
      changePassword,
      createGame,
      createQuizz,
      updateQuizz,
      deleteQuizz,
      copyQuizz,
      moveQuizz,
      adminGetOverview,
      adminListAllAccounts,
      adminListAllWorkspaces,
      adminGetActiveRooms,
      adminGetServerConfig,
      adminUpdateServerSettings,
      kickPlayer,
      managerAdvance,
      endGame,
      reconnect,
    }),
    [
      role,
      isConnected,
      connect,
      state,
      joinRoom,
      login,
      sendReaction,
      submitAnswer,
      authenticateManager,
      checkManagerAuth,
      setupManager,
      registerManager,
      createOrganization,
      switchOrganization,
      renameOrganization,
      leaveOrganization,
      deleteOrganization,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
      resendVerification,
      updateEmail,
      logoutManager,
      getAccountSettings,
      changeOwnEmail,
      logoutAllManagerSessions,
      revokeManagerSession,
      deleteOwnAccount,
      listAccounts,
      listInvitations,
      createInvitation,
      cancelInvitation,
      inspectInvitation,
      acceptInvitation,
      approveAccount,
      addAccount,
      updateAccountRole,
      deleteAccount,
      changePassword,
      createGame,
      createQuizz,
      updateQuizz,
      deleteQuizz,
      copyQuizz,
      moveQuizz,
      adminGetOverview,
      adminListAllAccounts,
      adminListAllWorkspaces,
      adminGetActiveRooms,
      adminGetServerConfig,
      adminUpdateServerSettings,
      kickPlayer,
      managerAdvance,
      endGame,
      reconnect,
    ],
  )

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export const useGame = () => {
  const context = useContext(GameContext)

  if (!context) {
    throw new Error('useGame must be used inside a GameProvider')
  }

  return context
}

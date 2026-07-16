import { EVENTS } from '@bazoot/shared/events'
import { resolveMailConfig } from '../email/createMailer.js'
import { GameError } from '../utils/errors.js'
import { safeHandler } from './safeHandler.js'

export const registerAdminHandlers = ({
  socket,
  roomManager,
  accountService,
  questionProvider,
  env,
  runtimeSettings,
}) => {
  const requireSiteAdmin = async () => {
    if (!socket.data.isManager) {
      throw new GameError('Not authenticated')
    }

    const superAdmin = await accountService.isSuperAdmin(socket.data.managerUsername)

    if (!superAdmin) {
      throw new GameError('Site admin access requires super admin privileges')
    }

    return socket.data.managerUsername
  }

  const serverConfig = () => {
    const mailConfig = resolveMailConfig(env)
    const settings = runtimeSettings.snapshot()

    return {
      port: env.port,
      allowRegistration: settings.allowRegistration,
      emailVerification: env.emailVerification,
      smtpConfigured: Boolean(env.smtpHost),
      mailProvider: mailConfig.provider,
      mailConfigured: mailConfig.configured,
      maxPlayersPerRoom: settings.maxPlayersPerRoom,
      questionTimeLimit: settings.questionTimeLimit,
      scoreMax: settings.scoreMax,
      sessionTtlDays: Math.round(
        (env.sessionTtlMs ?? 180 * 24 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000),
      ),
    }
  }

  const applyRuntimeSettings = (settings) => {
    accountService.setAllowRegistration?.(settings.allowRegistration)
    roomManager.setMaxPlayersPerRoom(settings.maxPlayersPerRoom)
  }

  socket.on(
    EVENTS.ADMIN_GET_OVERVIEW,
    safeHandler(socket, async () => {
      await requireSiteAdmin()
      const overview = await accountService.adminOverview()
      const activeRooms = [...roomManager.store.values()].length

      socket.emit(EVENTS.ADMIN_OVERVIEW, { ...overview, activeRooms })
    }),
  )

  socket.on(
    EVENTS.ADMIN_LIST_ALL_ACCOUNTS,
    safeHandler(socket, async () => {
      await requireSiteAdmin()
      socket.emit(EVENTS.ADMIN_ALL_ACCOUNTS, await accountService.listAllAccountsAdmin())
    }),
  )

  socket.on(
    EVENTS.ADMIN_LIST_ALL_WORKSPACES,
    safeHandler(socket, async () => {
      await requireSiteAdmin()
      const workspaces = await accountService.listAllWorkspacesAdmin()
      const withCounts = await Promise.all(
        workspaces.map(async (ws) => {
          const quizzes = await questionProvider.listQuizzes(ws.id)

          return { ...ws, quizCount: quizzes.length }
        }),
      )
      socket.emit(EVENTS.ADMIN_ALL_WORKSPACES, withCounts)
    }),
  )

  socket.on(
    EVENTS.ADMIN_GET_ACTIVE_ROOMS,
    safeHandler(socket, async () => {
      await requireSiteAdmin()
      const rooms = [...roomManager.store.values()].map((room) => ({
        gameId: room.gameId,
        inviteCode: room.inviteCode,
        quizSubject: room.engine?.quizz?.subject ?? 'Unknown',
        playerCount: room.players?.length ?? 0,
        hostedBy: room.hostedBy ?? 'Unknown',
      }))
      socket.emit(EVENTS.ADMIN_ACTIVE_ROOMS, rooms)
    }),
  )

  socket.on(
    EVENTS.ADMIN_GET_SERVER_CONFIG,
    safeHandler(socket, async () => {
      await requireSiteAdmin()
      socket.emit(EVENTS.ADMIN_SERVER_CONFIG, serverConfig())
    }),
  )

  socket.on(
    EVENTS.ADMIN_UPDATE_SERVER_SETTINGS,
    safeHandler(socket, async (settingsPatch) => {
      await requireSiteAdmin()
      const settings = runtimeSettings.update(settingsPatch)
      applyRuntimeSettings(settings)
      socket.emit(EVENTS.ADMIN_SERVER_CONFIG, serverConfig())
    }),
  )
}

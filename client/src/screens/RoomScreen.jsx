import { EVENTS } from '@bazoot/shared/events'
import { useState } from 'react'
import { PinPanel } from '../components/game/PinPanel.jsx'
import { PlayerChip } from '../components/game/PlayerChip.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'
import { useSocketEvent } from '../hooks/useSocket.js'

// SHOW_ROOM (manager lobby) — join URL + PIN + QR, live player list, click to
// kick (source Room + RoomView).
export const RoomScreen = () => {
  const { status, players, kickPlayer } = useGame()
  const { t } = useTranslation()
  const { text, inviteCode } = status.data
  const webUrl = window.location.origin

  // After a rematch the lobby reopens with players already in the room — the
  // SHOW_ROOM payload carries them; otherwise fall back to context (reconnect).
  const initialPlayers = status.data.players ?? players
  const [playerList, setPlayerList] = useState(initialPlayers)
  const [totalPlayers, setTotalPlayers] = useState(initialPlayers.length)

  useSocketEvent(EVENTS.MANAGER_NEW_PLAYER, (player) => {
    setPlayerList([...playerList, player])
  })

  useSocketEvent(EVENTS.MANAGER_REMOVE_PLAYER, (playerId) => {
    setPlayerList(playerList.filter((p) => p.id !== playerId))
  })

  useSocketEvent(EVENTS.MANAGER_PLAYER_KICKED, (playerId) => {
    setPlayerList(playerList.filter((p) => p.id !== playerId))
  })

  useSocketEvent(EVENTS.GAME_TOTAL_PLAYERS, (total) => {
    setTotalPlayers(total)
  })

  return (
    <section className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center px-2">
      <PinPanel webUrl={webUrl} inviteCode={inviteCode} />

      <h2 className="mb-4 text-4xl font-bold text-white drop-shadow-lg">{t(text)}</h2>

      <div className="mb-6 flex items-center justify-center rounded-full bg-black/40 px-6 py-3">
        <span className="text-2xl font-bold text-white drop-shadow-md">
          {t('Players Joined: {count}', { count: totalPlayers })}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {playerList.map((player) => (
          <PlayerChip
            key={player.id}
            username={player.username}
            avatar={player.avatar}
            clientId={player.clientId}
            onKick={() => kickPlayer(player.id)}
          />
        ))}
      </div>
    </section>
  )
}

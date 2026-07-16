import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GameContext, MANAGER_STATUSES, PLAYER_STATUSES } from '../context/GameContext.jsx'
import { SocketEventSourceContext } from '../hooks/useSocket.js'
import { createDemoBus } from './demoBus.js'
import { DEMO_PLAYER_ID, DemoEngine } from './DemoEngine.js'

// Drop-in replacement for GameProvider during a demo run: the same context
// shape the game screens read, fed by a local DemoEngine instead of the
// socket. Also scopes useSocketEvent to the demo bus, so countdown ticks and
// lobby events replay without a server — and real socket traffic can't leak
// into the demo (or vice versa).
export const DemoGameProvider = ({ quizz, role, children }) => {
  const [bus] = useState(createDemoBus)
  const [managerStatus, setManagerStatus] = useState(null)
  const [youStatus, setYouStatus] = useState(null)
  const [players, setPlayers] = useState([])
  const [points, setPoints] = useState(0)
  const [questionProgress, setQuestionProgress] = useState(null)
  const engineRef = useRef(null)

  useEffect(() => {
    const engine = new DemoEngine({
      quizz,
      bus,
      listener: {
        // Same per-role filtering as the live GameProvider: broadcasts a role
        // may not render (e.g. FINISHED for players) leave its last status up.
        onManagerStatus: (status) => {
          if (MANAGER_STATUSES.has(status.name)) {
            setManagerStatus(status)
          }
        },
        onPlayerStatus: (status) => {
          if (PLAYER_STATUSES.has(status.name)) {
            setYouStatus(status)
          }
        },
        onPlayers: setPlayers,
        onPoints: setPoints,
        onProgress: setQuestionProgress,
      },
    })

    engineRef.current = engine
    engine.begin()

    return () => {
      engineRef.current = null
      engine.destroy()
    }
  }, [quizz, bus])

  useEffect(() => {
    engineRef.current?.setViewRole(role)
  }, [role])

  const submitAnswer = useCallback((answerKey) => {
    engineRef.current?.receiveAnswer(DEMO_PLAYER_ID, answerKey)
  }, [])

  const kickPlayer = useCallback((playerId) => {
    engineRef.current?.kickPlayer(playerId)
  }, [])

  const managerAdvance = useCallback((event) => {
    engineRef.current?.advance(event)
  }, [])

  // ResultScreen syncs its points via dispatch — everything else is engine-fed.
  const dispatch = useCallback((action) => {
    if (action.type === 'UPDATE_POINTS') {
      setPoints(action.points)
    }
  }, [])

  const noop = useCallback(() => {}, [])

  const value = useMemo(
    () => ({
      role,
      isConnected: true,
      connect: noop,
      gameId: 'demo',
      status: role === 'manager' ? managerStatus : youStatus,
      questionProgress,
      player: { username: 'You', points },
      players,
      dispatch,
      submitAnswer,
      kickPlayer,
      managerAdvance,
    }),
    [
      role,
      noop,
      managerStatus,
      youStatus,
      questionProgress,
      points,
      players,
      dispatch,
      submitAnswer,
      kickPlayer,
      managerAdvance,
    ],
  )

  return (
    <GameContext.Provider value={value}>
      <SocketEventSourceContext.Provider value={bus}>{children}</SocketEventSourceContext.Provider>
    </GameContext.Provider>
  )
}

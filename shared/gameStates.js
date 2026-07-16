// Game status enum; see docs/architecture.md. Statuses double as screen IDs on the
// client and as broadcast states on the server — identical to the source app.

export const STATUS = {
  SHOW_ROOM: 'SHOW_ROOM', // manager lobby (PIN + QR + player list)
  SHOW_START: 'SHOW_START', // quiz subject title, then 3-2-1 countdown square
  SHOW_PREPARED: 'SHOW_PREPARED', // "Question #N" + 3D answer-tile card
  SHOW_QUESTION: 'SHOW_QUESTION', // question text + reading-time progress bar
  SELECT_ANSWER: 'SELECT_ANSWER', // answer grid + ticking timer
  SHOW_RESULT: 'SHOW_RESULT', // per-player correct/wrong + points
  SHOW_RESPONSES: 'SHOW_RESPONSES', // manager bar chart of answers
  SHOW_LEADERBOARD: 'SHOW_LEADERBOARD', // manager top-5 with count-up animation
  FINISHED: 'FINISHED', // podium (top 3) + confetti
  WAIT: 'WAIT', // loader + waiting text
}

// Server-internal engine phases (GameEngine FSM). Broadcast statuses above are
// projections of these phases — see docs/architecture.md for the mapping.
export const ENGINE_STATE = {
  LOBBY: 'LOBBY',
  START_COUNTDOWN: 'START_COUNTDOWN',
  PREPARED: 'PREPARED',
  QUESTION_DISPLAY: 'QUESTION_DISPLAY',
  ANSWERING: 'ANSWERING',
  REVEAL: 'REVEAL',
  LEADERBOARD: 'LEADERBOARD',
  END: 'END',
}

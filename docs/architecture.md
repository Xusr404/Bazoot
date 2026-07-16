# Bazoot architecture

> Maintained overview of the current Bazoot application: a React + Vite client,
> an Express + Socket.IO server, and npm workspaces using JavaScript ESM.

---

## Repository structure

```
bazoot/
  client/                          ← Vite + React 19 app (Tailwind v4, motion, use-sound)
    public/
      icon.svg                     ← favicon (copied from source)
      sounds/*.mp3                 ← 9 sounds, byte-identical to source
    src/
      assets/                      ← background.webp, logo.png, loader.svg
      components/
        game/                      ← AnswerButton, AnswerGrid, AnswersHud, QuestionProgressBar,
                                     ResponsesChart, PodiumColumn, PlayerChip, PinPanel, AnimatedPoints
        ui/                        ← Button, Input, FormCard, Loader, AppToaster
        icons/                     ← Triangle, Rhombus, Circle, Square, CircleCheck, CircleXmark
        layout/                    ← GameFrame (background + chrome), AuthShell (blobs + logo)
      screens/                     ← one file per game state (see 4B mapping) + auth screens
        JoinRoomScreen.jsx  JoinUsernameScreen.jsx  ManagerAuthScreen.jsx  SelectQuizScreen.jsx
        RoomScreen.jsx  WaitScreen.jsx  StartScreen.jsx  PreparedScreen.jsx  QuestionScreen.jsx
        AnswersScreen.jsx  ResultScreen.jsx  ResponsesScreen.jsx  LeaderboardScreen.jsx  PodiumScreen.jsx
      context/                     ← GameContext.jsx (single source of client game state)
      hooks/                       ← useSocket.js, useSocketEvent.js, useGameSounds.js, useScreenSize.js
      pages/                       ← route components: HomePage, ManagerPage, PlayerGamePage, ManagerGamePage
      tokens/                      ← colours.js, typography.js, animations.js, sounds.js, index.js
      styles/app.css               ← Tailwind @theme + source keyframes (verbatim)
      utils/                       ← percentages.js, clientId.js
      main.jsx  router.jsx
    index.html
    vite.config.js                 ← port 3000, /ws proxy → :3001 (same as source)
    package.json

  server/                          ← Express + socket.io
    src/
      config/env.js                ← all env access in one module
      rooms/                       ← RoomStore.js (interface), MemoryRoomStore.js, RoomManager.js
      game/                        ← GameEngine.js (FSM), GameEventBus.js, scoring.js, inviteCode.js
      questions/                   ← QuestionProvider.js (interface), StaticQuestionProvider.js,
                                     APIQuestionProvider.js, DatabaseQuestionProvider.js (stubs)
      events/                      ← registerPlayerHandlers.js, registerManagerHandlers.js,
                                     registerConnectionHandlers.js (validate → engine → emit)
      index.js                     ← Express app + socket.io server + wiring
    test-flow.js                   ← Phase 6D smoke test
    .env  .env.example
    package.json

  shared/                          ← @bazoot/shared — the ONLY client↔server bridge
    events.js                      ← every socket event name (no string literals elsewhere)
    gameStates.js                  ← STATUS enum (client screen map + engine broadcast states)
    validation.js                  ← username / invite-code rules (zod-free, plain functions)
    package.json
    index.js

  package.json                     ← workspaces: ["shared", "server", "client"], root `npm run dev`
  README.md  AGENTS.md
  docs/
    architecture.md                ← this document
    DEPLOYMENT.md                  ← deployment guide
```

**Layer rules (codegraph-enforced by review):**
- `client/**` never imports from `server/**` and vice versa; the only shared surface is `@bazoot/shared`.
- Screens import only from `components/`, `context/`, `hooks/`, `tokens/`, `utils/`, `@bazoot/shared`.
- Components import only from `tokens/`, `components/icons`, `utils/` — never from screens, context, or other components' internals.
- Server `events/` is the only layer that touches sockets; `game/` and `rooms/` are socket-free (testable without I/O).
- Named exports everywhere; no default exports; no circular imports.

---

## Real-time game state

The server `GameEngine` is the single authority. Clients are projectors: they render whatever
status the server last sent (statuses double as screen IDs, exactly like the source).

Engine FSM (one engine per room):

```
LOBBY ──start()──▶ START_COUNTDOWN ──(3s title + 3s ticks)──▶ PREPARED ──(2s)──▶
QUESTION_DISPLAY ──(question.cooldown s)──▶ ANSWERING ──(question.time s ticks |
all connected answered | manager skip)──▶ REVEAL ──showLeaderboard()──▶
  ├─ not last question ─▶ LEADERBOARD ──nextQuestion()──▶ PREPARED (next index)
  └─ last question ─────▶ END ──resetGame() [Play Again]──▶ LOBBY (same PIN,
                              connected players kept, scores reset to 0)
```

Broadcast statuses per engine state (wire-compatible with source so visuals map 1:1):

| Engine state | Status sent | Audience |
|---|---|---|
| LOBBY | `SHOW_ROOM {text, inviteCode}` | manager (players see `WAIT`) |
| START_COUNTDOWN | `SHOW_START {time:3, subject}`, then `game:startCooldown` + `game:cooldown` ticks | all |
| PREPARED | `SHOW_PREPARED {totalAnswers, questionNumber}` | all |
| QUESTION_DISPLAY | `SHOW_QUESTION {question, image?, cooldown}` | all |
| ANSWERING | `SELECT_ANSWER {question, answers, image?, video?, audio?, time, totalPlayer}` + `game:cooldown` ticks; answered player → `WAIT` | all |
| REVEAL | `SHOW_RESULT {correct, message, points, myPoints, rank, aheadOfMe}` per player; `SHOW_RESPONSES {question, responses, correct, answers, image?}` to manager | per-target |
| LEADERBOARD | `SHOW_LEADERBOARD {oldLeaderboard top5, leaderboard top5}` | manager only |
| END | `FINISHED {subject, top: top3}` | all |

Transition triggers:

| Event (from) | Guard | Transition |
|---|---|---|
| `manager:startGame` (LOBBY) | sender is manager, ≥1 player | LOBBY → START_COUNTDOWN |
| internal timers | — | START_COUNTDOWN → PREPARED → QUESTION_DISPLAY → ANSWERING |
| `player:selectedAnswer` (ANSWERING) | player exists, not answered yet | record answer; if all answered → REVEAL |
| answer timer expiry (ANSWERING) | — | ANSWERING → REVEAL |
| `manager:abortQuiz` (ANSWERING) | manager | abort countdown → REVEAL |
| `manager:showLeaderboard` (REVEAL) | manager | → LEADERBOARD or END (last question) |
| `manager:nextQuestion` (LEADERBOARD) | manager, next question exists | → PREPARED (index+1) |
| `manager:resetGame` (END) | manager | → LOBBY: same PIN, disconnected players dropped, scores 0, players → `WAIT` + `player:updatePoints`, manager → `SHOW_ROOM {…, players}` |
| player disconnect (ANSWERING) | — | re-check "all connected answered"; countdown aborts early if the leaver was the last one pending |
| manager disconnect (LOBBY) | — | destroy room, broadcast `game:reset` |
| manager disconnect (started) | — | room marked empty; reaped after 5 min |

Timing constants (must match source): title 3 s, start countdown 3 s, prepared 2 s,
question display = `question.cooldown`, answering = `question.time`, ticks at 1 Hz.
Scoring: `points = max(0, 1000 − (1000/time) × elapsedSeconds)` computed at answer
receipt, rounded on award, 0 if wrong (cap from `SCORE_MAX` env, default 1000).

Client FSM mirror: `GameContext` stores `{ role, gameId, status: {name, data}, questionProgress,
player {username, points}, players[] }` and swaps screens via a `STATUS → screen` map — the
same projection pattern as the source's `GAME_STATE_COMPONENTS` maps.

---

## Socket event contract

All names live in `shared/events.js`; payload shapes are documented there as JSDoc.
Wire names are kept identical to the source for behavioural parity. Excerpt:

```js
export const EVENTS = {
  // server → client
  GAME_STATUS:            'game:status',            // { name: STATUS, data }
  GAME_SUCCESS_ROOM:      'game:successRoom',       // gameId
  GAME_SUCCESS_JOIN:      'game:successJoin',       // gameId
  GAME_TOTAL_PLAYERS:     'game:totalPlayers',      // count
  GAME_ERROR_MESSAGE:     'game:errorMessage',      // message
  GAME_START_COOLDOWN:    'game:startCooldown',     // (void)
  GAME_COOLDOWN:          'game:cooldown',          // secondsRemaining
  GAME_RESET:             'game:reset',             // message
  GAME_UPDATE_QUESTION:   'game:updateQuestion',    // { current, total }
  GAME_PLAYER_ANSWER:     'game:playerAnswer',      // answeredCount
  PLAYER_SUCCESS_RECONNECT:  'player:successReconnect',  // { gameId, status, player, currentQuestion }
  MANAGER_SUCCESS_RECONNECT: 'manager:successReconnect', // { gameId, status, players, currentQuestion }
  MANAGER_QUIZZ_LIST:     'manager:quizzList',      // [{ id, subject, questions }]
  MANAGER_GAME_CREATED:   'manager:gameCreated',    // { gameId, inviteCode }
  MANAGER_NEW_PLAYER:     'manager:newPlayer',      // player
  MANAGER_REMOVE_PLAYER:  'manager:removePlayer',   // playerId
  MANAGER_PLAYER_KICKED:  'manager:playerKicked',   // playerId
  MANAGER_ERROR_MESSAGE:  'manager:errorMessage',   // message

  // client → server
  MANAGER_AUTH:           'manager:auth',           // password
  GAME_CREATE:            'game:create',            // quizzId
  MANAGER_RECONNECT:      'manager:reconnect',      // { gameId }
  MANAGER_KICK_PLAYER:    'manager:kickPlayer',     // { gameId, playerId }
  MANAGER_START_GAME:     'manager:startGame',      // { gameId }
  MANAGER_ABORT_QUIZ:     'manager:abortQuiz',      // { gameId }
  MANAGER_NEXT_QUESTION:  'manager:nextQuestion',   // { gameId }
  MANAGER_SHOW_LEADERBOARD: 'manager:showLeaderboard', // { gameId }
  PLAYER_JOIN:            'player:join',            // inviteCode
  PLAYER_LOGIN:           'player:login',           // { gameId, data: { username } }
  PLAYER_RECONNECT:       'player:reconnect',       // { gameId }
  PLAYER_SELECTED_ANSWER: 'player:selectedAnswer',  // { gameId, data: { answerKey } }

  // rematch
  MANAGER_RESET_GAME:     'manager:resetGame',      // { gameId } — Play Again from the podium
  PLAYER_UPDATE_POINTS:   'player:updatePoints',    // points — server → player, score changed outside a reveal

  // quiz editor (requires manager:auth on the same socket,
  // and a writable QuestionProvider)
  MANAGER_CREATE_QUIZZ:   'manager:createQuizz',    // { quizz }
  MANAGER_UPDATE_QUIZZ:   'manager:updateQuizz',    // { quizzId, quizz }
  MANAGER_DELETE_QUIZZ:   'manager:deleteQuizz',    // { quizzId }
  MANAGER_QUIZZ_SAVED:    'manager:quizzSaved',     // { quizzId } — server → manager, fresh list follows
}
```

**Rules:**
- No socket event name string literal anywhere outside `shared/events.js` (Phase 10 check).
- No game logic in React components: screens dispatch via `GameContext` actions; the context
  emits through `useSocket`; all decisions happen server-side in `GameEngine`.
- Server handler pattern (Phase 6C): validate payload (shared/validation.js) → call
  engine/room-manager method → emit results. Every handler wrapped in try/catch emitting
  `GAME_ERROR_MESSAGE`; the process never crashes on a game error (Phase 9E).

## Other decisions

- **Identity**: `clientId` (uuid, localStorage) in the socket handshake auth, exactly like the
  source — sockets are ephemeral, clientId is stable, enabling reconnect.
- **Rooms**: `RoomManager` (create/join/destroy, invite-code lookup) on top of a `RoomStore`
  interface; default `MemoryRoomStore` (Map). A Redis store can slot in without engine changes (9B).
- **Questions**: `QuestionProvider` interface with `listQuizzes()` + `getQuestions(quizzId)`;
  default `StaticQuestionProvider` reads `server/quizzes/*.json` (same JSON schema as source
  `config/quizz/*.json`). Manager auth password comes from env (`MANAGER_PASSWORD`), replacing
  source's `config/game.json` — documented deviation, config-only, no UX change.
- **Event bus** (9C): `GameEventBus` (EventEmitter) — engine publishes lifecycle events
  (`room:created`, `game:started`, `round:revealed`, …); socket layer and future
  analytics/replay subscribe. Keeps `game/` free of socket imports.
- **Empty-game reaping**: manager-disconnected started games expire after 5 minutes
  (`EMPTY_GAME_TIMEOUT_MS`), sweep every 60 s — same lifecycle as source `Registry`.
- **Question types**: `single` (default), `trueFalse`, `multi`,
  `order` — see `shared/questionTypes.js`. All type logic is server-side in
  `server/src/game/answers.js` (payload validation, correctness, reveal tally);
  order questions are displayed shuffled (`round.displayOrder` maps displayed →
  original). Quiz schema rules live in `shared/quizValidation.js`, enforced by both
  the editor UI and the server before persisting.
- **Quiz editor**: manager UI CRUD over the `QuestionProvider`
  write interface (`isWritable()/saveQuizz()/deleteQuizz()` — implemented by
  `StaticQuestionProvider`, file name = sanitised quiz id). Socket-gated: only
  sockets that passed `manager:auth` can mutate.
- **Manager accounts**:
  `server/src/accounts/` — `AccountStore` (File/Memory), scrypt hashing
  (`passwords.js`, Node crypto, per-account salt, constant-time compare),
  persistent hashed `SessionManager` tokens (rolling TTL via `MANAGER_SESSION_TTL_MS`), and
  `AccountService` holding all rules (first-run setup only while no accounts exist,
  case-insensitive uniqueness, last-account delete protection, change-password).
  Events: `manager:auth {username,password}`, `manager:authStatus {token}` →
  `manager:authState`, `manager:setup`, `manager:logout`, `manager:listAccounts`/
  `manager:addAccount`/`manager:deleteAccount`/`manager:changePassword` →
  `manager:accountsList`, success via `manager:authSuccess {token,username}`.
  Login attempts are throttled per socket (5 failures → 30 s lock).
- **Email verification**: `server/src/email/` — `Mailer`
  abstraction (`SmtpMailer` via nodemailer / `ConsoleMailer` fallback that prints
  links / `CapturingMailer` for tests), delivery selection from `MAIL_PROVIDER`
  (auto|console|smtp), SMTP timeouts/connection diagnostics, normalized send
  results, and verification policy from `EMAIL_VERIFICATION` (auto|on|off) in
  `createMailer.js`. Amazon SES is the recommended hosted SMTP relay; self-hosted
  SMTP relays stay compatible because the app remains provider-agnostic.
  `AccountService` stores only a sha256 hash of each single-use 24 h token; login is blocked for unverified accounts
  (`emailVerified !== false` supports accounts without an explicit flag); first-run setup is
  exempt so mail misconfiguration can never brick the server. Events:
  `manager:verifyEmail {token}` → `manager:emailVerified`,
  `manager:resendVerification {username}` → `manager:verificationSent`
  (silent for unknown/verified accounts, 60 s cooldown). Client route:
  `/manager/verify?token=…`. Flow polish: used tokens are kept (hashed) so a
  re-clicked link answers "already verified" instead of erroring; correct
  credentials on an unverified account yield `manager:authState
  {state:'unverified', username}` (no throttle hit) so the login screen offers a
  one-click resend; `manager:updateEmail {username, email}` corrects a typo'd
  address on unverified accounts and reissues the link; all account mutations
  are serialised through an in-process queue (`AccountService.runExclusive`) so
  concurrent setup/create/delete races cannot lose writes.
- **Tests**: `server/test/*.test.js` (node:test, no extra deps) unit-test the engine,
  answer logic, validation, accounts/sessions, and room manager; `server/test-flow.js`
  smoke-tests the full socket flow including rematch, quiz CRUD, and account
  setup/login/resume.

- **Quiz-creation wizard**:
  `client/src/screens/quizWizard/` — a 4-step flow (Basics → Questions → Timing →
  Review & test) with one question edited at a time, gated inline validation
  (errors appear next to fields only after a step is left or review is reached),
  bulk timing apply, duplicate/short-time warnings, and a review summary with
  jump-to-fix links. Pure draft logic (immutable mutations, normalisation,
  issue/warning/stat collection, localStorage draft autosave) lives in
  `quizDraft.js` — React-free and unit-tested. `shared/quizValidation.js` grew
  `collectQuizzIssues()` (all problems, structured paths) while `validateQuizz`
  keeps the original first-problem API for the server. Save actions are explicit:
  "Save quiz" persists; "Save & host now" chains `manager:quizzSaved → game:create`
  (in-flight flag prevents duplicate submits).
- **Demo run**: `client/src/demo/` — a fully client-side
  rehearsal of the unsaved draft before it is stored. `DemoEngine` is a port of the
  server `GameEngine` FSM reusing the *same* shared logic (`shared/answers.js`,
  `shared/scoring.js`, `shared/timing.js` — moved out of `server/src/game/` for
  this purpose) so pacing, scoring, and reveal payloads match the live game.
  Three bots plus the creator ("You") populate the lobby; `DemoGameProvider`
  shadows `GameContext` and scopes `useSocketEvent` to an in-memory bus
  (`SocketEventSourceContext` in `hooks/useSocket.js`), so the real game screens
  render unchanged and no traffic reaches the server. The overlay banner switches
  between host and player view (host steps run on autopilot while playing,
  "You" auto-answers while hosting), supports restart, and exits back to the
  wizard with the draft intact. Unit-tested via timer scaling
  (`client/test/demoEngine.test.js`, `msPerSecond`).

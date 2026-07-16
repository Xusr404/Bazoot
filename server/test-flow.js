// Phase 6D smoke test: create room → join → start game → answer → score →
// leaderboard → next round → finish. Run with: node server/test-flow.js
// Exits 0 on success, 1 on failure. Uses a fast in-memory quiz (no disk config).

import { AVATARS, isValidAvatar } from '@bazoot/shared/avatars'
import { EVENTS } from '@bazoot/shared/events'
import { STATUS } from '@bazoot/shared/gameStates'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { io as ioClient } from 'socket.io-client'
import { AccountService } from './src/accounts/AccountService.js'
import { MemoryAccountStore } from './src/accounts/AccountStore.js'
import { SessionManager } from './src/accounts/SessionManager.js'
import { CapturingMailer } from './src/email/Mailer.js'
import { createGameServer } from './src/index.js'
import { QuestionProvider } from './src/questions/QuestionProvider.js'
import { StaticQuestionProvider } from './src/questions/StaticQuestionProvider.js'
import { createDatabase } from './src/db/createDatabase.js'

const serverRoot = path.dirname(fileURLToPath(import.meta.url))

const makeAccountService = () =>
  new AccountService({ store: new MemoryAccountStore(), sessions: new SessionManager({ db: createDatabase(':memory:') }) })

const TEST_TIMEOUT_MS = 60_000
const STEP_TIMEOUT_MS = 20_000

const testQuizz = {
  id: 'smoke',
  subject: 'Smoke Test Quizz',
  questions: [
    {
      question: 'Q1: pick answer B',
      answers: ['A', 'B', 'C', 'D'],
      solution: 1,
      cooldown: 1,
      time: 3,
    },
    {
      question: 'Q2: pick answer A',
      answers: ['A', 'B'],
      solution: 0,
      cooldown: 1,
      time: 5,
    },
  ],
}

class TestQuestionProvider extends QuestionProvider {
  async listQuizzes() {
    return [testQuizz]
  }

  async getQuestions(_organizationId, quizzId) {
    return quizzId === testQuizz.id ? testQuizz : undefined
  }
}

const testEnv = {
  port: 0,
  clientUrl: '*',
  maxPlayersPerRoom: 50,
  questionTimeLimit: 20,
  scoreMax: 1000,
  emptyGameTimeoutMs: 60_000,
  uploadsDir: path.join(serverRoot, 'uploads'),
  uploadMaxBytes: 50 * 1024 * 1024,
}

const failures = []
const check = (condition, label) => {
  if (condition) {
    console.log(`  ok: ${label}`)
  } else {
    failures.push(label)
    console.error(`  FAIL: ${label}`)
  }
}

const waitFor = (socket, event, predicate = () => true, label = event) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`Timed out waiting for ${label}`))
    }, STEP_TIMEOUT_MS)

    const handler = (payload) => {
      if (!predicate(payload)) {
        return
      }

      clearTimeout(timer)
      socket.off(event, handler)
      resolve(payload)
    }

    socket.on(event, handler)
  })

const waitForStatus = (socket, statusName) =>
  waitFor(socket, EVENTS.GAME_STATUS, (s) => s.name === statusName, `status ${statusName}`)

const run = async () => {
  const server = await createGameServer({
    env: testEnv,
    questionProvider: new TestQuestionProvider(),
    accountService: makeAccountService(),
  })

  await new Promise((resolve) => server.httpServer.listen(0, resolve))
  const port = server.httpServer.address().port
  const url = `http://localhost:${port}`
  const connect = (clientId) =>
    ioClient(url, { path: '/ws', auth: { clientId }, transports: ['websocket'] })

  const manager = connect('client-manager')
  const player1 = connect('client-p1')
  const player2 = connect('client-p2')
  const sockets = [manager, player1, player2]

  try {
    // ── account setup + auth + create room ─────────────────────────────────
    console.log('Step: account setup + game create')
    const authStatePromise = waitFor(manager, EVENTS.MANAGER_AUTH_STATE)
    manager.emit(EVENTS.MANAGER_AUTH_STATUS, {})
    const authState = await authStatePromise
    check(authState.state === 'setup', 'fresh server requires first-run setup')

    const authSuccessPromise = waitFor(manager, EVENTS.MANAGER_AUTH_SUCCESS)
    const quizzListPromise = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_SETUP, { username: 'admin', password: 'test-pass-123' })
    const [{ token, username }, quizzList] = await Promise.all([
      authSuccessPromise,
      quizzListPromise,
    ])
    check(username === 'admin' && /^[0-9a-f]{64}$/.test(token), 'setup created account + session token')
    check(quizzList.length === 1 && quizzList[0].id === 'smoke', 'quizz list received')

    // wrong credentials rejected, valid token resumes on a different socket
    const otherSocket = connect('client-other-mgr')
    const loginErrorPromise = waitFor(otherSocket, EVENTS.GAME_ERROR_MESSAGE)
    otherSocket.emit(EVENTS.MANAGER_AUTH, { username: 'admin', password: 'wrong-password' })
    const loginError = await loginErrorPromise
    check(loginError === 'Invalid username or password', 'wrong login rejected')

    const resumedPromise = waitFor(otherSocket, EVENTS.MANAGER_AUTH_STATE)
    otherSocket.emit(EVENTS.MANAGER_AUTH_STATUS, { token })
    const resumed = await resumedPromise
    check(
      resumed.state === 'authenticated' && resumed.username === 'admin',
      'session resumes via token',
    )
    otherSocket.disconnect()

    const gameCreatedPromise = waitFor(manager, EVENTS.MANAGER_GAME_CREATED)
    manager.emit(EVENTS.GAME_CREATE, 'smoke')
    const { gameId, inviteCode } = await gameCreatedPromise
    check(typeof gameId === 'string' && gameId.length > 0, 'gameId assigned')
    check(/^\d{6}$/.test(inviteCode), 'invite code is 6 digits')

    // ── players join ────────────────────────────────────────────────────────
    console.log('Step: players join')
    const joinPlayer = async (socket, username, avatar) => {
      const roomJoinedPromise = waitFor(socket, EVENTS.GAME_SUCCESS_ROOM)
      socket.emit(EVENTS.PLAYER_JOIN, inviteCode)
      const joinedGameId = await roomJoinedPromise
      check(joinedGameId === gameId, `${username}: PIN accepted`)

      const newPlayerPromise = waitFor(
        manager,
        EVENTS.MANAGER_NEW_PLAYER,
        (p) => p.username === username,
        `manager sees ${username}`,
      )
      const loginPromise = waitFor(socket, EVENTS.GAME_SUCCESS_JOIN)
      socket.emit(EVENTS.PLAYER_LOGIN, { gameId, data: { username, avatar } })
      await loginPromise
      const newPlayer = await newPlayerPromise
      check(isValidAvatar(newPlayer.avatar), `${username}: new-player payload carries a valid avatar`)

      if (avatar) {
        check(newPlayer.avatar === avatar, `${username}: chosen avatar preserved`)
      }

      check(true, `${username}: joined`)
    }

    await joinPlayer(player1, 'AliceTest', AVATARS[2])
    await joinPlayer(player2, 'BobTest') // no choice → server assigns a default

    // ── emoji reactions (engagement polish) ────────────────────────────────
    const reactionPromise = waitFor(
      manager,
      EVENTS.GAME_REACTION,
      (r) => r.from === 'AliceTest',
      'manager receives a player reaction',
    )
    player1.emit(EVENTS.PLAYER_REACTION, { gameId, emoji: '🔥' })
    const reaction = await reactionPromise
    check(reaction.emoji === '🔥', 'reaction emoji broadcast to the room')

    // invalid PIN is rejected
    const badJoin = connect('client-bad')
    const badMessagePromise = waitFor(badJoin, EVENTS.GAME_ERROR_MESSAGE)
    badJoin.emit(EVENTS.PLAYER_JOIN, '000000')
    const badMessage = await badMessagePromise
    check(badMessage === 'Game not found', 'wrong PIN rejected')
    badJoin.disconnect()

    // ── start game, round 1 ────────────────────────────────────────────────
    console.log('Step: start game (≈6s of countdowns)')
    const startStatusPromise = waitForStatus(player1, STATUS.SHOW_START)
    const preparedStatusPromise = waitForStatus(player1, STATUS.SHOW_PREPARED)
    const questionStatusPromise = waitForStatus(player1, STATUS.SHOW_QUESTION)
    const selectStatusPromise = waitForStatus(player1, STATUS.SELECT_ANSWER)
    manager.emit(EVENTS.MANAGER_START_GAME, { gameId })
    const startStatus = await startStatusPromise
    check(startStatus.data.subject === testQuizz.subject, 'SHOW_START broadcast with subject')

    await preparedStatusPromise
    check(true, 'SHOW_PREPARED reached')

    await questionStatusPromise
    const selectStatus = await selectStatusPromise
    check(selectStatus.data.answers.length === 4, 'SELECT_ANSWER carries 4 answers')
    check(selectStatus.data.totalPlayer === 2, 'totalPlayer = 2')

    // ── answers: p1 correct, p2 wrong ──────────────────────────────────────
    console.log('Step: answers + reveal')
    const p1Wait = waitForStatus(player1, STATUS.WAIT)
    const answeredCountPromise = waitFor(player2, EVENTS.GAME_PLAYER_ANSWER)
    player1.emit(EVENTS.PLAYER_SELECTED_ANSWER, { gameId, data: { answerKey: 1 } })
    await p1Wait
    check(true, 'answering player switched to WAIT')

    const answeredCount = await answeredCountPromise
    check(answeredCount === 1, 'other player notified of 1 answer')

    const p1Result = waitForStatus(player1, STATUS.SHOW_RESULT)
    const p2Result = waitForStatus(player2, STATUS.SHOW_RESULT)
    const managerResponses = waitForStatus(manager, STATUS.SHOW_RESPONSES)
    player2.emit(EVENTS.PLAYER_SELECTED_ANSWER, { gameId, data: { answerKey: 0 } })

    const [r1, r2, responses] = await Promise.all([p1Result, p2Result, managerResponses])
    check(r1.data.correct === true, 'p1 marked correct')
    check(r1.data.points > 0 && r1.data.points <= 1000, `p1 scored time-bonus points (${r1.data.points})`)
    check(r1.data.rank === 1, 'p1 ranked #1')
    check(r2.data.correct === false, 'p2 marked wrong')
    check(r2.data.points === 0, 'p2 scored 0')
    check(r2.data.aheadOfMe === 'AliceTest', 'p2 sees who is ahead')
    check(responses.data.correct === 1, 'manager sees correct index')
    check(responses.data.responses[1] === 1 && responses.data.responses[0] === 1, 'manager sees answer distribution')

    // ── leaderboard → next round ───────────────────────────────────────────
    console.log('Step: leaderboard + round 2')
    const leaderboardPromise = waitForStatus(manager, STATUS.SHOW_LEADERBOARD)
    manager.emit(EVENTS.MANAGER_SHOW_LEADERBOARD, { gameId })
    const leaderboard = await leaderboardPromise
    check(leaderboard.data.leaderboard[0].username === 'AliceTest', 'leaderboard ordered by points')
    check(leaderboard.data.oldLeaderboard.every((p) => p.points === 0), 'old leaderboard kept for count-up')

    const select2Promise = waitForStatus(player1, STATUS.SELECT_ANSWER)
    manager.emit(EVENTS.MANAGER_NEXT_QUESTION, { gameId })
    const select2 = await select2Promise
    check(select2.data.answers.length === 2, 'round 2 carries 2 answers')

    // p2 leaves mid-question: with only p1 still connected, the round must end
    // as soon as p1 answers instead of waiting out the full 5s timer.
    player2.disconnect()
    const r1bPromise = waitForStatus(player1, STATUS.SHOW_RESULT)
    const answeredAt = Date.now()
    player1.emit(EVENTS.PLAYER_SELECTED_ANSWER, { gameId, data: { answerKey: 1 } })
    const r1b = await r1bPromise
    const revealDelay = Date.now() - answeredAt
    check(r1b.data.correct === false, 'round 2: p1 wrong')
    check(revealDelay < 3000, `round ended early after disconnect (${revealDelay}ms < 3000ms)`)

    // ── finish ─────────────────────────────────────────────────────────────
    console.log('Step: finish (podium)')
    const finishedPlayerPromise = waitForStatus(player1, STATUS.FINISHED)
    const finishedManagerPromise = waitForStatus(manager, STATUS.FINISHED)
    manager.emit(EVENTS.MANAGER_SHOW_LEADERBOARD, { gameId })
    const [finishedPlayer, finishedManager] = await Promise.all([
      finishedPlayerPromise,
      finishedManagerPromise,
    ])
    check(finishedPlayer.data.top.length === 2, 'podium broadcast to players')
    check(finishedManager.data.subject === testQuizz.subject, 'podium carries subject')
    check(
      new Set(finishedManager.data.top.map((p) => p.username)).size === 2 &&
        finishedManager.data.top[0].points >= finishedManager.data.top[1].points,
      'podium sorted by points',
    )

    // ── rematch (Play Again) ───────────────────────────────────────────────
    console.log('Step: rematch (Play Again)')
    const roomAgainPromise = waitForStatus(manager, STATUS.SHOW_ROOM)
    const waitAgainPromise = waitForStatus(player1, STATUS.WAIT)
    const pointsResetPromise = waitFor(player1, EVENTS.PLAYER_UPDATE_POINTS)
    const progressResetPromise = waitFor(
      player1,
      EVENTS.GAME_UPDATE_QUESTION,
      (p) => p.current === 1,
      'question progress reset',
    )
    manager.emit(EVENTS.MANAGER_RESET_GAME, { gameId })

    const [roomAgain, , pointsReset, progressReset] = await Promise.all([
      roomAgainPromise,
      waitAgainPromise,
      pointsResetPromise,
      progressResetPromise,
    ])
    check(roomAgain.data.inviteCode === inviteCode, 'rematch keeps the same PIN')
    check(roomAgain.data.players.length === 1, 'disconnected player dropped from rematch lobby')
    check(roomAgain.data.players[0].points === 0, 'lobby player score reset')
    check(pointsReset === 0, 'player notified of points reset')
    check(progressReset.total === 2, 'question progress reset to 1/2')

    const startAgainPromise = waitForStatus(player1, STATUS.SHOW_START)
    manager.emit(EVENTS.MANAGER_START_GAME, { gameId })
    await startAgainPromise
    check(true, 'rematch game starts')

    // ── explicit end game ──────────────────────────────────────────────────
    console.log('Step: manager ends game')
    const managerEndedPromise = waitFor(manager, EVENTS.MANAGER_GAME_ENDED)
    const playerResetPromise = waitFor(player1, EVENTS.GAME_RESET)
    manager.emit(EVENTS.MANAGER_END_GAME, { gameId })
    const [, resetMessage] = await Promise.all([managerEndedPromise, playerResetPromise])
    check(resetMessage === 'Game ended by the manager', 'players are told the manager ended the game')
    check(server.roomManager.getRoom(gameId) === undefined, 'ended game room is destroyed')
  } finally {
    sockets.forEach((s) => s.disconnect())
    await server.close()
  }

  await runQuizzCrud()
  await runVerificationFlow()
}

// ── email verification over sockets (enforced mode, capturing mailer) ────────
const runVerificationFlow = async () => {
  console.log('Step: email verification flow')

  const mailer = new CapturingMailer()
  const accountService = new AccountService({
    store: new MemoryAccountStore(),
    sessions: new SessionManager({ db: createDatabase(':memory:') }),
    mailer,
    requireVerification: true,
    publicUrl: 'http://test.local:5005',
  })
  const server = await createGameServer({
    env: testEnv,
    questionProvider: new TestQuestionProvider(),
    accountService,
  })

  await new Promise((resolve) => server.httpServer.listen(0, resolve))
  const url = `http://localhost:${server.httpServer.address().port}`
  const admin = ioClient(url, { path: '/ws', auth: { clientId: 'verify-admin' }, transports: ['websocket'] })
  const member = ioClient(url, { path: '/ws', auth: { clientId: 'verify-member' }, transports: ['websocket'] })
  const invited = ioClient(url, { path: '/ws', auth: { clientId: 'verify-invited' }, transports: ['websocket'] })

  const tokenFrom = (mail) => mail.text.match(/token=([0-9a-f]{64})/)[1]

  try {
    // bootstrap admin (exempt from verification)
    const adminReady = waitFor(admin, EVENTS.MANAGER_AUTH_SUCCESS)
    admin.emit(EVENTS.MANAGER_SETUP, { username: 'admin', password: 'test-pass-123' })
    await adminReady
    check(mailer.sent.length === 0, 'setup account needs no verification email')

    // admin adds a member → verification email goes out, account is locked
    const listAfterAdd = waitFor(admin, EVENTS.MANAGER_ACCOUNTS_LIST)
    admin.emit(EVENTS.MANAGER_ADD_ACCOUNT, {
      username: 'member',
      password: 'test-pass-123',
      email: 'typo@example.com',
    })
    const accounts = await listAfterAdd
    check(
      accounts.find((a) => a.username === 'member')?.emailVerified === false,
      'new account listed as unverified',
    )
    check(mailer.sent[0]?.to === 'typo@example.com', 'verification email sent')

    // unverified login → dedicated auth state (not a generic error)
    const unverifiedState = waitFor(
      member,
      EVENTS.MANAGER_AUTH_STATE,
      (s) => s.state === 'unverified',
      'unverified auth state',
    )
    member.emit(EVENTS.MANAGER_AUTH, { username: 'member', password: 'test-pass-123' })
    const state = await unverifiedState
    check(state.username === 'member', 'login blocked with unverified state + username')

    // admin corrects the typo'd email → fresh link to the new address
    const sentAgain = waitFor(admin, EVENTS.MANAGER_VERIFICATION_SENT)
    admin.emit(EVENTS.MANAGER_UPDATE_EMAIL, { username: 'member', email: 'real@example.com' })
    await sentAgain
    check(mailer.sent[1]?.to === 'real@example.com', 'corrected email got a fresh link')

    // old link dead, new link verifies
    const oldLinkErrorPromise = waitFor(member, EVENTS.GAME_ERROR_MESSAGE)
    member.emit(EVENTS.MANAGER_VERIFY_EMAIL, { token: tokenFrom(mailer.sent[0]) })
    const oldLinkError = await oldLinkErrorPromise
    check(/invalid or has been replaced/.test(oldLinkError), 'replaced link rejected gracefully')

    const verified = waitFor(member, EVENTS.MANAGER_EMAIL_VERIFIED)
    member.emit(EVENTS.MANAGER_VERIFY_EMAIL, { token: tokenFrom(mailer.sent[1]) })
    const verifyResult = await verified
    check(
      verifyResult.username === 'member' && verifyResult.alreadyVerified === false,
      'new link verifies the account',
    )

    // re-clicking the used link is graceful, login now works
    const reVerified = waitFor(member, EVENTS.MANAGER_EMAIL_VERIFIED)
    member.emit(EVENTS.MANAGER_VERIFY_EMAIL, { token: tokenFrom(mailer.sent[1]) })
    check((await reVerified).alreadyVerified === true, 're-clicked link answers already-verified')

    const loginOk = waitFor(member, EVENTS.MANAGER_AUTH_SUCCESS)
    member.emit(EVENTS.MANAGER_AUTH, { username: 'member', password: 'test-pass-123' })
    const memberSession = await loginOk
    check(
      memberSession.username === 'member' && memberSession.role === 'editor',
      'verified editor account can log in',
    )

    // editors cannot manage accounts, even when calling socket events directly
    const deleteDenied = waitFor(member, EVENTS.GAME_ERROR_MESSAGE)
    member.emit(EVENTS.MANAGER_DELETE_ACCOUNT, { username: 'admin' })
    check(
      (await deleteDenied) === 'Only admins can manage accounts',
      'editor cannot remove accounts',
    )

    const roleDenied = waitFor(member, EVENTS.GAME_ERROR_MESSAGE)
    member.emit(EVENTS.MANAGER_UPDATE_ACCOUNT_ROLE, { username: 'admin', role: 'editor' })
    check(
      (await roleDenied) === 'Only admins can manage accounts',
      'editor cannot change roles',
    )

    const selfRoleDenied = waitFor(admin, EVENTS.GAME_ERROR_MESSAGE)
    admin.emit(EVENTS.MANAGER_UPDATE_ACCOUNT_ROLE, { username: 'admin', role: 'editor' })
    check(
      (await selfRoleDenied) === 'You cannot change your own role',
      'admin cannot change their own role',
    )

    const selfDeleteDenied = waitFor(admin, EVENTS.GAME_ERROR_MESSAGE)
    admin.emit(EVENTS.MANAGER_DELETE_ACCOUNT, { username: 'admin' })
    check(
      (await selfDeleteDenied) === 'You cannot remove your own account',
      'admin cannot remove their own account',
    )

    const promotedList = waitFor(admin, EVENTS.MANAGER_ACCOUNTS_LIST)
    admin.emit(EVENTS.MANAGER_UPDATE_ACCOUNT_ROLE, { username: 'member', role: 'admin' })
    check(
      (await promotedList).find((account) => account.username === 'member')?.role === 'admin',
      'admin can promote an editor',
    )

    // admins can invite a new user; accepting creates a pending account
    const invitationCreated = waitFor(admin, EVENTS.MANAGER_INVITATION_CREATED)
    admin.emit(EVENTS.MANAGER_CREATE_INVITATION, { email: 'invited@example.com', role: 'editor' })
    const invitation = await invitationCreated
    check(invitation.inviteUrl.includes('/manager/invite?token='), 'admin receives invitation link')

    const inviteToken = tokenFrom(mailer.sent.at(-1))
    const invitationDetails = waitFor(invited, EVENTS.MANAGER_INVITATION_DETAILS)
    invited.emit(EVENTS.MANAGER_INSPECT_INVITATION, { token: inviteToken })
    check((await invitationDetails).email === 'invited@example.com', 'invitation link exposes its details')

    const accepted = waitFor(invited, EVENTS.MANAGER_INVITATION_ACCEPTED)
    invited.emit(EVENTS.MANAGER_ACCEPT_INVITATION, {
      token: inviteToken,
      username: 'invited',
      password: 'test-pass-123',
    })
    check((await accepted).state === 'pending', 'new invited account waits for approval')

    const pendingLogin = waitFor(invited, EVENTS.GAME_ERROR_MESSAGE)
    invited.emit(EVENTS.MANAGER_AUTH, { username: 'invited', password: 'test-pass-123' })
    check(/waiting for admin approval/.test(await pendingLogin), 'pending invited account cannot log in')

    const approvedList = waitFor(admin, EVENTS.MANAGER_ACCOUNTS_LIST)
    admin.emit(EVENTS.MANAGER_APPROVE_ACCOUNT, { username: 'invited' })
    check(
      (await approvedList).find((account) => account.username === 'invited')?.approvalPending === false,
      'admin can approve an invited account',
    )

    const invitedLogin = waitFor(invited, EVENTS.MANAGER_AUTH_SUCCESS)
    invited.emit(EVENTS.MANAGER_AUTH, { username: 'invited', password: 'test-pass-123' })
    check((await invitedLogin).role === 'editor', 'approved invited account can log in')
  } finally {
    admin.disconnect()
    member.disconnect()
    invited.disconnect()
    await server.close()
  }
}

// ── quiz editor CRUD against a real on-disk provider ─────────────────────────
const runQuizzCrud = async () => {
  console.log('Step: quiz editor CRUD')

  const tmpDir = await fs.mkdtemp(path.join(serverRoot, '.tmp-quizzes-'))
  const server = await createGameServer({
    env: testEnv,
    questionProvider: new StaticQuestionProvider({ quizzesDir: tmpDir }),
    accountService: makeAccountService(),
  })

  await new Promise((resolve) => server.httpServer.listen(0, resolve))
  const url = `http://localhost:${server.httpServer.address().port}`
  const manager = ioClient(url, { path: '/ws', auth: { clientId: 'crud-mgr' }, transports: ['websocket'] })
  const stranger = ioClient(url, { path: '/ws', auth: { clientId: 'crud-nobody' }, transports: ['websocket'] })

  const validQuizz = {
    subject: 'CRUD Test Quiz',
    questions: [
      { type: 'single', question: 'Q?', answers: ['A', 'B'], solution: 0, cooldown: 3, time: 10 },
      { type: 'order', question: 'Sort!', answers: ['1st', '2nd', '3rd'], cooldown: 3, time: 10 },
    ],
  }

  try {
    // unauthenticated sockets cannot edit
    const deniedPromise = waitFor(stranger, EVENTS.GAME_ERROR_MESSAGE)
    stranger.emit(EVENTS.MANAGER_CREATE_QUIZZ, { quizz: validQuizz })
    const denied = await deniedPromise
    check(denied === 'Not authenticated', 'unauthenticated create rejected')

    const setupPromise = waitFor(manager, EVENTS.MANAGER_AUTH_SUCCESS)
    const emptyListPromise = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_SETUP, { username: 'cruder', password: 'test-pass-123' })
    const setup = await setupPromise
    const originalOrganizationId = setup.organization.id
    const emptyList = await emptyListPromise
    check(emptyList.length === 0, 'fresh quiz dir is empty')

    // Incomplete quizzes are valid drafts, but cannot be hosted until they pass
    // the shared playable-quiz validation.
    const draftSavedPromise = waitFor(manager, EVENTS.MANAGER_QUIZZ_SAVED)
    const draftListPromise = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_CREATE_QUIZZ, {
      quizz: { subject: 'Broken', questions: [{ question: 'Q', answers: ['only'], solution: 0, cooldown: 3, time: 10 }] },
    })
    const [{ quizzId: draftId }, drafts] = await Promise.all([
      draftSavedPromise,
      draftListPromise,
    ])
    check(draftId === 'broken' && drafts.length === 1, 'incomplete quiz saved as a draft')

    const validationErrorPromise = waitFor(manager, EVENTS.MANAGER_ERROR_MESSAGE)
    manager.emit(EVENTS.GAME_CREATE, draftId)
    const validationError = await validationErrorPromise
    check(validationError.includes('2 to 6 answers'), 'incomplete draft cannot start a live game')

    const draftDeletedPromise = waitFor(manager, EVENTS.MANAGER_QUIZZ_SAVED)
    const emptyAfterDraftPromise = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_DELETE_QUIZZ, { quizzId: draftId })
    await draftDeletedPromise
    check((await emptyAfterDraftPromise).length === 0, 'draft cleanup restores an empty library')

    // create
    const savedPromise = waitFor(manager, EVENTS.MANAGER_QUIZZ_SAVED)
    const listAfterCreate = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_CREATE_QUIZZ, { quizz: validQuizz })
    const [{ quizzId }, created] = await Promise.all([savedPromise, listAfterCreate])
    check(quizzId === 'crud-test-quiz', `subject slug becomes the id (${quizzId})`)
    check(created.length === 1 && created[0].subject === 'CRUD Test Quiz', 'created quiz listed')
    check(created[0].questions.length === 2, 'questions persisted to disk')

    // workspaces have independent quiz libraries, including independent ids
    const secondContextPromise = waitFor(manager, EVENTS.MANAGER_ORGANIZATION_CONTEXT)
    const secondEmptyListPromise = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_CREATE_ORGANIZATION, { name: 'Second Workspace' })
    const secondContext = await secondContextPromise
    check((await secondEmptyListPromise).length === 0, 'new workspace starts with an empty quiz library')

    const secondSaved = waitFor(manager, EVENTS.MANAGER_QUIZZ_SAVED)
    const secondList = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_CREATE_QUIZZ, { quizz: validQuizz })
    check((await secondSaved).quizzId === quizzId, 'same quiz id can exist in another workspace')
    await secondList

    const originalListPromise = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_SWITCH_ORGANIZATION, { organizationId: originalOrganizationId })
    const originalList = await originalListPromise
    check(
      originalList.length === 1 && originalList[0].subject === 'CRUD Test Quiz',
      'switching workspace restores its independent quiz library',
    )
    check(secondContext.organization.id !== originalOrganizationId, 'workspace switch has a distinct id')

    // update
    const listAfterUpdate = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_UPDATE_QUIZZ, {
      quizzId,
      quizz: { ...validQuizz, subject: 'CRUD Test Quiz v2' },
    })
    const updated = await listAfterUpdate
    check(updated[0].subject === 'CRUD Test Quiz v2', 'update persisted')

    // delete
    const listAfterDelete = waitFor(manager, EVENTS.MANAGER_QUIZZ_LIST)
    manager.emit(EVENTS.MANAGER_DELETE_QUIZZ, { quizzId })
    const afterDelete = await listAfterDelete
    check(afterDelete.length === 0, 'delete persisted')
  } finally {
    manager.disconnect()
    stranger.disconnect()
    await server.close()
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}

const timeout = setTimeout(() => {
  console.error(`FAIL: test did not finish within ${TEST_TIMEOUT_MS / 1000}s`)
  process.exit(1)
}, TEST_TIMEOUT_MS)

run()
  .then(() => {
    clearTimeout(timeout)

    if (failures.length > 0) {
      console.error(`\n${failures.length} check(s) failed`)
      process.exit(1)
    }

    console.log('\nAll smoke-test checks passed')
    process.exit(0)
  })
  .catch((error) => {
    clearTimeout(timeout)
    console.error(`\nFAIL: ${error.message}`)
    process.exit(1)
  })

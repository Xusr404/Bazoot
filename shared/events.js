// Socket event contract; see docs/architecture.md. Wire names match the source app.
// RULE: no socket event name string literal may appear anywhere else in the codebase.

export const EVENTS = {
  // ── server → client ────────────────────────────────────────────────────────
  /** { name: STATUS, data } — drives which screen every client renders */
  GAME_STATUS: 'game:status',
  /** gameId (string) — PIN accepted, proceed to username */
  GAME_SUCCESS_ROOM: 'game:successRoom',
  /** gameId (string) — joined, navigate to /party/:gameId */
  GAME_SUCCESS_JOIN: 'game:successJoin',
  /** count (number) — players currently in the room */
  GAME_TOTAL_PLAYERS: 'game:totalPlayers',
  /** message (string) — recoverable error, shown as toast */
  GAME_ERROR_MESSAGE: 'game:errorMessage',
  /** (void) — start-countdown phase begins (subject title → ticking square) */
  GAME_START_COOLDOWN: 'game:startCooldown',
  /** secondsRemaining (number) — 1 Hz countdown tick */
  GAME_COOLDOWN: 'game:cooldown',
  /** message (string) — game is gone; client resets and navigates home */
  GAME_RESET: 'game:reset',
  /** { current, total } — question progress chip */
  GAME_UPDATE_QUESTION: 'game:updateQuestion',
  /** answeredCount (number) — someone answered */
  GAME_PLAYER_ANSWER: 'game:playerAnswer',
  /** { gameId, status, player: { username, points }, currentQuestion } */
  PLAYER_SUCCESS_RECONNECT: 'player:successReconnect',
  /** { gameId, status, players, currentQuestion } */
  MANAGER_SUCCESS_RECONNECT: 'manager:successReconnect',
  /** [{ id, subject, questions }] — quizzes available after auth */
  MANAGER_QUIZZ_LIST: 'manager:quizzList',
  /** { gameId, inviteCode } */
  MANAGER_GAME_CREATED: 'manager:gameCreated',
  /** (void) — manager explicitly ended the current game */
  MANAGER_GAME_ENDED: 'manager:gameEnded',
  /** player ({ id, clientId, connected, username, avatar, points }) */
  MANAGER_NEW_PLAYER: 'manager:newPlayer',
  /** playerId (string) — player left before start */
  MANAGER_REMOVE_PLAYER: 'manager:removePlayer',
  /** playerId (string) — kick confirmed */
  MANAGER_PLAYER_KICKED: 'manager:playerKicked',
  /** message (string) — manager-only error, shown as toast */
  MANAGER_ERROR_MESSAGE: 'manager:errorMessage',
  /** points (number) — player's score changed outside a reveal (e.g. rematch reset) */
  PLAYER_UPDATE_POINTS: 'player:updatePoints',
  /** { quizzId } — a quiz create/update/delete succeeded (fresh list follows) */
  MANAGER_QUIZZ_SAVED: 'manager:quizzSaved',
  /** { emoji, from } — a player flung an emoji reaction; shown to the whole room */
  GAME_REACTION: 'game:reaction',

  /** { state: 'setup' | 'login' | 'authenticated', username?, role?, allowRegistration? } — reply to manager:authStatus */
  MANAGER_AUTH_STATE: 'manager:authState',
  /** { token, username, role } — login/setup succeeded; store the token for session resume */
  MANAGER_AUTH_SUCCESS: 'manager:authSuccess',
  /** { organizations, organization, role } — active organization changed or was created */
  MANAGER_ORGANIZATION_CONTEXT: 'manager:organizationContext',
  /** [{ username, email, emailVerified, role, createdAt }] — reply to manager:listAccounts and after mutations */
  MANAGER_ACCOUNTS_LIST: 'manager:accountsList',
  /** [{ email, role, createdAt, expiresAt, existingAccount }] — active invitations */
  MANAGER_INVITATIONS_LIST: 'manager:invitationsList',
  /** { email, role, inviteUrl, existingAccount } — invitation created and emailed */
  MANAGER_INVITATION_CREATED: 'manager:invitationCreated',
  /** { email, role, existingAccount } — public invitation-link details */
  MANAGER_INVITATION_DETAILS: 'manager:invitationDetails',
  /** { state: 'active' | 'pending', username } — invitation accepted */
  MANAGER_INVITATION_ACCEPTED: 'manager:invitationAccepted',
  /** { username } — an email verification token was accepted */
  MANAGER_EMAIL_VERIFIED: 'manager:emailVerified',
  /** (void) — generic acknowledgement for manager:resendVerification */
  MANAGER_VERIFICATION_SENT: 'manager:verificationSent',
  /** (void) — generic acknowledgement for manager:forgotPassword (no probing) */
  MANAGER_PASSWORD_RESET_SENT: 'manager:passwordResetSent',
  /** { username } — a password reset token was accepted and the password changed */
  MANAGER_PASSWORD_RESET_SUCCESS: 'manager:passwordResetSuccess',
  /** { username, email?, emailVerified, createdAt, sessions } — personal account settings */
  MANAGER_ACCOUNT_SETTINGS: 'manager:accountSettings',

  // ── client → server ────────────────────────────────────────────────────────
  /** { username, password } — log in to a manager account */
  MANAGER_AUTH: 'manager:auth',
  /** { token? } — ask whether to show setup, login, or resume the session */
  MANAGER_AUTH_STATUS: 'manager:authStatus',
  /** { username, password, email? } — create the FIRST account (only when none exist) */
  MANAGER_SETUP: 'manager:setup',
  /** { username, password, email } — public self-registration (only when ALLOW_REGISTRATION) */
  MANAGER_REGISTER: 'manager:register',
  /** { identifier } — request a password reset link by username or email (generic reply, no probing) */
  MANAGER_FORGOT_PASSWORD: 'manager:forgotPassword',
  /** { token, newPassword } — complete a password reset from an emailed link */
  MANAGER_RESET_PASSWORD: 'manager:resetPassword',
  /** { token } — confirm an email verification link */
  MANAGER_VERIFY_EMAIL: 'manager:verifyEmail',
  /** { username } — request a fresh verification email (generic reply, no probing) */
  MANAGER_RESEND_VERIFICATION: 'manager:resendVerification',
  /** { username, email } — correct a NOT-yet-verified account email; reissues the link (requires admin) */
  MANAGER_UPDATE_EMAIL: 'manager:updateEmail',
  /** { token } — invalidate the session */
  MANAGER_LOGOUT: 'manager:logout',
  /** (void) — load personal account details and active sessions */
  MANAGER_GET_ACCOUNT_SETTINGS: 'manager:getAccountSettings',
  /** { currentPassword, email } — change own email and send verification */
  MANAGER_CHANGE_OWN_EMAIL: 'manager:changeOwnEmail',
  /** (void) — revoke every session for the authenticated account */
  MANAGER_LOGOUT_ALL: 'manager:logoutAll',
  /** { sessionId } — revoke one other session for the authenticated account */
  MANAGER_REVOKE_SESSION: 'manager:revokeSession',
  /** { currentPassword } — permanently delete the authenticated account */
  MANAGER_DELETE_OWN_ACCOUNT: 'manager:deleteOwnAccount',
  /** { name } — create an organization owned by the authenticated user */
  MANAGER_CREATE_ORGANIZATION: 'manager:createOrganization',
  /** { organizationId } — switch the active manager workspace */
  MANAGER_SWITCH_ORGANIZATION: 'manager:switchOrganization',
  /** { organizationId, name } — rename a workspace (owner only) */
  MANAGER_RENAME_ORGANIZATION: 'manager:renameOrganization',
  /** { organizationId } — leave a workspace */
  MANAGER_LEAVE_ORGANIZATION: 'manager:leaveOrganization',
  /** { organizationId } — delete a workspace and its quizzes (owner only) */
  MANAGER_DELETE_ORGANIZATION: 'manager:deleteOrganization',
  /** (void) — list manager accounts (requires auth) */
  MANAGER_LIST_ACCOUNTS: 'manager:listAccounts',
  /** (void) — list active invitations (requires admin) */
  MANAGER_LIST_INVITATIONS: 'manager:listInvitations',
  /** { email, role } — create and send an invitation (requires admin) */
  MANAGER_CREATE_INVITATION: 'manager:createInvitation',
  /** { email } — cancel a pending invitation (requires admin) */
  MANAGER_CANCEL_INVITATION: 'manager:cancelInvitation',
  /** { token } — inspect a public invitation link */
  MANAGER_INSPECT_INVITATION: 'manager:inspectInvitation',
  /** { token, username?, password? } — accept an invitation */
  MANAGER_ACCEPT_INVITATION: 'manager:acceptInvitation',
  /** { username } — approve an account created from an invitation (requires admin) */
  MANAGER_APPROVE_ACCOUNT: 'manager:approveAccount',
  /** { username, password, email?, role } — add another manager account (requires admin) */
  MANAGER_ADD_ACCOUNT: 'manager:addAccount',
  /** { username, role } — change another manager's role (requires admin) */
  MANAGER_UPDATE_ACCOUNT_ROLE: 'manager:updateAccountRole',
  /** { username } — remove another manager account (requires admin) */
  MANAGER_DELETE_ACCOUNT: 'manager:deleteAccount',
  /** { currentPassword, newPassword } — change own password (requires auth) */
  MANAGER_CHANGE_PASSWORD: 'manager:changePassword',
  /** quizzId (string) — create a game from a quiz */
  GAME_CREATE: 'game:create',
  /** { gameId } */
  MANAGER_RECONNECT: 'manager:reconnect',
  /** { gameId, playerId } */
  MANAGER_KICK_PLAYER: 'manager:kickPlayer',
  /** { gameId } */
  MANAGER_START_GAME: 'manager:startGame',
  /** { gameId } — skip the answer countdown */
  MANAGER_ABORT_QUIZ: 'manager:abortQuiz',
  /** { gameId } */
  MANAGER_NEXT_QUESTION: 'manager:nextQuestion',
  /** { gameId } */
  MANAGER_SHOW_LEADERBOARD: 'manager:showLeaderboard',
  /** { gameId } — rematch from the podium: same room/PIN, scores reset to 0 */
  MANAGER_RESET_GAME: 'manager:resetGame',
  /** { gameId } — explicitly end the room and return everyone home */
  MANAGER_END_GAME: 'manager:endGame',
  /** { quizz } — create a new quiz (requires prior manager:auth on this socket) */
  MANAGER_CREATE_QUIZZ: 'manager:createQuizz',
  /** { quizzId, quizz } — overwrite an existing quiz (requires manager auth) */
  MANAGER_UPDATE_QUIZZ: 'manager:updateQuizz',
  /** { quizzId } — delete a quiz (requires manager auth) */
  MANAGER_DELETE_QUIZZ: 'manager:deleteQuizz',
  /** { quizzId, targetOrganizationId } — copy a quiz to another workspace the user belongs to */
  MANAGER_COPY_QUIZZ: 'manager:copyQuizz',
  /** { quizzId, targetOrganizationId } — move a quiz to another workspace (copy + delete original) */
  MANAGER_MOVE_QUIZZ: 'manager:moveQuizz',

  // ── admin (server → client) ────────────────────────────────────────────────
  /** { totalAccounts, totalWorkspaces, activeRooms, pendingApprovals, pendingInvitations } */
  ADMIN_OVERVIEW: 'admin:overview',
  /** [{ username, email, emailVerified, approvalPending, createdAt, workspaces }] */
  ADMIN_ALL_ACCOUNTS: 'admin:allAccounts',
  /** [{ id, name, createdBy, createdAt, memberCount, quizCount, owners }] */
  ADMIN_ALL_WORKSPACES: 'admin:allWorkspaces',
  /** [{ gameId, inviteCode, quizSubject, playerCount, hostedBy }] */
  ADMIN_ACTIVE_ROOMS: 'admin:activeRooms',
  /** { port, allowRegistration, emailVerification, smtpConfigured, mailProvider, mailConfigured, maxPlayersPerRoom, questionTimeLimit, scoreMax, sessionTtlDays } */
  ADMIN_SERVER_CONFIG: 'admin:serverConfig',

  // ── admin (client → server) ────────────────────────────────────────────────
  ADMIN_GET_OVERVIEW: 'admin:getOverview',
  ADMIN_LIST_ALL_ACCOUNTS: 'admin:listAllAccounts',
  ADMIN_LIST_ALL_WORKSPACES: 'admin:listAllWorkspaces',
  ADMIN_GET_ACTIVE_ROOMS: 'admin:getActiveRooms',
  ADMIN_GET_SERVER_CONFIG: 'admin:getServerConfig',
  /** { allowRegistration?, maxPlayersPerRoom?, questionTimeLimit?, scoreMax? } */
  ADMIN_UPDATE_SERVER_SETTINGS: 'admin:updateServerSettings',

  /** inviteCode (string, 6 digits) */
  PLAYER_JOIN: 'player:join',
  /** { gameId, data: { username, avatar? } } */
  PLAYER_LOGIN: 'player:login',
  /** { gameId } */
  PLAYER_RECONNECT: 'player:reconnect',
  /** { gameId, data: { answerKey } } */
  PLAYER_SELECTED_ANSWER: 'player:selectedAnswer',
  /** { gameId, emoji } — fling an emoji reaction to everyone in the room (rate-limited) */
  PLAYER_REACTION: 'player:reaction',
}

// Input validation shared by client and server. Rules match the source app
// (bazoot packages/common/src/validators/auth.ts).

export const USERNAME_MIN = 4
export const USERNAME_MAX = 20
export const INVITE_CODE_LENGTH = 6

/** @returns {{ ok: true } | { ok: false, message: string }} */
export const validateUsername = (username) => {
  if (typeof username !== 'string' || username.length < USERNAME_MIN) {
    return { ok: false, message: `Username cannot be less than ${USERNAME_MIN} characters` }
  }

  if (username.length > USERNAME_MAX) {
    return { ok: false, message: `Username cannot exceed ${USERNAME_MAX} characters` }
  }

  return { ok: true }
}

/** @returns {{ ok: true } | { ok: false, message: string }} */
export const validateInviteCode = (inviteCode) => {
  if (typeof inviteCode !== 'string' || inviteCode.length !== INVITE_CODE_LENGTH) {
    return { ok: false, message: 'Invalid invite code' }
  }

  return { ok: true }
}

export const MANAGER_USERNAME_MIN = 3
export const MANAGER_USERNAME_MAX = 20
export const MANAGER_PASSWORD_MIN = 8
export const MANAGER_PASSWORD_MAX = 100

/** @returns {{ ok: true } | { ok: false, message: string }} */
export const validateManagerUsername = (username) => {
  if (
    typeof username !== 'string' ||
    username.length < MANAGER_USERNAME_MIN ||
    username.length > MANAGER_USERNAME_MAX
  ) {
    return {
      ok: false,
      message: `Username must be ${MANAGER_USERNAME_MIN}–${MANAGER_USERNAME_MAX} characters`,
    }
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    return { ok: false, message: 'Username may only contain letters, numbers, - and _' }
  }

  return { ok: true }
}

/** @returns {{ ok: true } | { ok: false, message: string }} */
export const validateEmail = (email) => {
  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return { ok: false, message: 'Please enter a valid email address' }
  }

  return { ok: true }
}

/** @returns {{ ok: true } | { ok: false, message: string }} */
export const validateManagerPassword = (password) => {
  if (
    typeof password !== 'string' ||
    password.length < MANAGER_PASSWORD_MIN ||
    password.length > MANAGER_PASSWORD_MAX
  ) {
    return {
      ok: false,
      message: `Password must be at least ${MANAGER_PASSWORD_MIN} characters`,
    }
  }

  return { ok: true }
}

import { INVITE_CODE_LENGTH } from '@bazoot/shared/validation'

/** 6-digit numeric room code, identical format to the source app. */
export const createInviteCode = (length = INVITE_CODE_LENGTH) => {
  let result = ''

  for (let i = 0; i < length; i += 1) {
    result += Math.floor(Math.random() * 10).toString()
  }

  return result
}

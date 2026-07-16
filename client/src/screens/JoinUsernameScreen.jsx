import { AVATARS, defaultAvatarFor } from '@bazoot/shared/avatars'
import { randomNickname } from '@bazoot/shared/nicknames'
import clsx from 'clsx'
import { useState } from 'react'
import { Button } from '../components/ui/Button.jsx'
import { FormCard } from '../components/ui/FormCard.jsx'
import { Input } from '../components/ui/Input.jsx'
import { useGame } from '../context/GameContext.jsx'
import { useTranslation } from '../i18n/index.js'
import { getClientId } from '../utils/clientId.js'
import { hasFieldError } from '../utils/formErrors.js'

// Username form after the PIN was accepted (source join/Username), now with an
// emoji avatar picker and a one-tap random nickname — the join step is the first
// thing every player sees, so a little personality here sets the tone.
// Navigation to /party/:gameId happens at page level on GAME_SUCCESS_JOIN.
export const JoinUsernameScreen = ({ errorMessage, onChange, onSubmit }) => {
  const { gameId, login } = useGame()
  const { t } = useTranslation()
  // Seed the field so it's never empty (lowers join friction) but stays editable.
  const [username, setUsername] = useState(randomNickname)
  const [avatar, setAvatar] = useState(() => defaultAvatarFor(getClientId()))

  const handleLogin = () => {
    if (!gameId) {
      return
    }

    login(gameId, username, avatar)
    onSubmit?.(username, avatar)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      handleLogin()
    }
  }

  return (
    <FormCard>
      <div className="flex flex-col items-center gap-1">
        <div
          className="shadow-inset flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 text-5xl"
          aria-hidden="true"
        >
          {avatar}
        </div>
        <p className="text-sm font-semibold text-gray-500">{t('Pick your avatar')}</p>
      </div>

      <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label={t('Choose an avatar')}>
        {AVATARS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="radio"
            aria-checked={emoji === avatar}
            aria-label={t('Avatar {emoji}', { emoji })}
            onClick={() => setAvatar(emoji)}
            className={clsx(
              'flex aspect-square items-center justify-center rounded-md text-2xl transition-colors',
              emoji === avatar ? 'bg-primary shadow-inset' : 'bg-gray-100 hover:bg-gray-200',
            )}
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Input
          className="min-w-0 flex-1"
          value={username}
          invalid={hasFieldError(errorMessage, 'username')}
          onChange={(e) => {
            setUsername(e.target.value)
            onChange?.()
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('Username here')}
        />
        <button
          type="button"
          onClick={() => setUsername(randomNickname())}
          aria-label={t('Shuffle nickname')}
          title={t('Shuffle nickname')}
          className="shadow-inset flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-2xl transition-colors hover:bg-gray-200"
        >
          🎲
        </button>
      </div>

      <Button onClick={handleLogin}>{t('Submit')}</Button>
    </FormCard>
  )
}

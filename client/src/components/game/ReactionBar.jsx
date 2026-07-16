import { REACTIONS } from '@bazoot/shared/reactions'
import { useGame } from '../../context/GameContext.jsx'
import { useTranslation } from '../../i18n/index.js'

// Player-only emoji reaction bar (engagement polish). Floats above the bottom
// score bar; each tap flings an emoji to the whole room (server rate-limited).
export const ReactionBar = () => {
  const { sendReaction } = useGame()
  const { t } = useTranslation()

  if (!sendReaction) {
    return null
  }

  return (
    <div className="fixed right-2 bottom-16 z-50 flex max-w-[92vw] flex-wrap justify-end gap-1 rounded-full bg-black/40 p-1 backdrop-blur-sm">
      {REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={t('Send {emoji} reaction', { emoji })}
          onClick={() => sendReaction(emoji)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125 active:scale-90"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

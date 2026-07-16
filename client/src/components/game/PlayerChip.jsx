import { resolveAvatar } from '@bazoot/shared/avatars'

// Lobby player chip (avatar + name); clicking kicks the player (hover shows
// line-through). Avatar falls back to a stable default for older clients.
export const PlayerChip = ({ username, avatar, clientId, onKick }) => (
  <div
    className="shadow-inset bg-primary flex items-center gap-2 rounded-md px-4 py-3 font-bold text-white"
    onClick={onKick}
  >
    <span className="text-3xl leading-none" aria-hidden="true">
      {resolveAvatar({ avatar, clientId, username })}
    </span>
    <span className="cursor-pointer text-3xl drop-shadow-md hover:line-through">{username}</span>
  </div>
)

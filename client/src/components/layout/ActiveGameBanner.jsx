import { useTranslation } from '../../i18n/index.js'
import { PlayIcon, UsersIcon } from '../icons/ui.jsx'
import { Button } from '../ui/Button.jsx'

export const ActiveGameBanner = ({ statusName, playerCount, onReturn }) => {
  const { t } = useTranslation()

  return (
    <aside className="z-10 mb-4 w-full max-w-[78rem] px-3 sm:px-6" aria-label={t('Active game')}>
      <div className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
            <PlayIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-extrabold text-gray-950">{t('Live game in progress')}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs font-semibold text-gray-600">
              <span>{statusName === 'SHOW_ROOM' ? t('Lobby open') : t('Host session active')}</span>
              <span className="inline-flex items-center gap-1">
                <UsersIcon className="h-3.5 w-3.5" />
                {t('{count} {label}', {
                  count: playerCount,
                  label: playerCount === 1 ? t('player') : t('players'),
                })}
              </span>
            </p>
          </div>
        </div>
        <Button className="flex shrink-0 items-center justify-center gap-2 px-4 text-sm" onClick={onReturn}>
          <PlayIcon className="h-3.5 w-3.5" />
          {t('Return to game')}
        </Button>
      </div>
    </aside>
  )
}

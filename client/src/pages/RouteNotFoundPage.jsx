import { useNavigate } from 'react-router'
import { AuthShell } from '../components/layout/AuthShell.jsx'
import {
  ManagerAuthBody,
  ManagerAuthCard,
  ManagerAuthHeader,
} from '../components/manager/ManagerPage.jsx'
import { Button } from '../components/ui/Button.jsx'
import { useTranslation } from '../i18n/index.js'

export const RouteNotFoundPage = ({
  scope = 'public',
  backTo = '/',
  backLabel,
  title,
  description,
}) => {
  const navigate = useNavigate()
  const { t } = useTranslation()

  const eyebrow =
    scope === 'manager' ? t('Manager area') : scope === 'party' ? t('Shared game') : t('404')

  const resolvedTitle =
    title ??
    (scope === 'manager'
      ? t('Manager page not found')
      : scope === 'party'
        ? t('Game not found')
        : t('Page not found'))

  const resolvedDescription =
    description ??
    (scope === 'manager'
      ? t('That manager route does not exist. Check the address or return to the dashboard.')
      : scope === 'party'
        ? t('That shared game link does not exist or is no longer available.')
        : t('The page you are looking for could not be found.'))

  const resolvedBackLabel = backLabel ?? t(scope === 'manager' ? 'Back to manager home' : 'Back home')

  return (
    <AuthShell isConnected={true}>
      <ManagerAuthCard className="border-gray-200/90 shadow-xl">
        <ManagerAuthHeader eyebrow={eyebrow} title={resolvedTitle} description={resolvedDescription} />
        <ManagerAuthBody>
          <div className="rounded-lg border border-dashed border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-gray-700">
            <span className="text-5xl leading-none text-primary">404</span>
          </div>
          <Button onClick={() => navigate(backTo)}>{resolvedBackLabel}</Button>
        </ManagerAuthBody>
      </ManagerAuthCard>
    </AuthShell>
  )
}

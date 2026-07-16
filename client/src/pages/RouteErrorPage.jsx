import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router'
import { AuthShell } from '../components/layout/AuthShell.jsx'
import {
  ManagerAuthBody,
  ManagerAuthCard,
  ManagerAuthHeader,
} from '../components/manager/ManagerPage.jsx'
import { Button } from '../components/ui/Button.jsx'
import { useTranslation } from '../i18n/index.js'

export const RouteErrorPage = () => {
  const error = useRouteError()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText || t('Route error')}`
    : error instanceof Error
      ? error.message
      : t('Something went wrong while loading this page.')

  return (
    <AuthShell isConnected={true}>
      <ManagerAuthCard className="border-gray-200/90 shadow-xl">
        <ManagerAuthHeader
          eyebrow={t('Application error')}
          title={t('Could not load this page')}
          description={t('The router hit an error before the screen could render.')}
        />
        <ManagerAuthBody>
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {message}
          </div>
          <Button onClick={() => navigate('/')}>{t('Back home')}</Button>
        </ManagerAuthBody>
      </ManagerAuthCard>
    </AuthShell>
  )
}

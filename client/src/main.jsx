import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppToaster } from './components/ui/AppToaster.jsx'
import { I18nProvider } from './i18n/index.js'
import { SoundProvider } from './context/SoundContext.jsx'
import { Router } from './router.jsx'
import './styles/app.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <SoundProvider>
        <Router />
        <AppToaster />
      </SoundProvider>
    </I18nProvider>
  </StrictMode>,
)

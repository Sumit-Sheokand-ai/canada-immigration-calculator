import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion } from 'framer-motion'
import './index.css'
import App from './App.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import AppErrorBoundary from './components/AppErrorBoundary.jsx'
import { trackError, trackEvent } from './utils/analytics'
import { readRuntimeFlags } from './utils/runtimeFlags'
import { defineCustomElements } from 'ionicons/loader'
const loadMotionFeatures = () => import('./utils/motionFeatures.js').then((mod) => mod.default)

if (typeof window !== 'undefined') {
  defineCustomElements(window)
}

// Register service worker for security headers
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('[SW] Service Worker registered:', registration);
        if (readRuntimeFlags().enablePerfTelemetry) {
          trackEvent('service_worker_registered', {
            scope: registration?.scope || '/',
          });
        }
      })
      .catch((error) => {
        console.error('[SW] Service Worker registration failed:', error);
        if (readRuntimeFlags().enablePerfTelemetry) {
          trackError('service_worker_registration_failed', error, {
            source: 'main_bootstrap',
          });
        }
      });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <LazyMotion features={loadMotionFeatures}>
              <App />
            </LazyMotion>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
)

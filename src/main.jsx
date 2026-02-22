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
import { addIcons } from 'ionicons'
import {
  arrowForwardSharp,
  barChartSharp,
  calendarSharp,
  checkmarkDoneCircleSharp,
  diamondSharp,
  downloadSharp,
  flashSharp,
  gitCompareSharp,
  gridSharp,
  layersSharp,
  notificationsOffSharp,
  notificationsSharp,
  optionsSharp,
  peopleSharp,
  personCircleSharp,
  pieChartSharp,
  radioSharp,
  saveSharp,
  shareSocialSharp,
  shieldCheckmarkSharp,
  sparklesSharp,
  statsChartSharp,
  timeSharp,
  trendingUpSharp,
} from 'ionicons/icons'
const loadMotionFeatures = () => import('./utils/motionFeatures.js').then((mod) => mod.default)
const ION_ICON_REGISTRY = {
  'arrow-forward-sharp': arrowForwardSharp,
  'bar-chart-sharp': barChartSharp,
  'calendar-sharp': calendarSharp,
  'checkmark-done-circle-sharp': checkmarkDoneCircleSharp,
  'diamond-sharp': diamondSharp,
  'download-sharp': downloadSharp,
  'flash-sharp': flashSharp,
  'git-compare-sharp': gitCompareSharp,
  'grid-sharp': gridSharp,
  'layers-sharp': layersSharp,
  'notifications-off-sharp': notificationsOffSharp,
  'notifications-sharp': notificationsSharp,
  'options-sharp': optionsSharp,
  'people-sharp': peopleSharp,
  'person-circle-sharp': personCircleSharp,
  'pie-chart-sharp': pieChartSharp,
  'radar-sharp': radioSharp,
  'save-sharp': saveSharp,
  'share-social-sharp': shareSocialSharp,
  'shield-checkmark-sharp': shieldCheckmarkSharp,
  'sparkles-sharp': sparklesSharp,
  'stats-chart-sharp': statsChartSharp,
  'time-sharp': timeSharp,
  'trending-up-sharp': trendingUpSharp,
}

if (typeof window !== 'undefined') {
  defineCustomElements(window)
  addIcons(ION_ICON_REGISTRY)
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

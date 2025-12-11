import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'

// Register Service Worker
// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Use relative path for GitHub Pages compatibility
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(registration => {
      console.log('SW registered with scope: ', registration.scope)
    }).catch(registrationError => {
      console.error('SW registration failed: ', registrationError)
    })
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

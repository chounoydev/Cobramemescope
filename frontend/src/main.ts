import './assets/main.css'
import './assets/scanner.css'
import './assets/dark-mode.css'

import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js').catch((error: unknown) => {
      console.error('Cobra MemeScope service worker registration failed:', error)
    })
  })
}

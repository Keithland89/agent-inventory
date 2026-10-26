import { tapBridge } from './ask/cowork'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DataProvider } from './data/DataProvider.tsx'

// Before the SDK opens its channel, so the Ask panel can reuse it for Cowork.
tapBridge()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <App />
    </DataProvider>
  </StrictMode>,
)
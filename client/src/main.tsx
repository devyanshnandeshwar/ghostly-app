import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SessionProvider } from './context/SessionContext'
import { SocketProvider } from './context/SocketContext'
import { MatchProvider } from './context/MatchContext'
import { ThemeProvider } from './components/theme-provider'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <SocketProvider>
        <MatchProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <App />
          </ThemeProvider>
        </MatchProvider>
      </SocketProvider>
    </SessionProvider>
  </StrictMode>,
)

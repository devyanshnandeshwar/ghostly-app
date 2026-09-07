import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SessionProvider } from './context/SessionContext'
import { SocketProvider } from './context/SocketContext'
import { MatchProvider } from './context/MatchContext'
import { ThemeProvider } from './components/theme-provider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toaster'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Outermost, so a failure in any provider below still renders something. */}
    <ErrorBoundary>
    <ToastProvider>
    <SessionProvider>
      <SocketProvider>
        <MatchProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <App />
          </ThemeProvider>
        </MatchProvider>
      </SocketProvider>
    </SessionProvider>
    </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
)

import { useState, useEffect } from 'react'
import { ChatInterface } from './components/chat/ChatInterface'
import { StockDashboard } from './components/inventory/StockDashboard'
import { BackofficeLayout } from './components/backoffice/BackofficeLayout'
import { NetworkDashboard } from './components/network/NetworkDashboard'
import { TestDriveBooking } from './components/testdrive/TestDriveBooking'

function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  if (path === '/inventory') {
    return <StockDashboard />
  }

  if (path === '/backoffice') {
    return <BackofficeLayout />
  }

  if (path === '/network') {
    return <NetworkDashboard />
  }

  if (path === '/testdrive') {
    return <TestDriveBooking />
  }

  return <ChatInterface />
}

export default App

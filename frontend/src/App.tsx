import { useState, useEffect } from 'react'
import { Landing } from './components/Landing'
import { ChatInterface } from './components/chat/ChatInterface'
import { StockDashboard } from './components/inventory/StockDashboard'
import { BackofficeLayout } from './components/backoffice/BackofficeLayout'
import { NetworkDashboard } from './components/network/NetworkDashboard'
import { TestDriveBooking } from './components/testdrive/TestDriveBooking'
import { TestDriveInventory } from './components/testdrive/TestDriveInventory'
import { DealerProduct } from './components/dealer/DealerProduct'

function App() {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  if (path === '/dealer') {
    return <DealerProduct />
  }

  if (path === '/chat') {
    return <ChatInterface />
  }

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

  if (path === '/testdrive/inventory') {
    return <TestDriveInventory />
  }

  return <Landing />
}

export default App

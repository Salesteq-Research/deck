import { useState, useEffect } from 'react'
import { ChatInterface } from './components/chat/ChatInterface'
import { StockDashboard } from './components/inventory/StockDashboard'

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

  return <ChatInterface />
}

export default App

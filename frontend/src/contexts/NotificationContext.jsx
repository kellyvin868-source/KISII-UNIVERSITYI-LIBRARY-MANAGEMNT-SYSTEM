import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { toast } from 'sonner'

const NotificationContext = createContext(null)

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const notify = useCallback((message, type = 'success') => {
    const id = crypto.randomUUID()
    setNotifications((current) => [{ id, message, type, createdAt: new Date() }, ...current].slice(0, 20))
    toast[type === 'error' ? 'error' : 'success'](message)
  }, [])
  const value = useMemo(() => ({ notifications, notify }), [notifications, notify])
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}

// Context hooks intentionally share this module with their provider.
// eslint-disable-next-line react-refresh/only-export-components
export const useNotifications = () => {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications must be used within NotificationProvider')
  return context
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiErrorMessage } from '../api/client'
import { getCurrentMember, login as loginRequest, logout as logoutRequest, register as registerRequest } from '../services/authService'
import { useNotifications } from './NotificationContext'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [member, setMember] = useState(null)
  const [loading, setLoading] = useState(true)
  const { notify } = useNotifications()

  const refreshMember = useCallback(async () => {
    try {
      const current = await getCurrentMember()
      setMember(current)
      return current
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshMember().catch((error) => {
      if (error.response?.status !== 401) notify(apiErrorMessage(error), 'error')
    })
  }, [notify, refreshMember])

  useEffect(() => {
    const clearSession = () => setMember(null)
    window.addEventListener('kulms:unauthorized', clearSession)
    return () => window.removeEventListener('kulms:unauthorized', clearSession)
  }, [])

  const signIn = useCallback(async (credentials) => {
    await loginRequest(credentials)
    const current = await getCurrentMember()
    setMember(current)
    return current
  }, [])
  const signUp = useCallback(async (details) => {
    await registerRequest(details)
    const current = await getCurrentMember()
    setMember(current)
    return current
  }, [])
  const signOut = useCallback(async () => {
    await logoutRequest()
    setMember(null)
  }, [])

  const value = useMemo(() => ({
    member, loading, refreshMember, signIn, signUp, signOut, setMember
  }), [member, loading, refreshMember, signIn, signUp, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Context hooks intentionally share this module with their provider.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}

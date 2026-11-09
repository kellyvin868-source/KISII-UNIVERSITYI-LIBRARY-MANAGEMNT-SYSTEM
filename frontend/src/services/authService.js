import { apiClient } from '../api/client'

export const getCurrentMember = async () => (await apiClient.get('/auth/me')).data.data
export const login = async (credentials) => apiClient.post('/auth/login', credentials)
export const register = async (details) => apiClient.post('/auth/register', details)
export const logout = async () => apiClient.post('/auth/logout')

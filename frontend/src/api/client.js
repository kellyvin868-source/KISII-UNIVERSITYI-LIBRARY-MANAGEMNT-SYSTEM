import axios from 'axios'

export const apiClient = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/v1').replace(/\/$/, ''),
  withCredentials: true,
  timeout: 15000,
  headers: { Accept: 'application/json' }
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || ''
    if (error.response?.status === 401 && !/\/auth\/(login|register)$/.test(requestUrl)) {
      window.dispatchEvent(new CustomEvent('kulms:unauthorized'))
    }
    return Promise.reject(error)
  }
)

export function apiErrorMessage(error) {
  return error.response?.data?.message || error.message || 'The request could not be completed.'
}

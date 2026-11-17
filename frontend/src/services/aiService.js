import { apiClient } from '../api/client'

const AI_REQUEST_TIMEOUT_MS = 35_000

export const askAssistant = async (message) => (
  await apiClient.post('/ai/chat', { message }, { timeout: AI_REQUEST_TIMEOUT_MS })
).data.data
export const getRecommendations = async (memberId) => (
  await apiClient.get(`/ai/recommendations/${memberId}`)
).data.data
export const getDemandForecast = async () => (await apiClient.get('/ai/forecast/demand')).data.data
export const suggestBookCategories = async (details) => (
  await apiClient.post('/ai/categorize', details)
).data.data

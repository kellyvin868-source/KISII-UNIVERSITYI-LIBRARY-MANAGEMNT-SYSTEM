import { apiClient } from '../api/client'

export const askAssistant = async (message) => (await apiClient.post('/ai/chat', { message })).data.data
export const getRecommendations = async (memberId) => (
  await apiClient.get(`/ai/recommendations/${memberId}`)
).data.data
export const getDemandForecast = async () => (await apiClient.get('/ai/forecast/demand')).data.data
export const suggestBookCategories = async (details) => (
  await apiClient.post('/ai/categorize', details)
).data.data

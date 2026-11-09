import { apiClient } from '../api/client'

export const listReservations = async (params) => (await apiClient.get('/reservations', { params })).data.data
export const reserveBook = async (memberId, bookId) => (
  await apiClient.post('/reservations', { memberId, bookId })
).data.data
export const cancelReservation = async (id) => (
  await apiClient.post(`/reservations/${id}/cancel`)
).data.data

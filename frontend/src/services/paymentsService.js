import { apiClient } from '../api/client'

export const listPayments = async () => (await apiClient.get('/payments')).data.data
export const initiateMpesaPayment = async (request) => (
  await apiClient.post('/payments/mpesa/initiate', request, {
    headers: { 'Idempotency-Key': crypto.randomUUID() }
  })
).data

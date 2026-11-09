import { apiClient } from '../api/client'

export const listLoans = async (params) => (await apiClient.get('/loans', { params })).data.data
export const borrowBook = async (memberId, bookId) => (
  await apiClient.post('/loans', { memberId, bookId })
).data.data
export const returnLoan = async (id) => (await apiClient.post(`/loans/${id}/return`)).data.data
export const renewLoan = async (id) => (await apiClient.post(`/loans/${id}/renew`)).data.data

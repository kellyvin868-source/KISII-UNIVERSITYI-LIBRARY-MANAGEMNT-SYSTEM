import { apiClient } from '../api/client'

export const listFines = async (params) => (await apiClient.get('/fines', { params })).data.data
export const calculateFine = async (loanId) => (await apiClient.post('/fines', { loanId })).data.data

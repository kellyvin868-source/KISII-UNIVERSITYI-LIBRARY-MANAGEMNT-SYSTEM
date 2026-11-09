import { apiClient } from '../api/client'

export const getMember = async (id) => (await apiClient.get(`/members/${id}`)).data.data
export const updateMember = async (id, updates) => (await apiClient.put(`/members/${id}`, updates)).data.data
export const listMembers = async (params) => (await apiClient.get('/members', { params })).data
export const registerMember = async (details) => (await apiClient.post('/members', details)).data.data
export const verifyStudent = async (regNo) => (
  await apiClient.get(`/external/students/${encodeURIComponent(regNo)}/verify`)
).data.data
export const getBorrowingHistory = async (id) => (await apiClient.get(`/members/${id}/loans`)).data.data

import { apiClient } from '../api/client'

export const listNotifications = async () => (await apiClient.get('/notifications')).data.data
export const sendEmailNotification = async (request) => (await apiClient.post('/notifications/email', request)).data
export const sendSmsNotification = async (request) => (await apiClient.post('/notifications/sms', request)).data

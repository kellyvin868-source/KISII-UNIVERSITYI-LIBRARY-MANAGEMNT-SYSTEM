import { apiClient } from '../api/client'

export const listBooks = async (params) => (await apiClient.get('/books', { params })).data
export const smartSearch = async (q) => (await apiClient.get('/ai/search', { params: { q } })).data.data
export const getBook = async (id) => (await apiClient.get(`/books/${id}`)).data
export const listBookCopies = async (id) => (await apiClient.get(`/books/${id}/copies`)).data.data
export const listAuthors = async () => {
  const { data } = await apiClient.get('/authors')
  return data.data || data
}
export const listCategories = async () => {
  const { data } = await apiClient.get('/categories')
  return data.data || data
}
export const createBook = async (book) => (await apiClient.post('/books', book)).data
export const createAuthor = async (name) => (await apiClient.post('/authors', { name })).data
export const createCategory = async (name) => (await apiClient.post('/categories', { name })).data
export const createBookCopy = async (id, barcode) => (await apiClient.post(`/books/${id}/copies`, barcode?.trim() ? { barcode: barcode.trim() } : {})).data
export const updateBookCopy = async (copyId, updates) => (await apiClient.patch(`/books/copies/${copyId}`, updates)).data

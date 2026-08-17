import axios from 'axios'
import type { HealthResponse } from './types'

const baseURL = import.meta.env.VITE_INGESTION_API_BASE_URL || 'http://localhost:8001'

const client = axios.create({
  baseURL,
})

const extractError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || 'Request failed'
  }
  return error instanceof Error ? error.message : 'Unexpected error'
}

export async function getHealth(): Promise<HealthResponse> {
  try {
    const { data } = await client.get<HealthResponse>('/health')
    return data
  } catch (error) {
    throw new Error(extractError(error))
  }
}

import axios from 'axios'
import type {
  IngestionResponse,
  Part1IngestRequest,
  Part2IngestRequest,
  PollResponse,
  HealthResponse,
} from './types'

const baseURL = import.meta.env.VITE_INGESTION_API_BASE_URL || 'http://localhost:8001'

const client = axios.create({
  baseURL,
})

const toFormData = (payload: Record<string, unknown>) => {
  const formData = new FormData()
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) {
      value.forEach((file) => formData.append(key, file as Blob))
    } else {
      formData.append(key, value as Blob | string)
    }
  })
  return formData
}

const extractError = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || error.message || 'Request failed'
  }
  return error instanceof Error ? error.message : 'Unexpected error'
}

export async function postPart1Ingestion(payload: Part1IngestRequest): Promise<IngestionResponse> {
  try {
    const formData = toFormData(payload)
    const { data } = await client.post<IngestionResponse>('/ingest/part1', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  } catch (error) {
    throw new Error(extractError(error))
  }
}

export async function postPart2Ingestion(payload: Part2IngestRequest): Promise<IngestionResponse> {
  try {
    const formData = toFormData(payload)
    const { data } = await client.post<IngestionResponse>('/ingest/part2', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  } catch (error) {
    throw new Error(extractError(error))
  }
}

export async function getRunStatus(dagRunId: string, dag: 'part1' | 'part2'): Promise<PollResponse> {
  try {
    const { data } = await client.get<PollResponse>(`/poll/${dagRunId}`, { params: { dag } })
    return data
  } catch (error) {
    throw new Error(extractError(error))
  }
}

export async function getHealth(): Promise<HealthResponse> {
  try {
    const { data } = await client.get<HealthResponse>('/health')
    return data
  } catch (error) {
    throw new Error(extractError(error))
  }
}

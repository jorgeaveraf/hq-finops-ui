export type RunState = 'queued' | 'running' | 'success' | 'failed' | 'idle' | string

export type IngestionResponse = {
  dag: 'part1_ingestion' | 'part2_qbo_export' | string
  dag_run_id: string
  status: string
}

export type PollResponse = {
  dag: 'part1' | 'part2' | string
  run_id: string
  state: RunState
  outputs?: Record<string, string> | string[]
  error?: string
}

export type Part1IngestRequest = {
  week_year: number | string
  week_num: number | string
  notify_email: string
  files: File[]
}

export type Part2IngestRequest = {
  week_year: number | string
  week_num: number | string
  notify_email: string
  source?: 'warehouse' | 'samples'
  files?: File[]
  [key: string]: unknown
}

export type HealthResponse = {
  status: string
  message?: string
}

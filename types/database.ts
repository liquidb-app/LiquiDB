export interface IDatabase {
  id: string
  name: string
  type: 'postgresql' | 'mysql' | 'redis' | 'mongodb'
  version: string
  port: number
  status: 'running' | 'stopped' | 'error' | 'starting'
  pid: number | null
  containerId?: string
  autoStart?: boolean
  isNew?: boolean
  [key: string]: unknown
}

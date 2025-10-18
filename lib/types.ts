export type DatabaseType = "postgresql" | "mysql" | "mongodb" | "redis"

export type DatabaseStatus = "running" | "stopped" | "starting" | "stopping" | "installing"

export interface DatabaseContainer {
  id: string
  name: string
  type: DatabaseType
  version: string
  port: number
  status: DatabaseStatus
  containerId: string
  username: string
  password: string
  createdAt: string
  icon?: string
  autoStart?: boolean
  lastStarted?: number
}

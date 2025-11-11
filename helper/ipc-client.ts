#!/usr/bin/env node

/**
 * LiquiDB Helper IPC Client
 * 
 * Simplified client for communicating with the helper service
 */

import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import platformImpl from './platform'

// Configuration - platform-specific IPC path
const SOCKET_PATH = platformImpl.getSocketPath()
const IS_WINDOWS = process.platform === 'win32'

interface HelperMessage {
  type: string
  data?: Record<string, unknown>
}

interface HelperResponse {
  success: boolean
  data?: unknown
  error?: string
}

interface StatusResponse extends HelperResponse {
  data?: {
    running: boolean
    pid?: number
    uptime?: number
  }
}

interface CleanupResponse extends HelperResponse {
  data?: {
    cleaned: number
  }
}

interface PortCheckResponse extends HelperResponse {
  data?: {
    available: boolean
    port: number
  }
}

interface FindPortResponse extends HelperResponse {
  data?: {
    port: number
    available: boolean
  }
}

class HelperClient {
  private socket: net.Socket | null = null
  private connected: boolean = false
  
  // Connect to helper (platform-specific)
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (IS_WINDOWS) {
        // Windows: Use named pipe (no file existence check needed)
        this.socket = net.createConnection(SOCKET_PATH)
      } else {
        // macOS/Linux: Use Unix domain socket
        if (!fs.existsSync(SOCKET_PATH)) {
          reject(new Error('Helper IPC socket not found'))
          return
        }
        
        this.socket = net.createConnection(SOCKET_PATH)
      }
      
      this.socket.on('connect', () => {
        this.connected = true
        console.log('Connected to LiquiDB Helper')
        resolve()
      })
      
      this.socket.on('error', (error: Error) => {
        this.connected = false
        reject(error)
      })
      
      this.socket.on('close', () => {
        this.connected = false
        console.log('Disconnected from LiquiDB Helper')
      })
    })
  }
  
  // Send message and wait for response
  private async sendMessage(type: string, data: Record<string, unknown> = {}): Promise<HelperResponse> {
    if (!this.connected) {
      throw new Error('Not connected to helper')
    }
    
    if (!this.socket) {
      throw new Error('Socket not initialized')
    }
    
    return new Promise((resolve, reject) => {
      const message: HelperMessage = { type, data }
      const messageStr = JSON.stringify(message)
      
      this.socket!.write(messageStr)
      
      const timeout = setTimeout(() => {
        reject(new Error('Helper response timeout'))
      }, 10000)
      
      const dataHandler = (response: Buffer) => {
        clearTimeout(timeout)
        this.socket!.removeListener('error', errorHandler)
        try {
          const parsed = JSON.parse(response.toString()) as HelperResponse
          resolve(parsed)
        } catch (error) {
          reject(new Error('Invalid response from helper'))
        }
      }
      
      const errorHandler = (error: Error) => {
        clearTimeout(timeout)
        this.socket!.removeListener('data', dataHandler)
        reject(error)
      }
      
      this.socket!.once('data', dataHandler)
      this.socket!.once('error', errorHandler)
    })
  }
  
  // Get helper status
  async getStatus(): Promise<StatusResponse> {
    return this.sendMessage('status') as Promise<StatusResponse>
  }
  
  // Request cleanup
  async requestCleanup(): Promise<CleanupResponse> {
    return this.sendMessage('cleanup') as Promise<CleanupResponse>
  }
  
  // Check port availability
  async checkPort(port: number): Promise<PortCheckResponse> {
    return this.sendMessage('check-port', { port }) as Promise<PortCheckResponse>
  }
  
  // Find next available port
  async findPort(startPort: number = 3000, maxAttempts: number = 100): Promise<FindPortResponse> {
    return this.sendMessage('find-port', { startPort, maxAttempts }) as Promise<FindPortResponse>
  }
  
  // Ping helper
  async ping(): Promise<HelperResponse> {
    return this.sendMessage('ping')
  }
  
  // Disconnect
  disconnect(): void {
    if (this.socket) {
      this.socket.end()
      this.socket = null
      this.connected = false
    }
  }
  
  // Check if connected
  isConnected(): boolean {
    return this.connected
  }
}

// CLI interface
if (require.main === module) {
  const client = new HelperClient()
  
  async function main(): Promise<void> {
    const command = process.argv[2]
    const arg = process.argv[3]
    
    try {
      await client.connect()
      
      switch (command) {
        case 'status': {
          const status = await client.getStatus()
          console.log('Helper Status:', JSON.stringify(status, null, 2))
          break
        }
          
        case 'cleanup': {
          const cleanup = await client.requestCleanup()
          console.log('Cleanup Result:', JSON.stringify(cleanup, null, 2))
          break
        }
          
        case 'check-port': {
          const port = parseInt(arg, 10) || 3000
          const portCheck = await client.checkPort(port)
          console.log(`Port ${port} check:`, JSON.stringify(portCheck, null, 2))
          break
        }
          
        case 'find-port': {
          const startPort = parseInt(arg, 10) || 3000
          const findResult = await client.findPort(startPort)
          console.log(`Find port starting from ${startPort}:`, JSON.stringify(findResult, null, 2))
          break
        }
          
        case 'ping': {
          const pong = await client.ping()
          console.log('Pong:', JSON.stringify(pong, null, 2))
          break
        }
        
        default:
          console.log('Usage: node ipc-client.js [status|cleanup|check-port <port>|find-port <start>|ping]')
          process.exit(1)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('Error:', errorMessage)
      process.exit(1)
    } finally {
      client.disconnect()
    }
  }
  
  main().catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('Fatal error:', errorMessage)
    process.exit(1)
  })
}

export default HelperClient
export { HelperClient }


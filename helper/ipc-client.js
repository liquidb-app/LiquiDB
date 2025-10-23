#!/usr/bin/env node

/**
 * LiquiDB Helper IPC Client
 * 
 * Simplified client for communicating with the helper service
 */

const net = require('net')
const fs = require('fs')
const path = require('path')

// Configuration
const SOCKET_PATH = path.join(require('os').homedir(), 'Library', 'Application Support', 'LiquiDB', 'helper.sock')

class HelperClient {
  constructor() {
    this.socket = null
    this.connected = false
  }
  
  // Connect to helper
  async connect() {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(SOCKET_PATH)) {
        reject(new Error('Helper IPC socket not found'))
        return
      }
      
      this.socket = net.createConnection(SOCKET_PATH)
      
      this.socket.on('connect', () => {
        this.connected = true
        console.log('Connected to LiquiDB Helper')
        resolve()
      })
      
      this.socket.on('error', (error) => {
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
  async sendMessage(type, data = {}) {
    if (!this.connected) {
      throw new Error('Not connected to helper')
    }
    
    return new Promise((resolve, reject) => {
      const message = JSON.stringify({ type, data })
      
      this.socket.write(message)
      
      this.socket.once('data', (response) => {
        try {
          const parsed = JSON.parse(response.toString())
          resolve(parsed)
        } catch (error) {
          reject(new Error('Invalid response from helper'))
        }
      })
      
      this.socket.once('error', reject)
      
      // Timeout after 10 seconds
      setTimeout(() => {
        reject(new Error('Helper response timeout'))
      }, 10000)
    })
  }
  
  // Get helper status
  async getStatus() {
    return this.sendMessage('status')
  }
  
  // Request cleanup
  async requestCleanup() {
    return this.sendMessage('cleanup')
  }
  
  // Check port availability
  async checkPort(port) {
    return this.sendMessage('check-port', { port })
  }
  
  // Find next available port
  async findPort(startPort = 3000, maxAttempts = 100) {
    return this.sendMessage('find-port', { startPort, maxAttempts })
  }
  
  // Ping helper
  async ping() {
    return this.sendMessage('ping')
  }
  
  // Disconnect
  disconnect() {
    if (this.socket) {
      this.socket.end()
      this.socket = null
      this.connected = false
    }
  }
}

// CLI interface
if (require.main === module) {
  const client = new HelperClient()
  
  async function main() {
    const command = process.argv[2]
    const arg = process.argv[3]
    
    try {
      await client.connect()
      
      switch (command) {
        case 'status':
          const status = await client.getStatus()
          console.log('Helper Status:', JSON.stringify(status, null, 2))
          break
          
        case 'cleanup':
          const cleanup = await client.requestCleanup()
          console.log('Cleanup Result:', JSON.stringify(cleanup, null, 2))
          break
          
        case 'check-port':
          const port = parseInt(arg) || 3000
          const portCheck = await client.checkPort(port)
          console.log(`Port ${port} check:`, JSON.stringify(portCheck, null, 2))
          break
          
        case 'find-port':
          const startPort = parseInt(arg) || 3000
          const findResult = await client.findPort(startPort)
          console.log(`Find port starting from ${startPort}:`, JSON.stringify(findResult, null, 2))
          break
          
        case 'ping':
          const pong = await client.ping()
          console.log('Pong:', JSON.stringify(pong, null, 2))
          break
          
        default:
          console.log('Usage: node ipc-client.js [status|cleanup|check-port <port>|find-port <start>|ping]')
          process.exit(1)
      }
    } catch (error) {
      console.error('Error:', error.message)
      process.exit(1)
    } finally {
      client.disconnect()
    }
  }
  
  main()
}

module.exports = HelperClient
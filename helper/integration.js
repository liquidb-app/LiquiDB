/**
 * LiquiDB Helper Integration
 * 
 * Provides easy integration with the main LiquiDB app
 */

const HelperClient = require('./ipc-client')

class LiquiDBHelperIntegration {
  constructor() {
    this.client = new HelperClient()
    this.connected = false
  }
  
  // Initialize connection to helper
  async initialize() {
    try {
      await this.client.connect()
      this.connected = true
      console.log('Connected to LiquiDB Helper')
      return true
    } catch (error) {
      console.warn('Could not connect to LiquiDB Helper:', error.message)
      this.connected = false
      return false
    }
  }
  
  // Check if helper is available
  async isAvailable() {
    if (!this.connected) {
      return false
    }
    
    try {
      await this.client.ping()
      return true
    } catch (error) {
      this.connected = false
      return false
    }
  }
  
  // Get helper status
  async getStatus() {
    if (!this.connected) {
      throw new Error('Not connected to helper')
    }
    
    return this.client.getStatus()
  }
  
  // Request immediate cleanup
  async requestCleanup() {
    if (!this.connected) {
      throw new Error('Not connected to helper')
    }
    
    return this.client.requestCleanup()
  }
  
  // Cleanup on app startup
  async cleanupOnStartup() {
    if (!this.connected) {
      console.log('Helper not available, skipping startup cleanup')
      return
    }
    
    try {
      console.log('Requesting helper cleanup on startup...')
      const result = await this.requestCleanup()
      console.log(`Helper cleanup completed: ${result.data.cleanedCount} processes cleaned`)
    } catch (error) {
      console.warn('Helper cleanup failed:', error.message)
    }
  }
  
  // Cleanup on app shutdown
  async cleanupOnShutdown() {
    if (!this.connected) {
      return
    }
    
    try {
      console.log('Requesting helper cleanup on shutdown...')
      await this.requestCleanup()
    } catch (error) {
      console.warn('Helper cleanup failed:', error.message)
    } finally {
      this.client.disconnect()
    }
  }
  
  // Disconnect
  disconnect() {
    if (this.connected) {
      this.client.disconnect()
      this.connected = false
    }
  }
}

module.exports = LiquiDBHelperIntegration

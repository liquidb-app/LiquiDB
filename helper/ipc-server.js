#!/usr/bin/env node

/**
 * LiquiDB Helper IPC Server
 * 
 * Provides communication between the main LiquiDB app and the helper process
 * using Unix domain sockets for efficient local communication
 */

const net = require('net')
const fs = require('fs')
const path = require('path')

// Configuration
const SOCKET_PATH = path.join(require('os').homedir(), 'Library', 'Application Support', 'LiquiDB', 'helper.sock')

// Ensure directory exists
const socketDir = path.dirname(SOCKET_PATH)
if (!fs.existsSync(socketDir)) {
  fs.mkdirSync(socketDir, { recursive: true })
}

// Remove existing socket file
if (fs.existsSync(SOCKET_PATH)) {
  fs.unlinkSync(SOCKET_PATH)
}

// Create server
const server = net.createServer((socket) => {
  console.log('Client connected to helper IPC')
  
  socket.on('data', (data) => {
    try {
      const message = JSON.parse(data.toString())
      handleMessage(message, socket)
    } catch (error) {
      console.error('Error parsing message:', error)
      socket.write(JSON.stringify({ error: 'Invalid JSON' }))
    }
  })
  
  socket.on('close', () => {
    console.log('Client disconnected from helper IPC')
  })
  
  socket.on('error', (error) => {
    console.error('Socket error:', error)
  })
})

// Handle incoming messages
function handleMessage(message, socket) {
  const { type, data } = message
  
  switch (type) {
    case 'status':
      handleStatusRequest(socket)
      break
      
    case 'cleanup':
      handleCleanupRequest(socket)
      break
      
    case 'ping':
      socket.write(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
      break
      
    default:
      socket.write(JSON.stringify({ error: 'Unknown message type' }))
  }
}

// Handle status request
function handleStatusRequest(socket) {
  const status = {
    type: 'status_response',
    data: {
      running: true,
      pid: process.pid,
      uptime: process.uptime(),
      timestamp: Date.now()
    }
  }
  
  socket.write(JSON.stringify(status))
}

// Handle cleanup request
async function handleCleanupRequest(socket) {
  try {
    // Import the main helper functions
    const helperPath = path.join(__dirname, 'liquidb-helper.js')
    const helper = require(helperPath)
    
    // Run cleanup
    const result = await helper.cleanupOrphanedProcesses()
    
    socket.write(JSON.stringify({
      type: 'cleanup_response',
      data: {
        success: true,
        cleanedCount: result,
        timestamp: Date.now()
      }
    }))
  } catch (error) {
    socket.write(JSON.stringify({
      type: 'cleanup_response',
      data: {
        success: false,
        error: error.message,
        timestamp: Date.now()
      }
    }))
  }
}

// Only start server if this is the main module
if (require.main === module) {
  // Start server
  server.listen(SOCKET_PATH, () => {
    console.log(`Helper IPC server listening on ${SOCKET_PATH}`)
    
    // Set socket permissions
    fs.chmodSync(SOCKET_PATH, 0o666)
  })
} else {
  // If being required as a module, start the server immediately
  server.listen(SOCKET_PATH, () => {
    console.log(`Helper IPC server listening on ${SOCKET_PATH}`)
    
    // Set socket permissions
    try {
      fs.chmodSync(SOCKET_PATH, 0o666)
    } catch (error) {
      console.error('Failed to set socket permissions:', error)
    }
  })
}

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down IPC server...')
  server.close(() => {
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH)
    }
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('Shutting down IPC server...')
  server.close(() => {
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH)
    }
    process.exit(0)
  })
})

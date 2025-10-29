const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
}

class Logger {
  constructor() {
    // Get log level from environment variable or default to ERROR (minimal)
    const envLevel = process.env.LOG_LEVEL?.toUpperCase()
    this.level = envLevel ? LogLevel[envLevel] : LogLevel.ERROR
  }

  shouldLog(level) {
    return level <= this.level
  }

  formatMessage(level, message, ...args) {
    const timestamp = new Date().toISOString()
    return `[${timestamp}] [${level}] ${message}`
  }

  error(message, ...args) {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message), ...args)
    }
  }

  warn(message, ...args) {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message), ...args)
    }
  }

  info(message, ...args) {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message), ...args)
    }
  }

  debug(message, ...args) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message), ...args)
    }
  }

  verbose(message, ...args) {
    if (this.shouldLog(LogLevel.VERBOSE)) {
      console.log(this.formatMessage('VERBOSE', message), ...args)
    }
  }

  setLevel(level) {
    this.level = level
  }

  getLevel() {
    return this.level
  }
}

// Create singleton instance
const logger = new Logger()

// Export for CommonJS
module.exports = {
  LogLevel,
  logger,
  log: {
    error: (message, ...args) => logger.error(message, ...args),
    warn: (message, ...args) => logger.warn(message, ...args),
    info: (message, ...args) => logger.info(message, ...args),
    debug: (message, ...args) => logger.debug(message, ...args),
    verbose: (message, ...args) => logger.verbose(message, ...args)
  }
}

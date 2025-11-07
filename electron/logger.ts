const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  VERBOSE: 4
} as const

type LogLevelType = typeof LogLevel[keyof typeof LogLevel]

class Logger {
  private level: LogLevelType

  constructor() {
    // Get log level from environment variable or default to ERROR (minimal)
    // Check if process is available (Node.js/Electron environment)
    const envLevel = typeof process !== 'undefined' && process.env?.LOG_LEVEL
      ? process.env.LOG_LEVEL.toUpperCase()
      : undefined

    if (envLevel && envLevel in LogLevel) {
      this.level = LogLevel[envLevel as keyof typeof LogLevel]
    } else {
      this.level = LogLevel.ERROR
    }
  }

  shouldLog(level: LogLevelType): boolean {
    return level <= this.level
  }

  formatMessage(level: string, message: string, ..._args: unknown[]): string {
    const timestamp = new Date().toISOString()
    return `[${timestamp}] [${level}] ${message}`
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message), ...args)
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message), ...args)
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message), ...args)
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.log(this.formatMessage('DEBUG', message), ...args)
    }
  }

  verbose(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.VERBOSE)) {
      console.log(this.formatMessage('VERBOSE', message), ...args)
    }
  }

  setLevel(level: LogLevelType): void {
    this.level = level
  }

  getLevel(): LogLevelType {
    return this.level
  }
}

// Create singleton instance
const logger = new Logger()

// Helper functions for easier usage
const log = {
  error: (message: string, ...args: unknown[]) => logger.error(message, ...args),
  warn: (message: string, ...args: unknown[]) => logger.warn(message, ...args),
  info: (message: string, ...args: unknown[]) => logger.info(message, ...args),
  debug: (message: string, ...args: unknown[]) => logger.debug(message, ...args),
  verbose: (message: string, ...args: unknown[]) => logger.verbose(message, ...args)
}

export {
  LogLevel,
  logger,
  log
}

const loggerModule = {
  LogLevel,
  logger,
  log
}

export default loggerModule


import chalk from 'chalk';
import ora from 'ora';

// Enhanced logger with colors and animations
class Logger {
  private static instance: Logger;
  private spinner: any = null;
  private isDebug: boolean;

  private constructor() {
    this.isDebug = process.env.DEBUG === '1' || process.env.DEBUG === 'true';
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  // Basic logging methods
  public info(message: string, ...args: any[]): void {
    if (this.isDebug) {
      console.log(chalk.blue('ℹ'), chalk.blue(message), ...args);
    }
  }

  public success(message: string, ...args: any[]): void {
    if (this.isDebug) {
      console.log(chalk.green('✓'), chalk.green(message), ...args);
    }
  }

  public warning(message: string, ...args: any[]): void {
    if (this.isDebug) {
      console.log(chalk.yellow('⚠'), chalk.yellow(message), ...args);
    }
  }

  public error(message: string, ...args: any[]): void {
    if (this.isDebug) {
      console.log(chalk.red('✗'), chalk.red(message), ...args);
    }
  }

  public debug(message: string, ...args: any[]): void {
    if (this.isDebug) {
      console.log(chalk.gray('🐛'), chalk.gray(message), ...args);
    }
  }

  // Database-specific logging
  public database(type: string, action: string, details?: any): void {
    if (this.isDebug) {
      const icon = this.getDatabaseIcon(type);
      const coloredType = this.getDatabaseColor(type);
      console.log(
        chalk.cyan('🗄️'),
        `${icon} ${coloredType}`,
        chalk.white(action),
        details ? chalk.gray(JSON.stringify(details, null, 2)) : ''
      );
    }
  }

  public port(port: number, action: string, details?: any): void {
    if (this.isDebug) {
      console.log(
        chalk.magenta('🔌'),
        chalk.magenta(`Port ${port}`),
        chalk.white(action),
        details ? chalk.gray(JSON.stringify(details, null, 2)) : ''
      );
    }
  }

  public process(pid: number, action: string, details?: any): void {
    if (this.isDebug) {
      console.log(
        chalk.blue('⚙️'),
        chalk.blue(`PID ${pid}`),
        chalk.white(action),
        details ? chalk.gray(JSON.stringify(details, null, 2)) : ''
      );
    }
  }

  // Spinner methods for long-running operations
  public startSpinner(message: string): void {
    if (this.isDebug && !this.spinner) {
      this.spinner = ora({
        text: message,
        spinner: 'dots',
        color: 'cyan'
      }).start();
    }
  }

  public updateSpinner(message: string): void {
    if (this.isDebug && this.spinner) {
      this.spinner.text = message;
    }
  }

  public stopSpinner(success: boolean = true, message?: string): void {
    if (this.isDebug && this.spinner) {
      if (success) {
        this.spinner.succeed(message || 'Completed');
      } else {
        this.spinner.fail(message || 'Failed');
      }
      this.spinner = null;
    }
  }

  // Progress logging
  public progress(current: number, total: number, message: string): void {
    if (this.isDebug) {
      const percentage = Math.round((current / total) * 100);
      const bar = this.createProgressBar(percentage);
      console.log(
        chalk.cyan('📊'),
        `${bar} ${percentage}%`,
        chalk.white(message)
      );
    }
  }

  // Header and section logging
  public header(message: string): void {
    if (this.isDebug) {
      console.log('\n' + chalk.bold.cyan('═'.repeat(60)));
      console.log(chalk.bold.cyan(`  ${message}`));
      console.log(chalk.bold.cyan('═'.repeat(60)) + '\n');
    }
  }

  public section(message: string): void {
    if (this.isDebug) {
      console.log('\n' + chalk.bold.white(`▶ ${message}`));
      console.log(chalk.gray('─'.repeat(40)));
    }
  }

  // Database operation banners
  public databaseStartBanner(dbName: string, dbType: string, port: number): void {
    if (this.isDebug) {
      const icon = this.getDatabaseIcon(dbType);
      const colorFn = this.getDatabaseColor(dbType);
      console.log('\n' + chalk.bold.green('╔'.repeat(50)));
      console.log(chalk.bold.green('║') + `  ${icon} ${colorFn(dbType.toUpperCase())} DATABASE STARTING`);
      console.log(chalk.bold.green('║') + `  Name: ${chalk.white(dbName)}`);
      console.log(chalk.bold.green('║') + `  Port: ${chalk.yellow(port)}`);
      console.log(chalk.bold.green('║') + `  Time: ${chalk.gray(new Date().toLocaleTimeString())}`);
      console.log(chalk.bold.green('╚'.repeat(50)) + '\n');
    }
  }

  public databaseStopBanner(dbName: string, dbType: string, port: number): void {
    if (this.isDebug) {
      const icon = this.getDatabaseIcon(dbType);
      const colorFn = this.getDatabaseColor(dbType);
      console.log('\n' + chalk.bold.red('╔'.repeat(50)));
      console.log(chalk.bold.red('║') + `  ${icon} ${colorFn(dbType.toUpperCase())} DATABASE STOPPING`);
      console.log(chalk.bold.red('║') + `  Name: ${chalk.white(dbName)}`);
      console.log(chalk.bold.red('║') + `  Port: ${chalk.yellow(port)}`);
      console.log(chalk.bold.red('║') + `  Time: ${chalk.gray(new Date().toLocaleTimeString())}`);
      console.log(chalk.bold.red('╚'.repeat(50)) + '\n');
    }
  }

  public databaseCreateBanner(dbName: string, dbType: string, port: number, dataPath: string): void {
    if (this.isDebug) {
      const icon = this.getDatabaseIcon(dbType);
      const colorFn = this.getDatabaseColor(dbType);
      console.log('\n' + chalk.bold.blue('╔'.repeat(60)));
      console.log(chalk.bold.blue('║') + `  ${icon} ${colorFn(dbType.toUpperCase())} DATABASE CREATION`);
      console.log(chalk.bold.blue('║') + `  Name: ${chalk.white(dbName)}`);
      console.log(chalk.bold.blue('║') + `  Port: ${chalk.yellow(port)}`);
      console.log(chalk.bold.blue('║') + `  Path: ${chalk.gray(dataPath)}`);
      console.log(chalk.bold.blue('║') + `  Time: ${chalk.gray(new Date().toLocaleTimeString())}`);
      console.log(chalk.bold.blue('╚'.repeat(60)) + '\n');
    }
  }

  public installationBanner(packageName: string, version: string): void {
    if (this.isDebug) {
      console.log('\n' + chalk.bold.magenta('╔'.repeat(60)));
      console.log(chalk.bold.magenta('║') + `  📦 PACKAGE INSTALLATION`);
      console.log(chalk.bold.magenta('║') + `  Package: ${chalk.white(packageName)}`);
      console.log(chalk.bold.magenta('║') + `  Version: ${chalk.yellow(version)}`);
      console.log(chalk.bold.magenta('║') + `  Time: ${chalk.gray(new Date().toLocaleTimeString())}`);
      console.log(chalk.bold.magenta('╚'.repeat(60)) + '\n');
    }
  }

  public portConflictBanner(port: number, conflictingDb: string, newDb: string): void {
    if (this.isDebug) {
      console.log('\n' + chalk.bold.yellow('╔'.repeat(60)));
      console.log(chalk.bold.yellow('║') + `  ⚠️  PORT CONFLICT DETECTED`);
      console.log(chalk.bold.yellow('║') + `  Port: ${chalk.red(port)}`);
      console.log(chalk.bold.yellow('║') + `  Conflicting: ${chalk.red(conflictingDb)}`);
      console.log(chalk.bold.yellow('║') + `  Requested: ${chalk.blue(newDb)}`);
      console.log(chalk.bold.yellow('║') + `  Time: ${chalk.gray(new Date().toLocaleTimeString())}`);
      console.log(chalk.bold.yellow('╚'.repeat(60)) + '\n');
    }
  }

  public successBanner(message: string, details?: string): void {
    if (this.isDebug) {
      console.log('\n' + chalk.bold.green('╔'.repeat(50)));
      console.log(chalk.bold.green('║') + `  ✅ ${message}`);
      if (details) {
        console.log(chalk.bold.green('║') + `  ${chalk.gray(details)}`);
      }
      console.log(chalk.bold.green('║') + `  Time: ${chalk.gray(new Date().toLocaleTimeString())}`);
      console.log(chalk.bold.green('╚'.repeat(50)) + '\n');
    }
  }

  public errorBanner(message: string, details?: string): void {
    if (this.isDebug) {
      console.log('\n' + chalk.bold.red('╔'.repeat(50)));
      console.log(chalk.bold.red('║') + `  ❌ ${message}`);
      if (details) {
        console.log(chalk.bold.red('║') + `  ${chalk.gray(details)}`);
      }
      console.log(chalk.bold.red('║') + `  Time: ${chalk.gray(new Date().toLocaleTimeString())}`);
      console.log(chalk.bold.red('╚'.repeat(50)) + '\n');
    }
  }

  // Utility methods
  private getDatabaseIcon(type: string): string {
    const icons: { [key: string]: string } = {
      postgresql: '🐘',
      mysql: '🐬',
      mariadb: '🐚',
      mongodb: '🍃',
      cassandra: '☁️',
      mssql: '🗄️',
      redshift: '🔴'
    };
    return icons[type.toLowerCase()] || '🗃️';
  }

  private getDatabaseColor(type: string): any {
    const colors: { [key: string]: any } = {
      postgresql: chalk.blue,
      mysql: chalk.yellow,
      mariadb: chalk.magenta,
      mongodb: chalk.green,
      cassandra: chalk.cyan,
      mssql: chalk.red,
      redshift: chalk.red
    };
    return colors[type.toLowerCase()] || chalk.white;
  }

  private createProgressBar(percentage: number, length: number = 20): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  // Legacy support
  public log(message: string, ...args: any[]): void {
    this.info(message, ...args);
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export individual methods for convenience
export const {
  info,
  success,
  warning,
  error,
  debug,
  database,
  port,
  process: processLog,
  startSpinner,
  updateSpinner,
  stopSpinner,
  progress,
  header,
  section,
  databaseStartBanner,
  databaseStopBanner,
  databaseCreateBanner,
  installationBanner,
  portConflictBanner,
  successBanner,
  errorBanner,
  log
} = logger;

/**
 * Shared application state
 * This module manages global state that needs to be shared across modules
 */

import { BrowserWindow } from "electron"
import { ChildProcess } from "child_process"
import { HelperServiceManager } from "../helper-service"
import PermissionsManager from "../permissions"
import { IDatabase } from "../../types/database"
import AutoLaunch from "auto-launch"

export interface DatabaseProcess {
  process: ChildProcess
  config: IDatabase
  isStartupComplete?: () => boolean
}

let mainWindow: BrowserWindow | null = null
const runningDatabases = new Map<string, DatabaseProcess>() // id -> { process, config }
let helperService: HelperServiceManager | null = null
let permissionsManager: PermissionsManager | null = null
let autoStartTriggered = false
let autoLauncher: AutoLaunch | null = null

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function getRunningDatabases(): Map<string, DatabaseProcess> {
  return runningDatabases
}

export function setHelperService(service: HelperServiceManager | null): void {
  helperService = service
}

export function getHelperService(): HelperServiceManager | null {
  return helperService
}

export function setPermissionsManager(manager: PermissionsManager | null): void {
  permissionsManager = manager
}

export function getPermissionsManager(): PermissionsManager | null {
  return permissionsManager
}

export function setAutoStartTriggered(triggered: boolean): void {
  autoStartTriggered = triggered
}

export function getAutoStartTriggered(): boolean {
  return autoStartTriggered
}

export function setAutoLauncher(launcher: AutoLaunch | null): void {
  autoLauncher = launcher
}

export function getAutoLauncher(): AutoLaunch | null {
  return autoLauncher
}

const sharedState = {
  setMainWindow,
  getMainWindow,
  getRunningDatabases,
  setHelperService,
  getHelperService,
  setPermissionsManager,
  getPermissionsManager,
  setAutoStartTriggered,
  getAutoStartTriggered,
  setAutoLauncher,
  getAutoLauncher,
}

export default sharedState


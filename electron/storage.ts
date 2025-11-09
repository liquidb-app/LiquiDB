import * as fs from "fs"
import * as path from "path"
import { App } from "electron"

function getDataDir(app: App): string {
  const dir = path.join(app.getPath("userData"))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getDatabasesFile(app: App): string {
  return path.join(getDataDir(app), "databases.json")
}

export function getDatabaseDataDir(app: App, containerId: string): string {
  const databasesDir = path.join(getDataDir(app), "databases")
  if (!fs.existsSync(databasesDir)) fs.mkdirSync(databasesDir, { recursive: true })
  return path.join(databasesDir, containerId)
}

export function loadDatabases(app: App): any[] {
  const file = getDatabasesFile(app)
  if (!fs.existsSync(file)) return []
  try {
    const raw = fs.readFileSync(file, "utf-8")
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveDatabases(app: App, databases: any[]): void {
  const file = getDatabasesFile(app)
  fs.writeFileSync(file, JSON.stringify(databases, null, 2), "utf-8")
}

export function upsertDatabase(app: App, db: any): any {
  const list = loadDatabases(app)
  const idx = list.findIndex((d: any) => d.id === db.id)
  if (idx >= 0) list[idx] = db
  else list.push(db)
  saveDatabases(app, list)
  return db
}

export function deleteDatabase(app: App, id: string): boolean {
  const list = loadDatabases(app)
  const next = list.filter((d: any) => d.id !== id)
  saveDatabases(app, next)
  return true
}

export function deleteAllDatabases(app: App): boolean {
  saveDatabases(app, [])
  return true
}

export function checkDatabasesFileExists(app: App): boolean {
  const file = getDatabasesFile(app)
  return fs.existsSync(file)
}

export function recreateDatabasesFile(app: App): boolean {
  const file = getDatabasesFile(app)
  if (!fs.existsSync(file)) {
    saveDatabases(app, [])
    console.log("[Storage] Recreated missing databases.json file")
    return true
  }
  return false
}

/**
 * Ensure the databases directory exists
 * This should be called during app initialization to ensure the directory is always present
 */
export function ensureDatabasesDirectory(app: App): void {
  const databasesDir = path.join(getDataDir(app), "databases")
  if (!fs.existsSync(databasesDir)) {
    try {
      fs.mkdirSync(databasesDir, { recursive: true })
      console.log("[Storage] Created databases directory:", databasesDir)
    } catch (error) {
      console.error("[Storage] Failed to create databases directory:", error)
    }
  }
}

const storage = {
  loadDatabases,
  saveDatabases,
  upsertDatabase,
  deleteDatabase,
  deleteAllDatabases,
  checkDatabasesFileExists,
  recreateDatabasesFile,
  getDatabaseDataDir,
  ensureDatabasesDirectory,
}

export default storage


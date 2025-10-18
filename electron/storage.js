const fs = require("fs")
const path = require("path")

function getDataDir(app) {
  const dir = path.join(app.getPath("userData"))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getDatabasesFile(app) {
  return path.join(getDataDir(app), "databases.json")
}

function loadDatabases(app) {
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

function saveDatabases(app, databases) {
  const file = getDatabasesFile(app)
  fs.writeFileSync(file, JSON.stringify(databases, null, 2), "utf-8")
}

function upsertDatabase(app, db) {
  const list = loadDatabases(app)
  const idx = list.findIndex((d) => d.id === db.id)
  if (idx >= 0) list[idx] = db
  else list.push(db)
  saveDatabases(app, list)
  return db
}

function deleteDatabase(app, id) {
  const list = loadDatabases(app)
  const next = list.filter((d) => d.id !== id)
  saveDatabases(app, next)
  return true
}

function deleteAllDatabases(app) {
  saveDatabases(app, [])
  return true
}

module.exports = {
  loadDatabases,
  saveDatabases,
  upsertDatabase,
  deleteDatabase,
  deleteAllDatabases,
}




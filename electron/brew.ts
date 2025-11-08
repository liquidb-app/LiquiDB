import * as fs from "fs"
import { spawn } from "child_process"

function findBrewPath(): string {
  const candidates = [
    "/opt/homebrew/bin/brew", // Apple Silicon default
    "/usr/local/bin/brew", // Intel default
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  // Fallback to PATH resolution
  return "brew"
}

export function isHomebrewInstalled(): boolean {
  try {
    const brewPath = findBrewPath()
    if (!brewPath) return false
    // Quick check by trying to stat or just return true if path exists
    if (brewPath !== "brew") return true
    return true
  } catch {
    return false
  }
}

interface InstallOptions {
  onStdout?: (data: string) => void
  onStderr?: (data: string) => void
}

export function installHomebrew({ onStdout, onStderr }: InstallOptions = {}): Promise<boolean> {
  return new Promise((resolve, reject) => {
    console.log("[Homebrew] Starting Homebrew installation...")
    // Non-interactive Homebrew install script
    const script =
      '/bin/bash -c "NONINTERACTIVE=1 /bin/bash -c \"$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""'
    const child = spawn("bash", ["-lc", script], { 
      env: { ...process.env, NONINTERACTIVE: "1" },
      stdio: "pipe"
    })

    child.stdout!.on("data", (d: Buffer) => {
      const output = d.toString()
      console.log(`[Homebrew Install] ${output.trim()}`)
      onStdout?.(output)
    })
    
    child.stderr!.on("data", (d: Buffer) => {
      const output = d.toString()
      console.log(`[Homebrew Install Error] ${output.trim()}`)
      onStderr?.(output)
    })
    
    child.on("error", (err: Error) => {
      console.error(`[Homebrew Install] Process error:`, err)
      reject(err)
    })
    
    child.on("close", (code: number | null) => {
      console.log(`[Homebrew Install] Installation completed with code ${code}`)
      if (code === 0) {
        console.log("[Homebrew] Homebrew installation successful!")
        resolve(true)
      } else {
        reject(new Error(`Homebrew install exited with code ${code}`))
      }
    })
  })
}

interface ExecResult {
  stdout: string
  stderr: string
}

export function execBrew(args: string[], { onStdout, onStderr }: InstallOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const brewPath = findBrewPath()
    
    // Set up environment with Homebrew paths
    // Disable auto-update to prevent Homebrew from installing unrelated packages
    // (like migrating casks to formulae during installation)
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/opt/homebrew/sbin:${process.env.PATH}`,
      HOMEBREW_PREFIX: "/opt/homebrew",
      HOMEBREW_NO_AUTO_UPDATE: "1"
    }
    
    const child = spawn(brewPath, args, { stdio: "pipe", env })
    let stdout = ""
    let stderr = ""
    
    child.stdout!.on("data", (d: Buffer) => {
      const s = d.toString()
      stdout += s
      console.log(`[Homebrew] ${s.trim()}`)
      onStdout?.(s)
    })
    
    child.stderr!.on("data", (d: Buffer) => {
      const s = d.toString()
      stderr += s
      console.log(`[Homebrew Error] ${s.trim()}`)
      onStderr?.(s)
    })
    
    child.on("error", (err: Error) => {
      console.error(`[Homebrew] Process error:`, err)
      reject(err)
    })
    
    child.on("close", (code: number | null) => {
      console.log(`[Homebrew] Process exited with code ${code}`)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(stderr || `brew ${args.join(" ")} failed with code ${code}`))
    })
  })
}

async function ensureTap(tap: string): Promise<void> {
  try {
    await execBrew(["tap", tap])
  } catch {
    // ignore
  }
}

export async function getDatabaseVersions(dbType: string): Promise<string[]> {
  try {
    if (dbType === "postgresql") {
      const { stdout } = await execBrew(["search", "^postgresql@"], {})
      const versions = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("postgresql@"))
        .map((l) => l.replace("postgresql@", ""))
        .filter(Boolean)
      return versions.length ? versions : ["16", "15", "14", "13"]
    }
    if (dbType === "mysql") {
      const { stdout } = await execBrew(["search", "^mysql@"], {})
      const versions = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("mysql@"))
        .map((l) => l.replace("mysql@", ""))
        .filter(Boolean)
      return versions.length ? versions : ["8.0", "5.7"]
    }
    if (dbType === "mongodb") {
      await ensureTap("mongodb/brew")
      const { stdout } = await execBrew(["search", "^mongodb-community@"], {})
      const versions = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("mongodb-community@"))
        .map((l) => l.replace("mongodb-community@", ""))
        .filter(Boolean)
      return versions.length ? versions : ["7.0", "6.0"]
    }
    if (dbType === "redis") {
      try {
        const { stdout } = await execBrew(["info", "--json=v2", "redis"], {}) // stable
        const json = JSON.parse(stdout)
        const stable = json?.formulae?.[0]?.versions?.stable
        return stable ? [stable] : ["7.2", "7.0", "6.2"]
      } catch {
        return ["7.2", "7.0", "6.2"]
      }
    }
  } catch (_e) {
    // Fallback to defaults
  }
  if (dbType === "postgresql") return ["16", "15", "14", "13"]
  if (dbType === "mysql") return ["8.0", "5.7"]
  if (dbType === "mongodb") return ["7.0", "6.0", "5.0"]
  if (dbType === "redis") return ["7.2", "7.0", "6.2"]
  return []
}

function formulaFor(dbType: string, version: string): string {
  // Extract major version for Homebrew formulas
  const getMajorVersion = (version: string): string => {
    if (!version) return ""
    // For versions like "9.4.0", extract "9.4"
    // For versions like "8.0.35", extract "8.0"
    // For versions like "16.1", extract "16"
    const parts = version.split('.')
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}`
    }
    return parts[0]
  }
  
  const majorVersion = getMajorVersion(version)
  
  if (dbType === "postgresql") return `postgresql@${majorVersion}`
  if (dbType === "mysql") return `mysql@${majorVersion}`
  if (dbType === "mongodb") return `mongodb-community@${majorVersion}`
  if (dbType === "redis") return version ? `redis@${majorVersion}` : "redis"
  return ""
}

interface InstallDatabaseOptions extends InstallOptions {
  dbType: string
  version: string
}

interface InstallDatabaseResult extends ExecResult {
  alreadyInstalled?: boolean
}

export async function installDatabase({ dbType, version, onStdout, onStderr }: InstallDatabaseOptions): Promise<InstallDatabaseResult> {
  console.log(`[Homebrew] Installing ${dbType} version ${version}...`)
  
  if (dbType === "mongodb") {
    console.log("[Homebrew] Adding MongoDB tap...")
    try {
      await ensureTap("mongodb/brew")
      console.log("[Homebrew] MongoDB tap ensured")
    } catch (tapError: any) {
      console.error(`[Homebrew] Error ensuring MongoDB tap:`, tapError.message)
      // Continue anyway - tap might already exist
    }
  }
  
  const formula = formulaFor(dbType, version)
  if (!formula) {
    throw new Error(`Could not determine formula for ${dbType} version ${version}`)
  }
  console.log(`[Homebrew] Installing formula: ${formula}`)
  
  // For MongoDB, use the full tap path
  const fullFormula = dbType === "mongodb" ? `mongodb/brew/${formula}` : formula
  
  // Check if already installed first
  try {
    const { stdout } = await execBrew(["list", fullFormula])
    if (stdout.includes(formula) || stdout.includes(fullFormula)) {
      console.log(`[Homebrew] ${fullFormula} is already installed, skipping installation`)
      return { 
        stdout: `${fullFormula} already installed`, 
        stderr: "",
        alreadyInstalled: true 
      }
    }
  } catch (_e) {
    console.log(`[Homebrew] ${fullFormula} not found in list, will install`)
    // Not installed, continue with installation
  }
  
  // Use --formula flag to explicitly install as a formula (not cask)
  // This prevents Homebrew from trying to migrate casks to formulae
  try {
    const result = await execBrew(["install", "--formula", fullFormula], { 
      onStdout: (data: string) => {
        console.log(`[Homebrew Install] ${data.trim()}`)
        onStdout?.(data)
      },
      onStderr: (data: string) => {
        console.log(`[Homebrew Install Error] ${data.trim()}`)
        onStderr?.(data)
      }
    })
    
    // Check if the installation was successful or if it was already installed
    if (result.stderr && result.stderr.includes("already installed")) {
      console.log(`[Homebrew] ${fullFormula} was already installed (detected from stderr)`)
      return {
        ...result,
        alreadyInstalled: true
      }
    }
    
    return result
  } catch (installError: any) {
    // Provide more detailed error message
    let errorMessage = installError.message || `Failed to install ${fullFormula}`
    
    // Extract more details from stderr if available
    if (installError.stderr) {
      const stderrLines = installError.stderr.split('\n').filter((line: string) => line.trim())
      const lastErrorLine = stderrLines[stderrLines.length - 1]
      if (lastErrorLine && lastErrorLine.length > 0) {
        errorMessage = lastErrorLine
      }
    }
    
    console.error(`[Homebrew] Installation failed for ${fullFormula}:`, errorMessage)
    throw new Error(errorMessage)
  }
}


import { ipcMain } from "electron"
import { exec } from "child_process"
const brew = require("../brew")
const { getStableVersionsFromOfficialSources, getMongoDBVersions, getFallbackVersionDetails, compareVersions } = require("../utils/version-utils")

interface VersionDetail {
  majorVersion: string
  fullVersion: string
  packageName: string
}

/**
 * Register version IPC handlers
 */
export function registerVersionHandlers(): void {
  if (process.argv.includes('--mcp') || !ipcMain) {
    return
  }

  ipcMain.handle("get-stable-versions", async (event, databaseType: string) => {
    return await getStableVersionsFromOfficialSources(databaseType)
  })

  ipcMain.handle("get-brew-versions", async (event, packageName: string) => {
    try {
      console.log(`[Brew] Fetching detailed versions for ${packageName}`)
      
      // Special handling for MongoDB - check the MongoDB tap for available versions
      if (packageName === "mongodb-community") {
        return await getMongoDBVersions()
      }
      
      // Get detailed version information with full version numbers
      const result = await new Promise<VersionDetail[]>((resolve) => {
        const versionDetails: VersionDetail[] = []
        let completedCalls = 0
        const totalCalls = 2
        
        const checkComplete = () => {
          completedCalls++
          if (completedCalls === totalCalls) {
            // Sort versions (newest first)
            const sortedVersions = versionDetails.sort((a, b) => {
              return compareVersions(b.fullVersion, a.fullVersion)
            })
            
            console.log(`[Brew] Found ${sortedVersions.length} detailed versions for ${packageName}:`, sortedVersions)
            resolve(sortedVersions.length > 0 ? sortedVersions : getFallbackVersionDetails(packageName))
          }
        }
        
        // Get versioned packages with full version info
        exec(`brew search --formula "^${packageName}@"`, (error: any, stdout: string, stderr: string) => {
          if (!error && stdout) {
            try {
              const lines = stdout.trim().split('\n').filter(line => line.trim())
              const packagePromises: Promise<VersionDetail | null>[] = []
              
              for (const line of lines) {
                const match = line.match(new RegExp(`^${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@(.+)$`))
                if (match) {
                  const majorVersion = match[1]
                  const fullPackageName = `${packageName}@${majorVersion}`
                  
                  // Get full version details for each package
                  packagePromises.push(
                    new Promise<VersionDetail | null>((resolve) => {
                      exec(`brew info ${fullPackageName} --json`, (infoError: any, infoStdout: string) => {
                        if (!infoError && infoStdout) {
                          try {
                            const info = JSON.parse(infoStdout)
                            if (info && info.length > 0) {
                              const fullVersion = info[0].versions?.stable || info[0].version
                              if (fullVersion) {
                                resolve({
                                  majorVersion,
                                  fullVersion,
                                  packageName: fullPackageName
                                })
                              } else {
                                resolve(null)
                              }
                            } else {
                              resolve(null)
                            }
                          } catch (parseError: any) {
                            console.log(`[Brew] Error parsing version info for ${fullPackageName}:`, parseError.message)
                            resolve(null)
                          }
                        } else {
                          resolve(null)
                        }
                      })
                    })
                  )
                }
              }
              
              // Wait for all package info to be fetched
              Promise.all(packagePromises).then((results) => {
                results.forEach(result => {
                  if (result) {
                    versionDetails.push(result)
                  }
                })
                checkComplete()
              })
            } catch (parseError: any) {
              console.log(`[Brew] Error parsing search results:`, parseError.message)
              checkComplete()
            }
          } else {
            checkComplete()
          }
        })
        
        // Get main package version
        exec(`brew info ${packageName} --json`, (infoError: any, infoStdout: string) => {
          if (!infoError && infoStdout) {
            try {
              const info = JSON.parse(infoStdout)
              if (info && info.length > 0) {
                const fullVersion = info[0].versions?.stable || info[0].version
                if (fullVersion) {
                  // Extract major version from full version
                  const majorVersion = fullVersion.split('.').slice(0, 2).join('.')
                  const existingVersion = versionDetails.find(v => v.majorVersion === majorVersion)
                  if (!existingVersion) {
                    versionDetails.push({
                      majorVersion,
                      fullVersion,
                      packageName: packageName
                    })
                  }
                }
              }
            } catch (parseError: any) {
              console.log(`[Brew] Error parsing main package version:`, parseError.message)
            }
          }
          checkComplete()
        })
      })
      
      return result
    } catch (error: any) {
      console.log(`[Brew] Failed to fetch versions for ${packageName}:`, error.message)
      return getFallbackVersionDetails(packageName)
    }
  })

  // Brew-related IPC
  ipcMain.handle("brew:isInstalled", async () => {
    return brew.isHomebrewInstalled()
  })

  ipcMain.handle("brew:install", async () => {
    await brew.installHomebrew()
    return true
  })

  ipcMain.handle("brew:getVersions", async (event, dbType: string) => {
    return brew.getDatabaseVersions(dbType)
  })

  ipcMain.handle("brew:installDb", async (event, { dbType, version }: { dbType: string, version: string }) => {
    await brew.installDatabase({ dbType, version })
    return true
  })
}


import { ipcMain } from "electron"
import { exec } from "child_process"
const brew = require("../brew")
const { getStableVersionsFromOfficialSources, getMongoDBVersions, getFallbackVersionDetails, compareVersions } = require("../utils/version-utils")

// Helper to execute brew commands with proper environment
async function execBrewCommand(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return brew.execBrew(args, {})
}

interface VersionDetail {
  majorVersion: string
  fullVersion: string
  packageName: string
}

/**
 * Register version IPC handlers
 */
export function registerVersionHandlers(): void {
  if (!ipcMain) {
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
      

      const versionDetails: VersionDetail[] = []
      
      try {

        const searchResult = await execBrewCommand(["search", "--formula", `^${packageName}@`])
        const lines = searchResult.stdout.trim().split('\n').filter(line => line.trim())
        
        console.log(`[Brew] Found ${lines.length} versioned packages for ${packageName}`)
        

        const packagePromises: Promise<VersionDetail | null>[] = []
        
        for (const line of lines) {
          const match = line.match(new RegExp(`^${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}@(.+)$`))
          if (match) {
            const majorVersion = match[1]
            const fullPackageName = `${packageName}@${majorVersion}`
            

            packagePromises.push(
              execBrewCommand(["info", fullPackageName, "--json"])
                .then((infoResult) => {
                  try {
                    const info = JSON.parse(infoResult.stdout)
                    if (info && info.length > 0) {
                      const fullVersion = info[0].versions?.stable || info[0].version
                      if (fullVersion) {
                        console.log(`[Brew] Found version ${fullVersion} for ${fullPackageName}`)
                        return {
                          majorVersion,
                          fullVersion,
                          packageName: fullPackageName
                        }
                      }
                    }
                  } catch (parseError: any) {
                    console.log(`[Brew] Error parsing version info for ${fullPackageName}:`, parseError.message)
                  }
                  return null
                })
                .catch((error: any) => {
                  console.log(`[Brew] Error getting info for ${fullPackageName}:`, error.message)
                  return null
                })
            )
          }
        }
        
        // Wait for all package info to be fetched
        const results = await Promise.all(packagePromises)
        results.forEach(result => {
          if (result) {
            versionDetails.push(result)
          }
        })
      } catch (searchError: any) {
        console.log(`[Brew] Error searching for ${packageName} versions:`, searchError.message)
      }
      

      try {
        const mainInfoResult = await execBrewCommand(["info", packageName, "--json"])
        const info = JSON.parse(mainInfoResult.stdout)
        if (info && info.length > 0) {
          const fullVersion = info[0].versions?.stable || info[0].version
          if (fullVersion) {

            const majorVersion = fullVersion.split('.').slice(0, 2).join('.')
            const existingVersion = versionDetails.find(v => v.majorVersion === majorVersion)
            if (!existingVersion) {
              versionDetails.push({
                majorVersion,
                fullVersion,
                packageName: packageName
              })
              console.log(`[Brew] Found main package version ${fullVersion} for ${packageName}`)
            }
          }
        }
      } catch (mainInfoError: any) {
        console.log(`[Brew] Error getting main package version for ${packageName}:`, mainInfoError.message)
      }
      
      const sortedVersions = versionDetails.sort((a, b) => {
        return compareVersions(b.fullVersion, a.fullVersion)
      })
      
      console.log(`[Brew] Found ${sortedVersions.length} detailed versions for ${packageName}:`, sortedVersions)
      
      // Only use fallback if we truly found nothing
      if (sortedVersions.length === 0) {
        console.log(`[Brew] No versions found for ${packageName}, using fallback`)
        return getFallbackVersionDetails(packageName)
      }
      
      return sortedVersions
    } catch (error: any) {
      console.error(`[Brew] Failed to fetch versions for ${packageName}:`, error.message)
      console.error(`[Brew] Error stack:`, error.stack)
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
    try {
      const result = await brew.installDatabase({ dbType, version })
      return result
    } catch (error: any) {
      console.error(`[IPC] Error installing ${dbType} ${version}:`, error)
      // Re-throw the error so it can be caught by the frontend
      throw error
    }
  })
}


import { exec } from "child_process"

/**
 * Fetch with timeout
 * @param {string} url - URL to fetch
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>} - Fetch response
 */
export async function fetchWithTimeout(url: string, timeoutMs: number = 3000): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (error: any) {
    clearTimeout(timeoutId)
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`)
    }
    throw error
  }
}

/**
 * Fetch stable version information from official sources
 * @param {string} databaseType - Database type
 * @returns {Promise<string[]>} - Array of stable versions
 */
export async function getStableVersionsFromOfficialSources(databaseType: string): Promise<string[]> {
  try {
    console.log(`[Stable Versions] Fetching stable versions for ${databaseType}`)
    
    const stableVersions: { [key: string]: string[] } = {
      postgresql: [],
      mysql: [],
      mongodb: [],
      redis: []
    }
    
    // Fetch PostgreSQL stable versions
    if (databaseType === 'postgresql') {
      try {
        const response = await fetchWithTimeout('https://www.postgresql.org/support/versioning/', 3000)
        const html = await response.text()
        // Parse HTML to extract supported versions (this is a simplified approach)
        // In a real implementation, you'd want to use a proper HTML parser
        const versionMatches = html.match(/PostgreSQL (\d+\.\d+)/g)
        if (versionMatches) {
          stableVersions.postgresql = versionMatches
            .map(match => match.replace('PostgreSQL ', ''))
            .filter(version => {
              const major = parseInt(version.split('.')[0])
              return major >= 15 // Only include versions 15+ as stable
            })
        }
      } catch (error: any) {
        console.log(`[Stable Versions] Error fetching PostgreSQL versions:`, error.message)
        // Fallback to known stable versions
        stableVersions.postgresql = ['16', '15']
      }
    }
    
    // Fetch MySQL stable versions
    if (databaseType === 'mysql') {
      try {
        const response = await fetchWithTimeout('https://dev.mysql.com/doc/relnotes/mysql/8.4/en/', 3000)
        const html = await response.text()
        // Check if 8.4 is available and stable
        if (html.includes('8.4')) {
          stableVersions.mysql = ['8.4', '8.0']
        } else {
          stableVersions.mysql = ['8.0']
        }
      } catch (error: any) {
        console.log(`[Stable Versions] Error fetching MySQL versions:`, error.message)
        stableVersions.mysql = ['8.4', '8.0']
      }
    }
    
    // Fetch MongoDB stable versions
    if (databaseType === 'mongodb') {
      try {
        const response = await fetchWithTimeout('https://www.mongodb.com/docs/manual/release-notes/', 3000)
        const html = await response.text()
        // Extract version numbers from release notes
        const versionMatches = html.match(/MongoDB (\d+\.\d+)/g)
        if (versionMatches) {
          stableVersions.mongodb = versionMatches
            .map(match => match.replace('MongoDB ', ''))
            .filter(version => {
              const major = parseInt(version.split('.')[0])
              return major >= 8 // Only include versions 8+ as stable
            })
            .slice(0, 2) // Take only the latest 2 stable versions
        }
      } catch (error: any) {
        console.log(`[Stable Versions] Error fetching MongoDB versions:`, error.message)
        stableVersions.mongodb = ['8.2', '8.0']
      }
    }
    
    // Fetch Redis stable versions
    if (databaseType === 'redis') {
      try {
        const response = await fetchWithTimeout('https://redis.io/docs/about/releases/', 3000)
        const html = await response.text()
        // Extract version numbers from releases page
        const versionMatches = html.match(/Redis (\d+\.\d+)/g)
        if (versionMatches) {
          stableVersions.redis = versionMatches
            .map(match => match.replace('Redis ', ''))
            .filter(version => {
              const major = parseInt(version.split('.')[0])
              return major >= 7 // Only include versions 7+ as stable
            })
            .slice(0, 2) // Take only the latest 2 stable versions
        }
      } catch (error: any) {
        console.log(`[Stable Versions] Error fetching Redis versions:`, error.message)
        stableVersions.redis = ['7.2', '7.0']
      }
    }
    
    console.log(`[Stable Versions] Found stable versions for ${databaseType}:`, stableVersions[databaseType])
    return stableVersions[databaseType] || []
    
  } catch (error: any) {
    console.log(`[Stable Versions] Error fetching stable versions for ${databaseType}:`, error.message)
    // Return fallback stable versions
    const fallbackStable: { [key: string]: string[] } = {
      postgresql: ['16', '15'],
      mysql: ['8.4', '8.0'],
      mongodb: ['8.2', '8.0'],
      redis: ['7.2', '7.0']
    }
    return fallbackStable[databaseType] || []
  }
}

interface VersionDetail {
  majorVersion: string
  fullVersion: string
  packageName: string
}

/**
 * Get MongoDB versions
 * @returns {Promise<Array>} - Array of MongoDB version details
 */
export async function getMongoDBVersions(): Promise<VersionDetail[]> {
  try {
    console.log(`[Brew] Fetching detailed MongoDB versions`)
    
    // Fast MongoDB version fetching with full version details
    const versions = await new Promise<VersionDetail[]>((resolve) => {
      // Use a single command to get MongoDB versions quickly
      exec(`brew search mongodb/brew/mongodb-community`, (error: any, stdout: string, stderr: string) => {
        if (error) {
          console.log(`[Brew] Error searching MongoDB versions:`, error.message)
          resolve(getFallbackVersionDetails("mongodb-community"))
          return
        }
        
        try {
          const lines = stdout.trim().split('\n').filter(line => line.trim())
          const mongoPackages: string[] = []
          
          // Extract versioned package names from mongodb-community@x.x.x format
          for (const line of lines) {
            const match = line.match(/mongodb-community@([0-9.]+)/)
            if (match) {
              mongoPackages.push(`mongodb/brew/mongodb-community@${match[1]}`)
            }
          }
          
          // Get full version details for each MongoDB package
          const getMongoVersionDetails = async (packages: string[]): Promise<VersionDetail[]> => {
            const versionDetails: VersionDetail[] = []
            
            for (const pkg of packages) {
              try {
                const versionInfo = await new Promise<VersionDetail | null>((resolve) => {
                  exec(`brew info ${pkg} --json`, (infoError: any, infoStdout: string) => {
                    if (!infoError && infoStdout) {
                      try {
                        const info = JSON.parse(infoStdout)
                        if (info && info.length > 0) {
                          const fullVersion = info[0].versions?.stable || info[0].version
                          if (fullVersion) {
                            const match = pkg.match(/mongodb-community@([0-9.]+)/)
                            if (match) {
                              const majorVersion = match[1]
                              resolve({
                                majorVersion,
                                fullVersion,
                                packageName: pkg
                              })
                            } else {
                              resolve(null)
                            }
                          } else {
                            resolve(null)
                          }
                        } else {
                          resolve(null)
                        }
                      } catch (parseError: any) {
                        console.log(`[Brew] Error parsing MongoDB version info for ${pkg}:`, parseError.message)
                        resolve(null)
                      }
                    } else {
                      resolve(null)
                    }
                  })
                })
                
                if (versionInfo) {
                  versionDetails.push(versionInfo)
                }
              } catch (err: any) {
                console.log(`[Brew] Error getting MongoDB version for ${pkg}:`, err.message)
              }
            }
            
            return versionDetails
          }
          
          // Get full version details for all MongoDB packages
          getMongoVersionDetails(mongoPackages).then((versionDetails) => {
            // Sort versions (newest first)
            const sortedVersions = versionDetails.sort((a, b) => {
              return compareVersions(b.fullVersion, a.fullVersion)
            })
            
            console.log(`[Brew] Found ${sortedVersions.length} detailed MongoDB versions:`, sortedVersions)
            resolve(sortedVersions.length > 0 ? sortedVersions : getFallbackVersionDetails("mongodb-community"))
          })
        } catch (parseError: any) {
          console.log(`[Brew] Error parsing MongoDB versions:`, parseError.message)
          resolve(getFallbackVersionDetails("mongodb-community"))
        }
      })
    })
    
    return versions
  } catch (error: any) {
    console.log(`[Brew] Failed to fetch MongoDB versions:`, error.message)
    return getFallbackVersionDetails("mongodb-community")
  }
}

/**
 * Compare semantic versions
 * @param {string} a - Version string a
 * @param {string} b - Version string b
 * @returns {number} - Comparison result
 */
export function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aPart = aParts[i] || 0
    const bPart = bParts[i] || 0
    if (aPart !== bPart) {
      return aPart - bPart
    }
  }
  return 0
}

/**
 * Get fallback versions
 * @param {string} packageName - Package name
 * @returns {string[]} - Array of fallback versions
 */
export function getFallbackVersions(packageName: string): string[] {
  const fallbackVersions: { [key: string]: string[] } = {
    postgresql: ["16.1", "15.5", "14.10", "13.13", "12.17"],
    mysql: ["8.0.35", "5.7.44", "5.6.51"],
    "mongodb-community": ["8.2.1", "8.0.4", "7.0.14", "6.0.20", "5.0.30"],
    redis: ["7.2.4", "7.0.15", "6.2.14"],
  }
  return fallbackVersions[packageName] || ["latest"]
}

/**
 * Get fallback version details with full version info
 * @param {string} packageName - Package name
 * @returns {Array} - Array of version details
 */
export function getFallbackVersionDetails(packageName: string): VersionDetail[] {
  const fallbackDetails: { [key: string]: VersionDetail[] } = {
    postgresql: [
      { majorVersion: "16", fullVersion: "16.1", packageName: "postgresql@16" },
      { majorVersion: "15", fullVersion: "15.5", packageName: "postgresql@15" },
      { majorVersion: "14", fullVersion: "14.10", packageName: "postgresql@14" },
      { majorVersion: "13", fullVersion: "13.13", packageName: "postgresql@13" },
      { majorVersion: "12", fullVersion: "12.17", packageName: "postgresql@12" }
    ],
    mysql: [
      { majorVersion: "8.0", fullVersion: "8.0.35", packageName: "mysql@8.0" },
      { majorVersion: "5.7", fullVersion: "5.7.44", packageName: "mysql@5.7" },
      { majorVersion: "5.6", fullVersion: "5.6.51", packageName: "mysql@5.6" }
    ],
    "mongodb-community": [
      { majorVersion: "8.2", fullVersion: "8.2.1", packageName: "mongodb-community@8.2" },
      { majorVersion: "8.0", fullVersion: "8.0.4", packageName: "mongodb-community@8.0" },
      { majorVersion: "7.0", fullVersion: "7.0.14", packageName: "mongodb-community@7.0" },
      { majorVersion: "6.0", fullVersion: "6.0.20", packageName: "mongodb-community@6.0" },
      { majorVersion: "5.0", fullVersion: "5.0.30", packageName: "mongodb-community@5.0" }
    ],
    redis: [
      { majorVersion: "7.2", fullVersion: "7.2.4", packageName: "redis@7.2" },
      { majorVersion: "7.0", fullVersion: "7.0.15", packageName: "redis@7.0" },
      { majorVersion: "6.2", fullVersion: "6.2.14", packageName: "redis@6.2" }
    ]
  }
  return fallbackDetails[packageName] || [{ majorVersion: "latest", fullVersion: "latest", packageName: packageName }]
}


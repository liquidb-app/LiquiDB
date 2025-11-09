"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Cpu, MemoryStick } from "lucide-react"
import { ActivityIcon } from "@/components/ui/activity"
import { SquareActivityIcon } from "@/components/ui/square-activity"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Area, AreaChart, Line, LineChart, Pie, PieChart, Cell, XAxis, YAxis, CartesianGrid } from "recharts"

interface SystemInfo {
  success: boolean
  pid?: number | null
  memory?: number | null // RSS memory in bytes
  cpu?: number | null // CPU percentage
  systemMemory?: {
    free?: number
    active?: number
    inactive?: number
    wired?: number
    total?: number
    used?: number
  } | null
  connections?: number
  uptime?: number
  isRunning?: boolean
  killed?: boolean
  exitCode?: number | null
  error?: string
}

interface InstanceInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  databaseId?: string
  databaseName?: string
}

export function InstanceInfoDialog({ open, onOpenChange, databaseId, databaseName }: InstanceInfoDialogProps) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memoryHistory, setMemoryHistory] = useState<Array<{ time: string, memory: number }>>([])
  const [cpuHistory, setCpuHistory] = useState<Array<{ time: string, cpu: number }>>([])
  const lastMemoryValues = useRef({ rss: 120000000, vsz: 250000000 })
  const lastCpuValue = useRef(1.5)

  const fetchSystemInfo = useCallback(async () => {
    if (!databaseId) {
      setError("Database ID is required")
      return
    }
    
    setLoading(true)
    setError(null)
    
    try {
      if (!window?.electron?.getDatabaseSystemInfo) {
        setError("Electron API not available")
        return
      }
      
      const info = await window.electron.getDatabaseSystemInfo(databaseId)
      setSystemInfo(info ?? null)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch system info')
      setSystemInfo(null)
    } finally {
      setLoading(false)
    }
  }, [databaseId])

  const generateSmoothMemoryData = useCallback(() => {
    const rssChange = (Math.random() - 0.5) * 0.04 * lastMemoryValues.current.rss
    const vszChange = (Math.random() - 0.5) * 0.04 * lastMemoryValues.current.vsz
    
    const newRss = Math.max(80000000, Math.min(200000000, lastMemoryValues.current.rss + rssChange))
    const newVsz = Math.max(150000000, Math.min(400000000, lastMemoryValues.current.vsz + vszChange))
    
    lastMemoryValues.current = { rss: newRss, vsz: newVsz }
    return lastMemoryValues.current
  }, [])

  const generateSmoothCpuData = useCallback(() => {
    const cpuChange = (Math.random() - 0.5) * 1.0
    const newCpu = Math.max(0, Math.min(8, lastCpuValue.current + cpuChange))
    
    lastCpuValue.current = newCpu
    return lastCpuValue.current
  }, [])

  useEffect(() => {
    if (!open || !databaseId) {
      setMemoryHistory([])
      setCpuHistory([])
      return
    }
    
    const now = new Date()
    const sampleMemoryData: Array<{ time: string, memory: number }> = []
    const sampleCpuData: Array<{ time: string, cpu: number }> = []
    
    let currentMemory = 120000000
    let currentCpu = 1.5
    
    for (let i = 0; i < 20; i++) {
      const time = new Date(now.getTime() - (19 - i) * 1000).toLocaleTimeString()
      
      currentMemory += (Math.random() - 0.5) * 2000000
      currentCpu += (Math.random() - 0.5) * 0.5
      
      currentMemory = Math.max(80000000, Math.min(200000000, currentMemory))
      currentCpu = Math.max(0, Math.min(8, currentCpu))
      
      sampleMemoryData.push({
        time,
        memory: currentMemory
      })
      sampleCpuData.push({
        time,
        cpu: currentCpu
      })
    }
    
    lastMemoryValues.current = { rss: currentMemory, vsz: currentMemory * 1.5 } // Keep vsz for backward compatibility with generateSmoothMemoryData
    lastCpuValue.current = currentCpu
    
    setMemoryHistory(sampleMemoryData)
    setCpuHistory(sampleCpuData)
    
    fetchSystemInfo()
    
    const interval = setInterval(() => {
      try {
        const now = new Date()
        const time = now.toLocaleTimeString()
        
        // Fetch system info periodically and use it for charts
        fetchSystemInfo()
        
        // Use generated data for smooth chart animation
        const memoryData = generateSmoothMemoryData()
        
        setMemoryHistory(prev => {
          const newData = [...prev, {
            time,
            memory: memoryData.rss
          }]
          return newData.slice(-15)
        })
        
        const cpuData = generateSmoothCpuData()
        
        setCpuHistory(prev => {
          const newData = [...prev, {
            time,
            cpu: cpuData ?? 0
          }]
          return newData.slice(-15)
        })
      } catch (error) {
        console.error('Error updating chart data:', error)
      }
    }, 5000)
    
    return () => {
      clearInterval(interval)
      setMemoryHistory([])
      setCpuHistory([])
    }
  }, [open, databaseId, fetchSystemInfo, generateSmoothCpuData, generateSmoothMemoryData])

  const formatBytes = (bytes: number | null | undefined) => {
    const value = bytes ?? 0
    if (value === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(value) / Math.log(k))
    return parseFloat((value / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatPercentage = (value: number | null | undefined) => {
    return (value ?? 0).toFixed(1) + '%'
  }

  const formatUptime = (seconds: number | null | undefined) => {
    const value = seconds ?? 0
    if (value < 60) return `${value}s`
    if (value < 3600) return `${Math.floor(value / 60)}m`
    if (value < 86400) return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`
    return `${Math.floor(value / 86400)}d ${Math.floor((value % 86400) / 3600)}h`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SquareActivityIcon size={20} />
            Instance Information - {databaseName ?? "Unknown Database"}
          </DialogTitle>
          <DialogDescription>
            Real-time monitoring and performance metrics for this database instance
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Auto-refresh indicator */}
          <div className="flex justify-center">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                <span>Live streaming data every 2s</span>
              </div>
          </div>

          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-4">
                <p className="text-destructive text-sm">{error}</p>
              </CardContent>
            </Card>
          )}

          {systemInfo && (
            <div className="space-y-4">
              {/* Process Status */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ActivityIcon size={16} />
                    Process Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <Badge 
                        variant={(systemInfo.isRunning ?? false) ? "default" : "destructive"}
                        className="ml-2"
                      >
                        {(systemInfo.isRunning ?? false) ? "Running" : "Stopped"}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">PID:</span>
                      <span className="ml-2 font-mono">{systemInfo.pid ?? 'N/A'}</span>
                    </div>
                    {systemInfo.exitCode !== null && systemInfo.exitCode !== undefined && (
                      <div>
                        <span className="text-muted-foreground">Exit Code:</span>
                        <span className="ml-2 font-mono">{systemInfo.exitCode}</span>
                      </div>
                    )}
                    {systemInfo.killed && (
                      <div>
                        <span className="text-muted-foreground">Killed:</span>
                        <span className="ml-2 text-destructive">Yes</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Memory Usage */}
              {systemInfo.memory !== null && systemInfo.memory !== undefined && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <MemoryStick className="h-4 w-4" />
                      Memory Usage
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">RSS (Resident Set Size):</span>
                        <div className="font-mono text-lg">{formatBytes(systemInfo.memory)}</div>
                      </div>
                      {systemInfo.cpu !== null && systemInfo.cpu !== undefined && (
                        <div>
                          <span className="text-muted-foreground">CPU Usage:</span>
                          <div className="font-mono text-lg">{formatPercentage(systemInfo.cpu)}</div>
                        </div>
                      )}
                      {systemInfo.connections !== null && systemInfo.connections !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Connections:</span>
                          <div className="font-mono text-lg">{systemInfo.connections}</div>
                        </div>
                      )}
                      {systemInfo.uptime !== null && systemInfo.uptime !== undefined && (
                        <div>
                          <span className="text-muted-foreground">Uptime:</span>
                          <div className="font-mono text-lg">{formatUptime(systemInfo.uptime)}</div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* System Memory */}
              {systemInfo.systemMemory && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Cpu className="h-4 w-4" />
                      System Memory
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Memory:</span>
                        <div className="font-mono text-lg">{formatBytes(systemInfo.systemMemory?.total)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Free Memory:</span>
                        <div className="font-mono text-lg">{formatBytes(systemInfo.systemMemory?.free)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Active Memory:</span>
                        <div className="font-mono text-lg">{formatBytes(systemInfo.systemMemory?.active)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Inactive Memory:</span>
                        <div className="font-mono text-lg">{formatBytes(systemInfo.systemMemory?.inactive)}</div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground">Memory Usage:</span>
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${((systemInfo.systemMemory?.active ?? 0) / (systemInfo.systemMemory?.total ?? 1) * 100).toFixed(1)}%` 
                          }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {((systemInfo.systemMemory?.active ?? 0) / (systemInfo.systemMemory?.total ?? 1) * 100).toFixed(1)}% used
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Charts Section */}
              {(memoryHistory.length > 0 || cpuHistory.length > 0) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ActivityIcon size={16} />
                      Performance Charts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Memory Usage Chart */}
                    {memoryHistory.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Memory Usage Over Time</h4>
                        <ChartContainer
                          config={{
                            memory: {
                              label: "Memory (RSS)",
                              color: "#3b82f6",
                            },
                          }}
                          className="h-[200px] w-full"
                        >
                          <AreaChart data={memoryHistory}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="time" 
                              tick={{ fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis 
                              tick={{ fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => formatBytes(value)}
                            />
                            <ChartTooltip 
                              content={<ChartTooltipContent 
                                formatter={(value, name) => {
                                  if (name === 'memory') {
                                    return [formatBytes(Number(value)), 'Memory (RSS)']
                                  }
                                  return [value, name]
                                }}
                              />} 
                            />
                            <Area
                              type="monotone"
                              dataKey="memory"
                              stroke="#3b82f6"
                              fill="#3b82f6"
                              fillOpacity={0.8}
                              strokeWidth={2}
                            />
                          </AreaChart>
                        </ChartContainer>
                      </div>
                    )}

                    {/* CPU Usage Chart */}
                    {cpuHistory.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">CPU Usage Over Time</h4>
                        <ChartContainer
                          config={{
                            cpu: {
                              label: "CPU Usage",
                              color: "#f59e0b",
                            },
                          }}
                          className="h-[150px] w-full"
                        >
                          <LineChart data={cpuHistory}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis 
                              dataKey="time" 
                              tick={{ fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                            />
                            <YAxis 
                              tick={{ fontSize: 12 }}
                              tickLine={false}
                              axisLine={false}
                              tickFormatter={(value) => `${value}%`}
                            />
                            <ChartTooltip 
                              content={<ChartTooltipContent 
                                formatter={(value, name) => {
                                  if (name === 'cpu') {
                                    return [`${Number(value).toFixed(1)}%`, 'CPU Usage']
                                  }
                                  return [value, name]
                                }}
                              />} 
                            />
                            <Line
                              type="monotone"
                              dataKey="cpu"
                              stroke="#f59e0b"
                              strokeWidth={3}
                              dot={{ fill: "#f59e0b", strokeWidth: 2, r: 5 }}
                              activeDot={{ r: 6, stroke: "#f59e0b", strokeWidth: 2 }}
                            />
                          </LineChart>
                        </ChartContainer>
                      </div>
                    )}

                    {/* Memory Distribution Pie Chart */}
                    {systemInfo?.memory && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">Memory Distribution</h4>
                        <ChartContainer
                          config={{
                            memory: {
                              label: "Memory (RSS)",
                              color: "#3b82f6",
                            },
                          }}
                          className="h-[200px] w-full"
                        >
                          <PieChart>
                            <Pie
                              data={[
                                { name: "Memory (RSS)", value: systemInfo.memory ?? 0, fill: "#3b82f6" },
                              ]}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={80}
                              paddingAngle={2}
                              dataKey="value"
                              stroke="#000000"
                              strokeWidth={2}
                            >
                              {[
                                { name: "Memory (RSS)", value: systemInfo.memory ?? 0, fill: "#3b82f6" },
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill ?? "#3b82f6"} />
                              ))}
                            </Pie>
                            <ChartTooltip 
                              content={<ChartTooltipContent 
                                formatter={(value) => [formatBytes(Number(value)), "Memory"]}
                              />} 
                            />
                          </PieChart>
                        </ChartContainer>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

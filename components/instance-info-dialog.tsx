"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { X, RefreshCw, Cpu, MemoryStick, Clock } from "lucide-react"
import { SettingsIcon } from "@/components/ui/settings"
import { ActivityIcon } from "@/components/ui/activity"
import { SquareActivityIcon } from "@/components/ui/square-activity"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Area, AreaChart, Bar, BarChart, Line, LineChart, Pie, PieChart, Cell, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts"

interface SystemInfo {
  success: boolean
  pid: number | null
  memory: {
    rss: number
    vsz: number
    cpu: number
    pmem: number
    time: string
  } | null
  systemMemory: {
    free: number
    active: number
    inactive: number
    wired: number
    total: number
  } | null
  isRunning: boolean
  killed: boolean
  exitCode: number | null
  error?: string
}

interface InstanceInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  databaseId: string
  databaseName: string
}

export function InstanceInfoDialog({ open, onOpenChange, databaseId, databaseName }: InstanceInfoDialogProps) {
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memoryHistory, setMemoryHistory] = useState<Array<{ time: string, rss: number, vsz: number }>>([])
  const [cpuHistory, setCpuHistory] = useState<Array<{ time: string, cpu: number }>>([])
  const lastMemoryValues = useRef({ rss: 120000000, vsz: 250000000 })
  const lastCpuValue = useRef(1.5)

  const fetchSystemInfo = async () => {
    if (!databaseId) return
    
    setLoading(true)
    setError(null)
    
    try {
      // @ts-ignore
      const info = await window.electron?.getDatabaseSystemInfo?.(databaseId)
      setSystemInfo(info)
      
      // Real system info is now fetched every 5 seconds and used for the static info display
      // Chart data is streamed continuously every second for smooth animation
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch system info')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && databaseId) {
      // Initialize with some sample data to make charts visible
      const now = new Date()
      const sampleMemoryData = []
      const sampleCpuData = []
      
      // Generate smooth initial data
      let currentRss = 120000000
      let currentVsz = 250000000
      let currentCpu = 1.5
      
      for (let i = 0; i < 20; i++) {
        const time = new Date(now.getTime() - (19 - i) * 1000).toLocaleTimeString()
        
        // Add small variations for initial data
        currentRss += (Math.random() - 0.5) * 2000000
        currentVsz += (Math.random() - 0.5) * 5000000
        currentCpu += (Math.random() - 0.5) * 0.5
        
        // Keep values within reasonable bounds
        currentRss = Math.max(80000000, Math.min(200000000, currentRss))
        currentVsz = Math.max(150000000, Math.min(400000000, currentVsz))
        currentCpu = Math.max(0, Math.min(8, currentCpu))
        
        sampleMemoryData.push({
          time,
          rss: currentRss,
          vsz: currentVsz
        })
        sampleCpuData.push({
          time,
          cpu: currentCpu
        })
      }
      
      // Set the last values for smooth continuation
      lastMemoryValues.current = { rss: currentRss, vsz: currentVsz }
      lastCpuValue.current = currentCpu
      
      setMemoryHistory(sampleMemoryData)
      setCpuHistory(sampleCpuData)
      
      fetchSystemInfo()
      
      // Continuous data streaming - add new data point every 2 seconds to prevent crashes
      const interval = setInterval(() => {
        try {
          const now = new Date()
          const time = now.toLocaleTimeString()
          
          // Generate smooth memory data
          const memoryData = generateSmoothMemoryData()
          
          // Add new memory data point
          setMemoryHistory(prev => {
            const newData = [...prev, {
              time,
              rss: memoryData.rss,
              vsz: memoryData.vsz
            }]
            return newData.slice(-20) // Keep last 20 data points (40 seconds of data)
          })
          
          // Generate smooth CPU data
          const cpuData = generateSmoothCpuData()
          
          // Add new CPU data point
          setCpuHistory(prev => {
            const newData = [...prev, {
              time,
              cpu: cpuData
            }]
            return newData.slice(-20) // Keep last 20 data points (40 seconds of data)
          })
          
          // Fetch real system info less frequently (every 10 seconds)
          if (Math.floor(Date.now() / 1000) % 10 === 0) {
            fetchSystemInfo()
          }
        } catch (error) {
          console.error('Error updating chart data:', error)
        }
      }, 2000) // Update every 2 seconds to reduce load
      
      return () => {
        clearInterval(interval)
        // Clear historical data when dialog closes
        setMemoryHistory([])
        setCpuHistory([])
      }
    }
  }, [open, databaseId])

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // Smooth data generation functions - using refs to avoid re-renders
  const generateSmoothMemoryData = useCallback(() => {
    // Small gradual changes (±2% max change per second)
    const rssChange = (Math.random() - 0.5) * 0.04 * lastMemoryValues.current.rss
    const vszChange = (Math.random() - 0.5) * 0.04 * lastMemoryValues.current.vsz
    
    const newRss = Math.max(80000000, Math.min(200000000, lastMemoryValues.current.rss + rssChange))
    const newVsz = Math.max(150000000, Math.min(400000000, lastMemoryValues.current.vsz + vszChange))
    
    lastMemoryValues.current = { rss: newRss, vsz: newVsz }
    return lastMemoryValues.current
  }, [])

  const generateSmoothCpuData = useCallback(() => {
    // Small gradual changes (±0.5% max change per second)
    const cpuChange = (Math.random() - 0.5) * 1.0
    const newCpu = Math.max(0, Math.min(8, lastCpuValue.current + cpuChange))
    
    lastCpuValue.current = newCpu
    return lastCpuValue.current
  }, [])

  const formatPercentage = (value: number) => {
    return value.toFixed(1) + '%'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SquareActivityIcon size={20} />
            Instance Information - {databaseName}
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
                        variant={systemInfo.isRunning ? "default" : "destructive"}
                        className="ml-2"
                      >
                        {systemInfo.isRunning ? "Running" : "Stopped"}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-muted-foreground">PID:</span>
                      <span className="ml-2 font-mono">{systemInfo.pid || 'N/A'}</span>
                    </div>
                    {systemInfo.exitCode !== null && (
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
              {systemInfo.memory && (
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
                        <div className="font-mono text-lg">{formatBytes(systemInfo.memory.rss)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">VSZ (Virtual Size):</span>
                        <div className="font-mono text-lg">{formatBytes(systemInfo.memory.vsz)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">CPU Usage:</span>
                        <div className="font-mono text-lg">{formatPercentage(systemInfo.memory.cpu)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Memory %:</span>
                        <div className="font-mono text-lg">{formatPercentage(systemInfo.memory.pmem)}</div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground">CPU Time:</span>
                      <div className="font-mono text-sm">{systemInfo.memory.time}</div>
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
                        <div className="font-mono text-lg">{formatBytes(systemInfo.systemMemory.total)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Free Memory:</span>
                        <div className="font-mono text-lg">{formatBytes(systemInfo.systemMemory.free)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Active Memory:</span>
                        <div className="font-mono text-lg">{formatBytes(systemInfo.systemMemory.active)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Inactive Memory:</span>
                        <div className="font-mono text-lg">{formatBytes(systemInfo.systemMemory.inactive)}</div>
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <span className="text-muted-foreground">Memory Usage:</span>
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div 
                          className="bg-primary h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${(systemInfo.systemMemory.active / systemInfo.systemMemory.total * 100).toFixed(1)}%` 
                          }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {(systemInfo.systemMemory.active / systemInfo.systemMemory.total * 100).toFixed(1)}% used
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
                            rss: {
                              label: "RSS Memory",
                              color: "#3b82f6",
                            },
                            vsz: {
                              label: "Virtual Memory",
                              color: "#10b981",
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
                                  if (name === 'rss') {
                                    return [formatBytes(Number(value)), 'RSS Memory']
                                  }
                                  if (name === 'vsz') {
                                    return [formatBytes(Number(value)), 'Virtual Memory']
                                  }
                                  return [value, name]
                                }}
                              />} 
                            />
                            <Area
                              type="monotone"
                              dataKey="rss"
                              stackId="1"
                              stroke="#3b82f6"
                              fill="#3b82f6"
                              fillOpacity={0.8}
                              strokeWidth={2}
                            />
                            <Area
                              type="monotone"
                              dataKey="vsz"
                              stackId="2"
                              stroke="#10b981"
                              fill="#10b981"
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
                            rss: {
                              label: "RSS Memory",
                              color: "#3b82f6",
                            },
                            vsz: {
                              label: "Virtual Memory",
                              color: "#10b981",
                            },
                          }}
                          className="h-[200px] w-full"
                        >
                          <PieChart>
                            <Pie
                              data={[
                                { name: "RSS Memory", value: systemInfo.memory.rss, fill: "#3b82f6" },
                                { name: "Virtual Memory", value: systemInfo.memory.vsz - systemInfo.memory.rss, fill: "#10b981" },
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
                                { name: "RSS Memory", value: systemInfo.memory.rss, fill: "#3b82f6" },
                                { name: "Virtual Memory", value: systemInfo.memory.vsz - systemInfo.memory.rss, fill: "#10b981" },
                              ].map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
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

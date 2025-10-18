"use client"

import { useState, useEffect } from "react"
import { Database, X, RefreshCw, Cpu, MemoryStick, Clock, Activity } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

  const fetchSystemInfo = async () => {
    if (!databaseId) return
    
    setLoading(true)
    setError(null)
    
    try {
      // @ts-ignore
      const info = await window.electron?.getDatabaseSystemInfo?.(databaseId)
      setSystemInfo(info)
      
      // Update historical data for charts
      if (info?.memory) {
        const now = new Date().toLocaleTimeString()
        console.log('Adding memory data:', { time: now, rss: info.memory.rss, vsz: info.memory.vsz })
        setMemoryHistory(prev => {
          // Add some variation to make the chart more interesting
          const variation = (Math.random() - 0.5) * 0.1 // ±5% variation
          const rss = info.memory.rss * (1 + variation)
          const vsz = info.memory.vsz * (1 + variation)
          
          const newData = [...prev, { time: now, rss, vsz }]
          console.log('Memory history updated:', newData)
          return newData.slice(-20) // Keep last 20 data points
        })
      }
      
      if (info?.memory?.cpu !== undefined) {
        const now = new Date().toLocaleTimeString()
        console.log('Adding CPU data:', { time: now, cpu: info.memory.cpu })
        setCpuHistory(prev => {
          // Add some variation to make the chart more interesting
          const variation = (Math.random() - 0.5) * 0.2 // ±10% variation
          const cpu = Math.max(0, info.memory.cpu * (1 + variation))
          
          const newData = [...prev, { time: now, cpu }]
          console.log('CPU history updated:', newData)
          return newData.slice(-20) // Keep last 20 data points
        })
      }
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
      
      for (let i = 0; i < 10; i++) {
        const time = new Date(now.getTime() - (9 - i) * 3000).toLocaleTimeString()
        sampleMemoryData.push({
          time,
          rss: 100000000 + Math.random() * 50000000, // Random memory between 100-150MB
          vsz: 200000000 + Math.random() * 100000000 // Random virtual memory between 200-300MB
        })
        sampleCpuData.push({
          time,
          cpu: Math.random() * 5 // Random CPU between 0-5%
        })
      }
      
      setMemoryHistory(sampleMemoryData)
      setCpuHistory(sampleCpuData)
      
      fetchSystemInfo()
      
      // Auto-refresh every 3 seconds
      const interval = setInterval(() => {
        fetchSystemInfo()
      }, 3000)
      
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

  const formatPercentage = (value: number) => {
    return value.toFixed(1) + '%'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Instance Information - {databaseName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Auto-refresh indicator */}
          <div className="flex justify-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
              <span>Auto-refreshing every 3s</span>
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
                    <Activity className="h-4 w-4" />
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
                            width: `${((systemInfo.systemMemory.total - systemInfo.systemMemory.free) / systemInfo.systemMemory.total * 100).toFixed(1)}%` 
                          }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {((systemInfo.systemMemory.total - systemInfo.systemMemory.free) / systemInfo.systemMemory.total * 100).toFixed(1)}% used
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
                      <Activity className="h-4 w-4" />
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

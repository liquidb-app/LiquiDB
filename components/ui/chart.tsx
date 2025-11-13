"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Type definitions for chart data
export type ChartDataPoint = Record<string, string | number | null | undefined>

export type ChartData = ChartDataPoint[]

// Type for tooltip payload item
export type TooltipPayloadItem = {
  name?: string
  value?: string | number | null
  dataKey?: string | number
  color?: string
  payload?: ChartDataPoint
  formatter?: TooltipFormatter
}

// Type for formatter function
export type TooltipFormatter = (
  value: string | number | null | undefined,
  name?: string,
  props?: TooltipPayloadItem,
  index?: number,
  payload?: ChartDataPoint
) => React.ReactNode

// Chart configuration for individual data keys
export interface ChartConfigItem {
  label?: React.ReactNode
  icon?: React.ComponentType<{ size?: number; className?: string }>
  color?: string
  className?: string
  labelWrapperClassName?: string
  labelClassName?: string
  labelColor?: string
  iconColor?: string
  formatter?: TooltipFormatter
  valueClassName?: string
  valueColor?: string
}

// Main chart configuration type
export type ChartConfig = Record<string, ChartConfigItem>

// Chart context type
interface ChartContextType {
  config: ChartConfig
  getConfig: (key: string) => ChartConfigItem | undefined
  getColor: (key: string, fallback?: string) => string
}

const ChartContext = React.createContext<ChartContextType>({
  config: {},
  getConfig: () => undefined,
  getColor: (_, fallback) => fallback ?? "hsl(var(--foreground))",
})

// Chart container props
export interface ChartContainerProps extends React.ComponentProps<"div"> {
  config: ChartConfig
  children: React.ReactElement
  id?: string
}

const ChartContainer = React.forwardRef<HTMLDivElement, ChartContainerProps>(
  ({ id, className, children, config, ...props }, ref) => {
    const uniqueId = React.useId()
    const chartId = React.useMemo(
      () => `chart-${id || uniqueId.replace(/:/g, "")}`,
      [id, uniqueId]
    )

    // Memoized context value with helper functions
    const contextValue = React.useMemo<ChartContextType>(
      () => ({
        config: config ?? {},
        getConfig: (key: string) => config?.[key],
        getColor: (key: string, fallback?: string) => {
          return config?.[key]?.color ?? fallback ?? "hsl(var(--foreground))"
        },
      }),
      [config]
    )

    return (
      <ChartContext.Provider value={contextValue}>
        <div
          data-chart={chartId}
          ref={ref}
          className={cn(
            "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-muted/30 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-muted [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-none [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-muted/30 [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-muted/30 [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-sector]:outline-none [&_.recharts-surface]:outline-none",
            className
          )}
          {...props}
        >
          <RechartsPrimitive.ResponsiveContainer>
            {children}
          </RechartsPrimitive.ResponsiveContainer>
        </div>
      </ChartContext.Provider>
    )
  }
)
ChartContainer.displayName = "ChartContainer"

// Re-export Recharts components with proper typing
const ChartTooltip = RechartsPrimitive.Tooltip as React.ComponentType<
  React.ComponentProps<typeof RechartsPrimitive.Tooltip>
>

const ChartLegend = RechartsPrimitive.Legend as React.ComponentType<
  React.ComponentProps<typeof RechartsPrimitive.Legend>
>

// Tooltip indicator type
export type TooltipIndicator = "line" | "dot" | "dashed"

// Chart tooltip content props
// In recharts 3.x, the content prop receives TooltipContentProps which includes label and payload
export interface ChartTooltipContentProps
  extends React.ComponentProps<"div"> {
  active?: boolean
  payload?: ReadonlyArray<any>
  label?: string | number
  labelFormatter?: (label: any, payload: ReadonlyArray<any>) => React.ReactNode
  formatter?: (value: any, name: any, item: any, index: number, payload: any) => React.ReactNode
  separator?: string
  contentStyle?: React.CSSProperties
  itemStyle?: React.CSSProperties
  labelStyle?: React.CSSProperties
  itemSorter?: 'dataKey' | 'value' | 'name' | ((item: any) => number | string | undefined)
  accessibilityLayer?: boolean
  hideLabel?: boolean
  hideIndicator?: boolean
  indicator?: TooltipIndicator
  nameKey?: string
  labelKey?: string
  color?: string
  labelClassName?: string
}

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  ChartTooltipContentProps
>(
  (
    {
      active,
      payload,
      className,
      indicator = "dot",
      hideLabel = false,
      hideIndicator = false,
      label,
      labelFormatter,
      labelClassName,
      formatter,
      color,
      nameKey,
      labelKey,
    },
    ref
  ) => {
    const { getConfig, getColor } = React.useContext(ChartContext)

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null
      }

      const [item] = payload as TooltipPayloadItem[]
      const key = `${labelKey || item.dataKey || item.name || "value"}`
      const itemConfig = getConfig(key)
      const value = itemConfig?.label ?? item.name ?? item.dataKey ?? "Value"
      const formattedLabel =
        typeof labelFormatter === "function"
          ? labelFormatter(label, payload as unknown as Parameters<typeof labelFormatter>[1])
          : label

      return (
        <div className={cn("font-medium", labelClassName)}>
          {formattedLabel ?? value}
        </div>
      )
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      labelKey,
      getConfig,
    ])

    const nestLabel = React.useCallback(
      (item: TooltipPayloadItem, i: number) => {
        const key = `${nameKey || item.name || item.dataKey || "value"}`
        const itemConfig = getConfig(key)
        const fallbackColor = color || item.payload?.fill || item.color
        const indicatorColor = getColor(
          key,
          typeof fallbackColor === 'string' ? fallbackColor : undefined
        )

        const ItemIcon = itemConfig?.icon

        return (
          <div
            key={item.dataKey ?? i}
            className={cn("flex w-full flex-col gap-2", itemConfig?.className)}
          >
            <div className="flex w-full flex-wrap items-center gap-2">
              {!hideIndicator && (
                <div
                  className={cn(
                    "shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
                    {
                      "h-2 w-2": indicator === "dot",
                      "h-0.5 w-3": indicator === "line",
                      "h-0.5 w-3 border-dashed": indicator === "dashed",
                    }
                  )}
                  style={
                    {
                      "--color-border": indicatorColor,
                      "--color-bg": indicatorColor,
                    } as React.CSSProperties
                  }
                />
              )}
              <div
                className={cn(
                  "flex flex-1 items-center justify-between gap-2",
                  itemConfig?.labelWrapperClassName
                )}
              >
                <div
                  className={cn(
                    "flex items-center gap-1.5 text-[--color-text]",
                    itemConfig?.labelClassName
                  )}
                  style={
                    {
                      "--color-text":
                        itemConfig?.labelColor ?? "hsl(var(--muted-foreground))",
                    } as React.CSSProperties
                  }
                >
                  {ItemIcon && (
                    <div
                      className="text-[--color-icon]"
                      style={
                        {
                          "--color-icon":
                            itemConfig?.iconColor ?? indicatorColor,
                        } as React.CSSProperties
                      }
                    >
                      <ItemIcon />
                    </div>
                  )}
                  <span className="text-[--color-text]">
                    {itemConfig?.label ?? item.name ?? item.dataKey ?? "Value"}
                  </span>
                </div>
                {itemConfig?.formatter ? (
                  itemConfig.formatter(
                    item.value,
                    item.name,
                    item,
                    i,
                    item.payload
                  )
                ) : (
                  <div
                    className={cn(
                      "font-mono font-medium tabular-nums text-[--color-value]",
                      itemConfig?.valueClassName
                    )}
                    style={
                      {
                        "--color-value":
                          itemConfig?.valueColor ?? "hsl(var(--foreground))",
                      } as React.CSSProperties
                    }
                  >
                    {formatter
                      ? (formatter as unknown as TooltipFormatter)(
                          item.value ?? "",
                          item.name,
                          item,
                          i,
                          item.payload
                        )
                      : String(item.value ?? "")}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      },
      [
        nameKey,
        getConfig,
        getColor,
        color,
        hideIndicator,
        indicator,
        formatter,
      ]
    )

    if (!active || !payload?.length) {
      return null
    }

    const payloadItems = payload as TooltipPayloadItem[]

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border bg-popover p-2.5 shadow-lg text-popover-foreground",
          className
        )}
      >
        {tooltipLabel}
        <div className="grid gap-1.5">
          {payloadItems.map((item, index) => nestLabel(item, index))}
        </div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltipContent"

// Helper function to create chart config with validation
export function createChartConfig(
  config: ChartConfig
): ChartConfig {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      {
        label: value.label,
        icon: value.icon,
        color: value.color,
        className: value.className,
        labelWrapperClassName: value.labelWrapperClassName,
        labelClassName: value.labelClassName,
        labelColor: value.labelColor,
        iconColor: value.iconColor,
        formatter: value.formatter,
        valueClassName: value.valueClassName,
        valueColor: value.valueColor,
      },
    ])
  )
}

// Helper function to get config value with fallback
export function getChartConfigValue<T>(
  config: ChartConfig,
  key: string,
  property: keyof ChartConfigItem,
  fallback: T
): T {
  return (config[key]?.[property] as T) ?? fallback
}

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend }


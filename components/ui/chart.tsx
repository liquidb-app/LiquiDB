"use client"

import * as React from "react"
import * as RechartsPrimitive from "recharts"

import { cn } from "@/lib/utils"

// Format: { [dataKey]: { label, icon, color, etc. } }
export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
    color?: string
    className?: string
    labelWrapperClassName?: string
    labelClassName?: string
    labelColor?: string
    iconColor?: string
    formatter?: (value: unknown, item: unknown, index: number, payload: unknown) => React.ReactNode
    valueClassName?: string
    valueColor?: string
  }
>

const ChartContext = React.createContext<{
  config: ChartConfig
}>({
  config: {},
})

const ChartContainer = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div"> & {
    config: ChartConfig
    children: React.ReactElement
  }
>(({ id, className, children, config, ...props }, ref) => {
  const uniqueId = React.useId()
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`

  return (
    <ChartContext.Provider value={{ config }}>
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
})
ChartContainer.displayName = "Chart"

const ChartTooltip = RechartsPrimitive.Tooltip

const ChartLegend = RechartsPrimitive.Legend

const ChartTooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
    React.ComponentProps<"div"> & {
      hideLabel?: boolean
      hideIndicator?: boolean
      indicator?: "line" | "dot" | "dashed"
      nameKey?: string
      labelKey?: string
    }
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
    const { config } = React.useContext(ChartContext)

    const tooltipLabel = React.useMemo(() => {
      if (hideLabel || !payload?.length) {
        return null
      }

      const [item] = payload
      const key = `${labelKey || item.dataKey || item.name || "value"}`
      const itemConfig = config[key as keyof typeof config]
      const value =
        itemConfig?.label || item.name || item.dataKey || "Value"
      const formattedLabel =
        typeof labelFormatter === "function"
          ? labelFormatter(label, payload)
          : label

      return (
        <div className={cn("font-medium", labelClassName)}>
          {formattedLabel || value}
        </div>
      )
    }, [
      label,
      labelFormatter,
      payload,
      hideLabel,
      labelClassName,
      labelKey,
      config,
    ])

    if (!active || !payload?.length) {
      return null
    }

    const nestLabel = (
      item: NonNullable<
        React.ComponentProps<typeof RechartsPrimitive.Tooltip>["payload"]
      >[number],
      i: number
    ) => {
      const key = `${nameKey || item.name || item.dataKey || "value"}`
      const itemConfig = config[key as keyof typeof config]
      const indicatorColor =
        color || item.payload?.fill || item.color || "hsl(var(--foreground))"

      return (
        <div
          key={item.dataKey || i}
          className={cn(
            "flex w-full flex-col gap-2",
            itemConfig?.className
          )}
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
                      itemConfig?.labelColor || "hsl(var(--muted-foreground))",
                  } as React.CSSProperties
                }
              >
                {itemConfig?.icon ? (
                  <div
                    className="text-[--color-icon]"
                    style={
                      {
                        "--color-icon":
                          itemConfig?.iconColor || indicatorColor,
                      } as React.CSSProperties
                    }
                  >
                    <itemConfig.icon />
                  </div>
                ) : null}
                <span className="text-[--color-text]">
                  {itemConfig?.label || item.name || item.dataKey}
                </span>
              </div>
              {itemConfig?.formatter ? (
                itemConfig.formatter(item.value, item, i, item.payload)
              ) : (
                <div
                  className={cn(
                    "font-mono font-medium tabular-nums text-[--color-value]",
                    itemConfig?.valueClassName
                  )}
                  style={
                    {
                      "--color-value":
                        itemConfig?.valueColor || "hsl(var(--foreground))",
                    } as React.CSSProperties
                  }
                >
                  {formatter
                    ? formatter(item.value ?? '', item.name ?? '', item, i, item.payload)
                    : String(item.value)}
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    return (
      <div
        ref={ref}
        className={cn(
          "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border bg-popover p-2.5 shadow-lg text-popover-foreground",
          className
        )}
      >
        {tooltipLabel}
        <div className="grid gap-1.5">{payload.map(nestLabel)}</div>
      </div>
    )
  }
)
ChartTooltipContent.displayName = "ChartTooltipContent"

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend }


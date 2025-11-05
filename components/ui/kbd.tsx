import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "bg-background/90 text-foreground pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm px-1 font-sans text-xs font-medium select-none border border-border shadow-sm",
        "hover:bg-background/95 transition-colors duration-200",
        "[&_svg:not([class*='size-'])]:size-3",
        "dark:bg-background/95 dark:text-foreground dark:border-border/60",
        "[[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background dark:[[data-slot=tooltip-content]_&]:bg-background/10",
        "[data-color-scheme='blue']:border-blue-300/60 [data-color-scheme='blue']:bg-blue-100/90 [data-color-scheme='blue']:text-blue-800",
        "dark:[data-color-scheme='blue']:border-blue-700/60 dark:[data-color-scheme='blue']:bg-blue-900/90 dark:[data-color-scheme='blue']:text-blue-200",
        "[data-color-scheme='green']:border-green-300/60 [data-color-scheme='green']:bg-green-100/90 [data-color-scheme='green']:text-green-800",
        "dark:[data-color-scheme='green']:border-green-700/60 dark:[data-color-scheme='green']:bg-green-900/90 dark:[data-color-scheme='green']:text-green-200",
        "[data-color-scheme='purple']:border-purple-300/60 [data-color-scheme='purple']:bg-purple-100/90 [data-color-scheme='purple']:text-purple-800",
        "dark:[data-color-scheme='purple']:border-purple-700/60 dark:[data-color-scheme='purple']:bg-purple-900/90 dark:[data-color-scheme='purple']:text-purple-200",
        "[data-color-scheme='orange']:border-orange-300/60 [data-color-scheme='orange']:bg-orange-100/90 [data-color-scheme='orange']:text-orange-800",
        "dark:[data-color-scheme='orange']:border-orange-700/60 dark:[data-color-scheme='orange']:bg-orange-900/90 dark:[data-color-scheme='orange']:text-orange-200",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }

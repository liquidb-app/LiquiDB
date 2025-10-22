"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

interface BentoGridItemProps {
  children: React.ReactNode;
  className?: string;
  size?: "1" | "2" | "3" | "4" | "5" | "6";
  header?: React.ReactNode;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
}

export const BentoGrid = ({ children, className }: BentoGridProps) => {
  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto",
        className
      )}
    >
      {children}
    </div>
  );
};

export const BentoGridItem = ({
  children,
  className,
  size = "1",
  header,
  title,
  description,
  icon,
}: BentoGridItemProps) => {
  const sizeClasses = {
    "1": "col-span-1 row-span-1",
    "2": "col-span-1 md:col-span-2 row-span-1",
    "3": "col-span-1 md:col-span-2 lg:col-span-3 row-span-1",
    "4": "col-span-1 row-span-1 md:row-span-2",
    "5": "col-span-1 md:col-span-2 row-span-1 md:row-span-2",
    "6": "col-span-1 md:col-span-2 lg:col-span-3 row-span-1 md:row-span-2",
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 transition-all duration-300 hover:shadow-lg",
        sizeClasses[size],
        className
      )}
    >
      {header}
      {icon && (
        <div className="absolute top-4 right-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
          {icon}
        </div>
      )}
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {title}
        </h3>
      )}
      {description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {description}
        </p>
      )}
      {children}
    </div>
  );
};


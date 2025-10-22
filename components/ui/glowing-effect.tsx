"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface GlowingEffectProps {
  children: React.ReactNode;
  className?: string;
  blur?: number;
  inactiveZone?: number;
  proximity?: number;
  spread?: number;
  variant?: "default" | "white";
  glow?: boolean;
  disabled?: boolean;
  movementDuration?: number;
  borderWidth?: number;
}

export const GlowingEffect = ({
  children,
  className,
  blur = 0,
  inactiveZone = 0.7,
  proximity = 0,
  spread = 20,
  variant = "default",
  glow = false,
  disabled = true,
  movementDuration = 2,
  borderWidth = 1,
}: GlowingEffectProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePosition({ x, y });
    };

    const container = containerRef.current;
    if (container && !disabled) {
      container.addEventListener("mousemove", handleMouseMove);
      return () => container.removeEventListener("mousemove", handleMouseMove);
    }
  }, [disabled]);

  const getGradientColors = () => {
    if (variant === "white") {
      return "radial-gradient(circle, rgba(255,255,255,0.8) 0%, rgba(255,255,255,0.4) 50%, rgba(255,255,255,0) 100%)";
    }
    return "radial-gradient(circle, rgba(59,130,246,0.8) 0%, rgba(147,51,234,0.6) 50%, rgba(236,72,153,0.4) 100%)";
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {(!disabled || glow) && (
        <div
          className="absolute inset-0 pointer-events-none rounded-lg"
          style={{
            background: getGradientColors(),
            filter: `blur(${blur}px)`,
            opacity: isHovered || glow ? 1 : 0,
            transform: `translate(${mousePosition.x - 50}px, ${mousePosition.y - 50}px)`,
            transition: `opacity 0.3s ease, transform ${movementDuration}s ease`,
            width: "100px",
            height: "100px",
            left: "-50px",
            top: "-50px",
            borderRadius: "50%",
            zIndex: -1,
          }}
        />
      )}
    </div>
  );
};


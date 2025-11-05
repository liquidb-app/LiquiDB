'use client';

import { motion, useAnimation, useMotionValue, useTransform, animate, type Variants } from 'framer-motion';
import type { HTMLAttributes } from 'react';
import { forwardRef, useCallback, useImperativeHandle, useRef, useEffect, useId } from 'react';
import { cn } from '@/lib/utils';

export interface SparklesIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

interface SparklesIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number;
}

const sparkleVariants: Variants = {
  normal: {
    opacity: 0.8,
    scale: 1,
    transition: {
      duration: 0.3,
    },
  },
  animate: {
    opacity: [0.6, 1, 0.6],
    scale: [1, 1.15, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

const pathVariants: Variants = {
  normal: {
    opacity: 1,
    pathLength: 1,
    transition: {
      duration: 0.3,
    },
  },
  animate: {
    opacity: [0.8, 1, 0.8],
    pathLength: 1,
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

const SparklesIcon = forwardRef<SparklesIconHandle, SparklesIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 16, ...props }, ref) => {
    const controls = useAnimation();
    const isControlledRef = useRef(false);
    const gradientId = useId();
    const rotation = useMotionValue(0);
    const gradientTransform = useTransform(rotation, (r) => `rotate(${r} 0.5 0.5)`);

    useEffect(() => {
      controls.start('animate');
      const animation = animate(rotation, 360, {
        duration: 3,
        repeat: Infinity,
        ease: 'linear',
      });
      return () => animation.stop();
    }, [controls, rotation]);

    useImperativeHandle(ref, () => {
      isControlledRef.current = true;

      return {
        startAnimation: () => {
          controls.start('animate');
          animate(rotation, 360, {
            duration: 3,
            repeat: Infinity,
            ease: 'linear',
          });
        },
        stopAnimation: () => {
          controls.start('normal');
          rotation.set(0);
        },
      };
    });

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) {
          controls.start('animate');
          animate(rotation, 360, {
            duration: 3,
            repeat: Infinity,
            ease: 'linear',
          });
        } else {
          onMouseEnter?.(e);
        }
      },
      [controls, rotation, onMouseEnter]
    );

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current) {
          controls.start('normal');
        } else {
          onMouseLeave?.(e);
        }
      },
      [controls, onMouseLeave]
    );

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <motion.div
          variants={sparkleVariants}
          initial="animate"
          animate={controls}
          className="relative"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <defs>
              <motion.linearGradient
                id={gradientId}
                gradientUnits="objectBoundingBox"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
                gradientTransform={gradientTransform}
              >
                <stop offset="0%" stopColor="var(--primary)" />
                <stop offset="50%" stopColor="var(--ring)" />
                <stop offset="100%" stopColor="var(--primary)" />
              </motion.linearGradient>
            </defs>
            <motion.path
              d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"
              variants={pathVariants}
              animate={controls}
            />
            <motion.path
              d="M5 3v4M19 17v4M3 5h4M17 19h4"
              variants={pathVariants}
              animate={controls}
            />
          </svg>
        </motion.div>
      </div>
    );
  }
);

SparklesIcon.displayName = 'SparklesIcon';

export { SparklesIcon };


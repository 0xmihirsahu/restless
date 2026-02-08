"use client";

import { motion } from "framer-motion";

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-shimmer ${className}`} />
  );
}

export function DealCardSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="border border-border p-5 space-y-3"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="w-8 h-4" />
          <SkeletonBlock className="w-16 h-4" />
        </div>
        <SkeletonBlock className="w-24 h-5" />
      </div>
      <div className="flex items-center gap-4">
        <SkeletonBlock className="w-40 h-3" />
        <SkeletonBlock className="w-32 h-3" />
      </div>
    </motion.div>
  );
}

export function DealListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
        >
          <DealCardSkeleton />
        </motion.div>
      ))}
    </div>
  );
}

export function DealDetailSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <SkeletonBlock className="w-32 h-7" />
        <SkeletonBlock className="w-16 h-5" />
      </div>

      {/* Yield ticker */}
      <div className="border border-border p-6 space-y-3">
        <SkeletonBlock className="w-24 h-3" />
        <SkeletonBlock className="w-48 h-8" />
        <SkeletonBlock className="w-40 h-3" />
      </div>

      {/* Details */}
      <div className="border border-border p-5 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <SkeletonBlock className="w-24 h-4" />
            <SkeletonBlock className="w-32 h-4" />
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="border border-border p-5 space-y-3">
        <SkeletonBlock className="w-16 h-3" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <SkeletonBlock className="w-20 h-4" />
            <SkeletonBlock className="w-36 h-3" />
          </div>
        ))}
      </div>
    </motion.div>
  );
}

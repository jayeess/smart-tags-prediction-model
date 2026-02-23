import { motion } from "framer-motion";

function Shimmer({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white/[0.03] ${className || ""}`}>
      <motion.div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.04] to-transparent"
        animate={{ translateX: ["- 100%", "100%"] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

export default function PageSkeleton() {
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header skeleton */}
      <div className="mb-6">
        <Shimmer className="h-8 w-48 mb-2" />
        <Shimmer className="h-4 w-72" />
      </div>

      {/* Grid skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <Shimmer className="md:col-span-3 h-20" />
        <Shimmer className="md:col-span-3 h-20" />
        <Shimmer className="md:col-span-3 h-20" />
        <Shimmer className="md:col-span-3 h-20" />
        <Shimmer className="md:col-span-5 h-72" />
        <Shimmer className="md:col-span-7 h-72" />
        <Shimmer className="md:col-span-12 h-48" />
      </div>
    </div>
  );
}

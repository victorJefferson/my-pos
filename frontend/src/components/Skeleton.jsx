export default function Skeleton({ className = '' }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-white/10 rounded-md ${className}`}
    />
  )
}

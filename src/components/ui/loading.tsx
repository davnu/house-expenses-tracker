import { CasaTabLogo } from '@/components/brand/CasaTabLogo'

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center animate-pulse">
        <CasaTabLogo size={28} className="text-primary-foreground" />
      </div>
    </div>
  )
}

export function LoadingInline() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
        <CasaTabLogo size={20} className="text-primary" />
      </div>
    </div>
  )
}

/** Skeleton block — a single pulsing placeholder rectangle */
function Bone({ className }: { className?: string }) {
  return <div className={`bg-muted animate-pulse rounded-lg ${className ?? ''}`} />
}

/** App-level skeleton — renders inside AppShell while contexts load.
 *  Mimics the dashboard layout so the transition to real content feels seamless. */
export function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Bone className="h-7 w-36" />
        <div className="flex gap-2">
          <Bone className="h-8 w-24 rounded-md" />
          <Bone className="h-8 w-20 rounded-md" />
        </div>
      </div>

      {/* Hero card */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <Bone className="h-4 w-28" />
        <Bone className="h-9 w-48" />
        <div className="flex gap-6">
          <Bone className="h-4 w-24" />
          <Bone className="h-4 w-24" />
        </div>
      </div>

      {/* Two-column cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <Bone className="h-4 w-32" />
          <Bone className="h-40 w-full" />
        </div>
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <Bone className="h-4 w-28" />
          <Bone className="h-40 w-full" />
        </div>
      </div>

      {/* List rows */}
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <Bone className="h-4 w-36" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className="h-8 w-8 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-3.5 w-3/5" />
              <Bone className="h-3 w-2/5" />
            </div>
            <Bone className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Documents page skeleton — folder grid matching the 7 default folders layout */
export function DocumentsSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Bone className="h-7 w-32" />
        <Bone className="h-8 w-24 rounded-md" />
      </div>

      {/* Storage bar */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <Bone className="h-3 w-20" />
          <Bone className="h-3 w-28" />
        </div>
        <Bone className="h-1.5 w-full rounded-full" />
      </div>

      {/* Folder grid */}
      <div>
        <Bone className="h-4 w-16 mb-2" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 flex flex-col items-center gap-2.5">
              <Bone className="h-12 w-12 rounded-2xl" />
              <div className="w-full space-y-1.5">
                <Bone className="h-3.5 w-3/4 mx-auto" />
                <Bone className="h-2.5 w-1/2 mx-auto" />
                <Bone className="h-3 w-12 mx-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

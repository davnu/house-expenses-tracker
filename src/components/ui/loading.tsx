import { Home } from 'lucide-react'

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="relative">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
          <Home className="h-6 w-6 text-primary" />
        </div>
      </div>
      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
    </div>
  )
}

export function LoadingInline() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center animate-pulse">
        <Home className="h-4 w-4 text-primary" />
      </div>
    </div>
  )
}

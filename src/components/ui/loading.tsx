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

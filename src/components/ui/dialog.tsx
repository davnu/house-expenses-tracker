import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Drawer as DrawerPrimitive } from 'vaul'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'

interface DialogContextValue {
  isMobile: boolean
}

const DialogContext = React.createContext<DialogContextValue>({ isMobile: false })

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const isMobile = useIsMobile()

  return (
    <DialogContext.Provider value={{ isMobile }}>
      {isMobile ? (
        <DrawerPrimitive.Root {...props} />
      ) : (
        <DialogPrimitive.Root {...props} />
      )}
    </DialogContext.Provider>
  )
}

const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-[fade-in_0.2s_ease-out] data-[state=closed]:animate-[fade-out_0.15s_ease-in]',
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = 'DialogOverlay'

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => {
  const { isMobile } = React.useContext(DialogContext)

  if (isMobile) {
    return (
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DrawerPrimitive.Content
          ref={ref}
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[96dvh] flex-col rounded-t-2xl border-t bg-background shadow-lg',
            className
          )}
          {...props}
        >
          <DrawerPrimitive.Handle className="mt-2 mb-1" />
          <div
            className="flex-1 overflow-y-auto px-6 pt-2 pb-6"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {children}
          </div>
          <DrawerPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DrawerPrimitive.Close>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    )
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-lg border bg-background p-6 shadow-lg max-h-[calc(100vh-2rem)] overflow-y-auto data-[state=open]:animate-[fade-in_0.2s_ease-out] data-[state=closed]:animate-[fade-out_0.15s_ease-in]',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContent.displayName = 'DialogContent'

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left mb-4', className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) {
  const { isMobile } = React.useContext(DialogContext)
  const Component = isMobile ? DrawerPrimitive.Title : DialogPrimitive.Title
  return <Component className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
}

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogClose }

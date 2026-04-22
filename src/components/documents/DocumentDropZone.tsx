import { useState, useRef, useCallback, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCEPTED_FILE_TYPES } from '@/lib/constants'
import { rejectionMessage } from '@/lib/attachment-validation'
import { useStorageQuota } from '@/hooks/use-storage-quota'
import { QuotaError } from './QuotaError'

const ACCEPT_STRING = ACCEPTED_FILE_TYPES.join(',')

interface DocumentDropZoneProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
}

export function DocumentDropZone({ onFilesSelected, disabled }: DocumentDropZoneProps) {
  const { t } = useTranslation()
  // Single source of truth for cross-feature household quota. No more prop
  // drilling `totalStorageUsed` from every caller.
  const quota = useStorageQuota()
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<{ message: string; isQuota: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const atStorageLimit = quota.bytesRemaining <= 0

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      setError(null)
      // Documents flow: no per-folder count cap, no dedupe (revisions are
      // intentionally allowed — see validateDocumentFiles).
      const { accepted, rejection } = quota.validate(Array.from(fileList), {
        dedupe: false,
      })
      if (rejection) {
        setError({
          message: rejectionMessage(t, rejection),
          isQuota: rejection.code === 'householdStorageLimit',
        })
      }
      if (accepted.length > 0) onFilesSelected(accepted)
    },
    [onFilesSelected, quota, t]
  )

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files)
    }
  }

  // isLoading blocks uploads during the entitlement cold-start so Pro users
  // don't get free-tier caps applied in the first few hundred ms after mount.
  const isDisabled = disabled || atStorageLimit || quota.isLoading

  // Standing QuotaError for BOTH tiers when at cap — free users get the
  // upgrade CTA, Pro users get a "Manage files" deep-link. Either way, a
  // greyed-out dropzone is strictly worse than a purposeful empty state.
  const showStandingQuota = atStorageLimit && !quota.isLoading

  return (
    <div className="space-y-1">
      {showStandingQuota ? (
        <QuotaError isPro={quota.isPro} variant="standing" />
      ) : (
        <div
          onDragOver={isDisabled ? undefined : handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={isDisabled ? undefined : handleDrop}
          onClick={isDisabled ? undefined : () => inputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
            isDisabled
              ? 'border-muted bg-muted/30 cursor-not-allowed opacity-60'
              : isDragging
                ? 'border-primary bg-primary/5 cursor-pointer'
                : 'border-input hover:border-primary/50 hover:bg-accent/50 cursor-pointer'
          )}
        >
          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {quota.isLoading
              ? t('files.preparing')
              : atStorageLimit
                ? t('files.storageLimitReached')
                : t('files.dropOrBrowsePlain')
            }
          </p>
          <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground/70 mt-1.5">
            <ShieldCheck className="h-3 w-3" />
            {t('files.securityNote')}
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_STRING}
            className="hidden"
            disabled={isDisabled}
            onChange={(e) => {
              if (e.target.files) processFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}
      {error && (
        error.isQuota
          ? <QuotaError isPro={quota.isPro} variant="inline" />
          : <p className="text-xs text-destructive">{error.message}</p>
      )}
    </div>
  )
}

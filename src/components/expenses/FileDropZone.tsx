import { useState, useRef, useCallback, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn, formatFileSize } from '@/lib/utils'
import { getFileTypeInfo } from '@/lib/file-type-info'
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILES_PER_EXPENSE,
} from '@/lib/constants'
import { rejectionMessage } from '@/lib/attachment-validation'
import { useStorageQuota } from '@/hooks/use-storage-quota'
import { QuotaError } from '@/components/documents/QuotaError'

const ACCEPT_STRING = ACCEPTED_FILE_TYPES.join(',')

interface FileDropZoneProps {
  files: File[]
  onChange: (files: File[]) => void
  existingCount?: number
}

export function FileDropZone({ files, onChange, existingCount = 0 }: FileDropZoneProps) {
  const { t } = useTranslation()
  // useStorageQuota sees the cross-feature total (expenses + documents), so a
  // user who has filled 50/50 from document uploads can't sneak more via the
  // expense form. Prior to this, the expense dropzone only knew about expense
  // bytes — reported "19.5 MB / 50 MB used" while Documents was at the cap.
  const quota = useStorageQuota()
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<{ message: string; isQuota: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const totalCount = existingCount + files.length
  const remainingSlots = MAX_FILES_PER_EXPENSE - totalCount
  const newFilesSize = files.reduce((sum, f) => sum + f.size, 0)
  const storageAfterNew = quota.bytesUsed + newFilesSize
  const storageRemaining = quota.maxBytes - storageAfterNew

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      setError(null)
      // Expense-flow wrapper applies MAX_FILES_PER_EXPENSE automatically +
      // fills in household quota from the cross-feature hook.
      const { accepted, rejection } = quota.validateExpenseAttachment(Array.from(newFiles), {
        stagedFiles: files,
        existingCount,
      })
      if (rejection) {
        setError({
          message: rejectionMessage(t, rejection),
          isQuota: rejection.code === 'householdStorageLimit',
        })
      }
      if (accepted.length > 0) onChange([...files, ...accepted])
    },
    [files, onChange, existingCount, quota, t]
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
      addFiles(e.dataTransfer.files)
    }
  }

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index))
  }

  const atFileLimit = remainingSlots <= 0
  const atStorageLimit = storageRemaining <= 0
  const disabled = atFileLimit || atStorageLimit || quota.isLoading
  // Show the big-CTA standing QuotaError when the household is out of space
  // AND the user hasn't already staged files in this form (once they have
  // files, we keep the dropzone visible so they can see + remove them).
  // atFileLimit stays in the plain dropzone path since it's a per-expense
  // cap — the upgrade CTA isn't relevant to it.
  const showStandingQuota = atStorageLimit && files.length === 0 && !quota.isLoading

  return (
    <div className="space-y-2">
      {showStandingQuota ? (
        <QuotaError isPro={quota.isPro} variant="standing" />
      ) : (
        <div
          onDragOver={disabled ? undefined : handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={disabled ? undefined : handleDrop}
          onClick={disabled ? undefined : () => inputRef.current?.click()}
          className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center transition-colors',
            disabled
              ? 'border-muted bg-muted/30 cursor-not-allowed opacity-60'
              : isDragging
                ? 'border-primary bg-primary/5 cursor-pointer'
                : 'border-input hover:border-primary/50 hover:bg-accent/50 cursor-pointer'
          )}
        >
          <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {quota.isLoading
              ? t('files.preparing')
              : disabled
                ? atFileLimit ? t('files.fileLimitReached') : t('files.storageLimitReached')
                : <>{t('files.dropOrBrowsePlain').split('browse')[0]}<span className="text-primary font-medium">browse</span>{t('files.dropOrBrowsePlain').split('browse')[1]}</>
            }
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('files.fileInfo', { count: totalCount, max: MAX_FILES_PER_EXPENSE })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('files.storageUsed', { used: formatFileSize(storageAfterNew), total: formatFileSize(quota.maxBytes) })}
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
            disabled={disabled}
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files)
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

      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((file, i) => {
            const typeInfo = getFileTypeInfo(file.type)
            const Icon = typeInfo.icon
            return (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2.5 text-sm p-2 rounded-lg bg-muted"
              >
                <div className={cn('h-7 w-7 rounded-md flex items-center justify-center shrink-0', typeInfo.bgColor)}>
                  <Icon className={cn('h-3.5 w-3.5', typeInfo.iconColor)} />
                </div>
                <span className="truncate flex-1">{file.name}</span>
                <span className={cn(
                  'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide shrink-0 leading-none',
                  typeInfo.bgColor, typeInfo.iconColor
                )}>
                  {typeInfo.label}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatFileSize(file.size)}
                </span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeFile(i)
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
import { validateExpenseAttachments, rejectionMessage } from '@/lib/attachment-validation'
import { useEntitlement } from '@/hooks/use-entitlement'

const ACCEPT_STRING = ACCEPTED_FILE_TYPES.join(',')

interface FileDropZoneProps {
  files: File[]
  onChange: (files: File[]) => void
  existingCount?: number
  householdStorageUsed?: number
}

export function FileDropZone({ files, onChange, existingCount = 0, householdStorageUsed = 0 }: FileDropZoneProps) {
  const { t } = useTranslation()
  const { limits } = useEntitlement()
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const maxHouseholdBytes = limits.maxStorageMB * 1024 * 1024
  const totalCount = existingCount + files.length
  const remainingSlots = MAX_FILES_PER_EXPENSE - totalCount
  const newFilesSize = files.reduce((sum, f) => sum + f.size, 0)
  const storageAfterNew = householdStorageUsed + newFilesSize
  const storageRemaining = maxHouseholdBytes - storageAfterNew

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      setError('')
      const { accepted, rejection } = validateExpenseAttachments(Array.from(newFiles), {
        stagedFiles: files,
        existingCount,
        householdStorageUsed,
        maxHouseholdBytes,
      })
      if (rejection) setError(rejectionMessage(t, rejection))
      if (accepted.length > 0) onChange([...files, ...accepted])
    },
    [files, onChange, existingCount, householdStorageUsed, maxHouseholdBytes, t]
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
  const disabled = atFileLimit || atStorageLimit

  return (
    <div className="space-y-2">
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
          {disabled
            ? atFileLimit ? t('files.fileLimitReached') : t('files.storageLimitReached')
            : <>{t('files.dropOrBrowsePlain').split('browse')[0]}<span className="text-primary font-medium">browse</span>{t('files.dropOrBrowsePlain').split('browse')[1]}</>
          }
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('files.fileInfo', { count: totalCount, max: MAX_FILES_PER_EXPENSE })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('files.storageUsed', { used: formatFileSize(storageAfterNew), total: formatFileSize(maxHouseholdBytes) })}
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

      {error && <p className="text-xs text-destructive">{error}</p>}

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

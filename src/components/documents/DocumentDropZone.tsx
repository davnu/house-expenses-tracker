import { useState, useRef, useCallback, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE, MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'

const ACCEPT_STRING = ACCEPTED_FILE_TYPES.join(',')

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface DocumentDropZoneProps {
  onFilesSelected: (files: File[]) => void
  totalStorageUsed: number
  disabled?: boolean
}

export function DocumentDropZone({ onFilesSelected, totalStorageUsed, disabled }: DocumentDropZoneProps) {
  const { t } = useTranslation()
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const storageRemaining = MAX_HOUSEHOLD_STORAGE - totalStorageUsed
  const atStorageLimit = storageRemaining <= 0

  const processFiles = useCallback(
    (fileList: FileList | File[]) => {
      setError('')
      const valid: File[] = []
      let pendingSize = 0

      for (const file of Array.from(fileList)) {
        if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
          setError(t('files.unsupportedType', { name: file.name }))
          continue
        }
        if (file.size > MAX_FILE_SIZE) {
          setError(t('files.exceedsLimit', { name: file.name }))
          continue
        }
        if (totalStorageUsed + pendingSize + file.size > MAX_HOUSEHOLD_STORAGE) {
          setError(t('files.householdStorageLimit', { size: formatSize(MAX_HOUSEHOLD_STORAGE) }))
          break
        }
        valid.push(file)
        pendingSize += file.size
      }

      if (valid.length > 0) {
        onFilesSelected(valid)
      }
    },
    [onFilesSelected, totalStorageUsed, t]
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

  const isDisabled = disabled || atStorageLimit

  return (
    <div className="space-y-1">
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
          {isDisabled
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

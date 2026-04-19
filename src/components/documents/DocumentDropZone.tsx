import { useState, useRef, useCallback, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ACCEPTED_FILE_TYPES, MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'
import { validateDocumentFiles, rejectionMessage } from '@/lib/attachment-validation'

const ACCEPT_STRING = ACCEPTED_FILE_TYPES.join(',')

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
      const { accepted, rejection } = validateDocumentFiles(Array.from(fileList), {
        householdStorageUsed: totalStorageUsed,
      })
      if (rejection) setError(rejectionMessage(t, rejection))
      if (accepted.length > 0) onFilesSelected(accepted)
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

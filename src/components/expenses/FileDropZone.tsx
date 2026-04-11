import { useState, useRef, useCallback, type DragEvent } from 'react'
import { Upload, X, FileText, Image, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES_PER_EXPENSE,
  MAX_HOUSEHOLD_STORAGE,
} from '@/lib/constants'

const ACCEPT_STRING = ACCEPTED_FILE_TYPES.join(',')

function fileIcon(type: string) {
  if (type.startsWith('image/')) return Image
  if (type.includes('spreadsheet') || type.includes('excel')) return FileSpreadsheet
  return FileText
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface FileDropZoneProps {
  files: File[]
  onChange: (files: File[]) => void
  existingCount?: number
  householdStorageUsed?: number
}

export function FileDropZone({ files, onChange, existingCount = 0, householdStorageUsed = 0 }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const totalCount = existingCount + files.length
  const remainingSlots = MAX_FILES_PER_EXPENSE - totalCount
  const newFilesSize = files.reduce((sum, f) => sum + f.size, 0)
  const storageAfterNew = householdStorageUsed + newFilesSize
  const storageRemaining = MAX_HOUSEHOLD_STORAGE - storageAfterNew

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      setError('')
      const valid: File[] = []
      for (const file of Array.from(newFiles)) {
        // File type check
        if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
          setError(`"${file.name}" is not a supported file type`)
          continue
        }
        // Per-file size check
        if (file.size > MAX_FILE_SIZE) {
          setError(`"${file.name}" exceeds 10 MB limit`)
          continue
        }
        // Duplicate check
        if (files.some((f) => f.name === file.name && f.size === file.size)) continue
        // Per-expense file count
        if (totalCount + valid.length >= MAX_FILES_PER_EXPENSE) {
          setError(`Maximum ${MAX_FILES_PER_EXPENSE} files per expense`)
          break
        }
        // Household storage quota
        const pendingSize = valid.reduce((s, f) => s + f.size, 0)
        if (storageAfterNew + pendingSize + file.size > MAX_HOUSEHOLD_STORAGE) {
          setError(`Household storage limit reached (${formatSize(MAX_HOUSEHOLD_STORAGE)})`)
          break
        }
        valid.push(file)
      }
      if (valid.length > 0) onChange([...files, ...valid])
    },
    [files, onChange, totalCount, storageAfterNew]
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
            ? atFileLimit ? 'File limit reached' : 'Storage limit reached'
            : <>Drop files here or <span className="text-primary font-medium">browse</span></>
          }
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Images, PDF, Word, Excel &middot; Max 10 MB each &middot; {totalCount}/{MAX_FILES_PER_EXPENSE} files
        </p>
        <p className="text-xs text-muted-foreground">
          {formatSize(storageAfterNew)} / {formatSize(MAX_HOUSEHOLD_STORAGE)} used
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
            const Icon = fileIcon(file.type)
            return (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 text-sm p-2 rounded-md bg-muted"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatSize(file.size)}
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

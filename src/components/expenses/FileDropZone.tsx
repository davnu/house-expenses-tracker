import { useState, useRef, useCallback, type DragEvent } from 'react'
import { Upload, X, FileText, Image, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

const ACCEPT_STRING = ACCEPTED_TYPES.join(',')

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

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
}

export function FileDropZone({ files, onChange }: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      setError('')
      const valid: File[] = []
      for (const file of Array.from(newFiles)) {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          setError(`"${file.name}" is not a supported file type`)
          continue
        }
        if (file.size > MAX_FILE_SIZE) {
          setError(`"${file.name}" exceeds 10MB limit`)
          continue
        }
        if (files.some((f) => f.name === file.name && f.size === file.size)) continue
        valid.push(file)
      }
      if (valid.length > 0) onChange([...files, ...valid])
    },
    [files, onChange]
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

  return (
    <div className="space-y-2">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-input hover:border-primary/50 hover:bg-accent/50'
        )}
      >
        <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drop files here or <span className="text-primary font-medium">browse</span>
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Images, PDF, Word, Excel &middot; Max 10MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_STRING}
          className="hidden"
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

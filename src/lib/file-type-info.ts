import { FileText, Image, FileSpreadsheet, FileType } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface FileTypeInfo {
  icon: LucideIcon
  /** Tailwind text color class for the icon */
  iconColor: string
  /** Tailwind bg color class for the icon container */
  bgColor: string
  /** Short label like "PDF", "Word", "PNG" */
  label: string
  /** Lowercase extension like "pdf", "docx", "png" */
  extension: string
}

const MIME_MAP: Record<string, Pick<FileTypeInfo, 'icon' | 'iconColor' | 'bgColor' | 'label' | 'extension'>> = {
  // PDF
  'application/pdf': {
    icon: FileText,
    iconColor: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950/40',
    label: 'PDF',
    extension: 'pdf',
  },
  // Word
  'application/msword': {
    icon: FileType,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    label: 'DOC',
    extension: 'doc',
  },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    icon: FileType,
    iconColor: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    label: 'DOCX',
    extension: 'docx',
  },
  // Excel
  'application/vnd.ms-excel': {
    icon: FileSpreadsheet,
    iconColor: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    label: 'XLS',
    extension: 'xls',
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    icon: FileSpreadsheet,
    iconColor: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    label: 'XLSX',
    extension: 'xlsx',
  },
  // Images
  'image/png': {
    icon: Image,
    iconColor: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-950/40',
    label: 'PNG',
    extension: 'png',
  },
  'image/jpeg': {
    icon: Image,
    iconColor: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-950/40',
    label: 'JPG',
    extension: 'jpg',
  },
  'image/webp': {
    icon: Image,
    iconColor: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-950/40',
    label: 'WEBP',
    extension: 'webp',
  },
  'image/gif': {
    icon: Image,
    iconColor: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-950/40',
    label: 'GIF',
    extension: 'gif',
  },
  'image/heic': {
    icon: Image,
    iconColor: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-950/40',
    label: 'HEIC',
    extension: 'heic',
  },
  'image/heif': {
    icon: Image,
    iconColor: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-950/40',
    label: 'HEIF',
    extension: 'heif',
  },
}

const FALLBACK: FileTypeInfo = {
  icon: FileText,
  iconColor: 'text-slate-500',
  bgColor: 'bg-slate-100 dark:bg-slate-800/40',
  label: '',
  extension: '',
}

/**
 * Returns color-coded icon info for a MIME type.
 * Used across DocumentCard, FileDropZone, and expense attachment displays
 * to give each file type a distinct, recognizable visual identity.
 */
export function getFileTypeInfo(mimeType: string): FileTypeInfo {
  // Direct match
  const direct = MIME_MAP[mimeType]
  if (direct) return direct

  // Fallback for unknown image subtypes
  if (mimeType.startsWith('image/')) {
    const ext = mimeType.split('/')[1] ?? ''
    return {
      icon: Image,
      iconColor: 'text-violet-600',
      bgColor: 'bg-violet-50 dark:bg-violet-950/40',
      label: ext.toUpperCase().slice(0, 4),
      extension: ext,
    }
  }

  // Fallback for unknown spreadsheet subtypes
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return {
      icon: FileSpreadsheet,
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
      label: 'XLS',
      extension: 'xls',
    }
  }

  return FALLBACK
}

/** Quick check: is this MIME type an image? */
export function isImageType(type: string): boolean {
  return type.startsWith('image/')
}

// ── Folder icon color mapping ──────────────────────────────────────
// Maps folder emojis to soft background colors so the grid is scannable
// at a glance. Each emoji gets a unique, muted hue that works in both
// light and dark mode.

const FOLDER_ICON_BG: Record<string, string> = {
  '📋': 'bg-amber-100 dark:bg-amber-900/40',
  '🏦': 'bg-blue-100 dark:bg-blue-900/40',
  '🛡️': 'bg-emerald-100 dark:bg-emerald-900/40',
  '🔍': 'bg-violet-100 dark:bg-violet-900/40',
  '🔨': 'bg-orange-100 dark:bg-orange-900/40',
  '📁': 'bg-slate-100 dark:bg-slate-800/50',
  '📦': 'bg-yellow-100 dark:bg-yellow-900/40',
  '🏠': 'bg-sky-100 dark:bg-sky-900/40',
  '💰': 'bg-lime-100 dark:bg-lime-900/40',
  '📄': 'bg-gray-100 dark:bg-gray-800/50',
  '🔑': 'bg-rose-100 dark:bg-rose-900/40',
  '⚡': 'bg-yellow-100 dark:bg-yellow-900/40',
}

const FOLDER_ICON_BG_FALLBACK = 'bg-slate-100 dark:bg-slate-800/50'

/** Returns a Tailwind bg class for a folder's emoji icon container. */
export function getFolderIconBg(icon: string): string {
  return FOLDER_ICON_BG[icon] ?? FOLDER_ICON_BG_FALLBACK
}

/** Extension badge color classes for inline use (e.g. attachment pills) */
export function getExtensionBadgeClasses(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400'
  if (mimeType.includes('word') || mimeType === 'application/msword') return 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
  if (mimeType.startsWith('image/')) return 'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-400'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400'
}

import { describe, it, expect } from 'vitest'
import { FileText, Image, FileSpreadsheet, FileType } from 'lucide-react'
import {
  getFileTypeInfo,
  isImageType,
  getFolderIconBg,
  getExtensionBadgeClasses,
} from './file-type-info'

// ── getFileTypeInfo ────────────────────────────────────────────────

describe('getFileTypeInfo', () => {
  describe('direct MIME matches', () => {
    it('returns red FileText for PDF', () => {
      const info = getFileTypeInfo('application/pdf')
      expect(info.icon).toBe(FileText)
      expect(info.label).toBe('PDF')
      expect(info.extension).toBe('pdf')
      expect(info.iconColor).toContain('red')
      expect(info.bgColor).toContain('red')
    })

    it('returns blue FileType for DOC', () => {
      const info = getFileTypeInfo('application/msword')
      expect(info.icon).toBe(FileType)
      expect(info.label).toBe('DOC')
      expect(info.extension).toBe('doc')
      expect(info.iconColor).toContain('blue')
    })

    it('returns blue FileType for DOCX', () => {
      const info = getFileTypeInfo('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      expect(info.label).toBe('DOCX')
      expect(info.extension).toBe('docx')
      expect(info.iconColor).toContain('blue')
    })

    it('returns emerald FileSpreadsheet for XLS', () => {
      const info = getFileTypeInfo('application/vnd.ms-excel')
      expect(info.icon).toBe(FileSpreadsheet)
      expect(info.label).toBe('XLS')
      expect(info.extension).toBe('xls')
      expect(info.iconColor).toContain('emerald')
    })

    it('returns emerald FileSpreadsheet for XLSX', () => {
      const info = getFileTypeInfo('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      expect(info.label).toBe('XLSX')
      expect(info.extension).toBe('xlsx')
    })

    it.each([
      ['image/png', 'PNG', 'png'],
      ['image/jpeg', 'JPG', 'jpg'],
      ['image/webp', 'WEBP', 'webp'],
      ['image/gif', 'GIF', 'gif'],
      ['image/heic', 'HEIC', 'heic'],
      ['image/heif', 'HEIF', 'heif'],
    ])('returns violet Image icon for %s', (mime, label, ext) => {
      const info = getFileTypeInfo(mime)
      expect(info.icon).toBe(Image)
      expect(info.label).toBe(label)
      expect(info.extension).toBe(ext)
      expect(info.iconColor).toContain('violet')
      expect(info.bgColor).toContain('violet')
    })
  })

  describe('fallbacks', () => {
    it('handles unknown image subtypes with dynamic label', () => {
      const info = getFileTypeInfo('image/bmp')
      expect(info.icon).toBe(Image)
      expect(info.label).toBe('BMP')
      expect(info.extension).toBe('bmp')
      expect(info.iconColor).toContain('violet')
    })

    it('truncates long image subtype labels to 4 chars', () => {
      const info = getFileTypeInfo('image/x-portable-anymap')
      expect(info.label).toBe('X-PO')
    })

    it('handles unknown spreadsheet MIME types', () => {
      const info = getFileTypeInfo('application/vnd.oasis.opendocument.spreadsheet')
      expect(info.icon).toBe(FileSpreadsheet)
      expect(info.label).toBe('XLS')
      expect(info.iconColor).toContain('emerald')
    })

    it('handles MIME types containing "excel"', () => {
      const info = getFileTypeInfo('application/x-excel')
      expect(info.icon).toBe(FileSpreadsheet)
    })

    it('returns slate fallback for completely unknown MIME types', () => {
      const info = getFileTypeInfo('application/octet-stream')
      expect(info.icon).toBe(FileText)
      expect(info.label).toBe('')
      expect(info.extension).toBe('')
      expect(info.iconColor).toContain('slate')
    })

    it('returns fallback for empty string', () => {
      const info = getFileTypeInfo('')
      expect(info.label).toBe('')
      expect(info.icon).toBe(FileText)
    })
  })

  describe('consistency', () => {
    it('all entries have non-empty iconColor and bgColor', () => {
      const mimes = [
        'application/pdf', 'application/msword', 'application/vnd.ms-excel',
        'image/png', 'image/jpeg', 'image/gif',
      ]
      for (const mime of mimes) {
        const info = getFileTypeInfo(mime)
        expect(info.iconColor.length).toBeGreaterThan(0)
        expect(info.bgColor.length).toBeGreaterThan(0)
      }
    })

    it('all entries include dark mode variants in bgColor', () => {
      const mimes = [
        'application/pdf', 'application/msword', 'image/png', '',
      ]
      for (const mime of mimes) {
        const info = getFileTypeInfo(mime)
        expect(info.bgColor).toContain('dark:')
      }
    })
  })
})

// ── isImageType ────────────────────────────────────────────────────

describe('isImageType', () => {
  it('returns true for image/ prefix', () => {
    expect(isImageType('image/png')).toBe(true)
    expect(isImageType('image/jpeg')).toBe(true)
    expect(isImageType('image/heic')).toBe(true)
    expect(isImageType('image/svg+xml')).toBe(true)
  })

  it('returns false for non-image types', () => {
    expect(isImageType('application/pdf')).toBe(false)
    expect(isImageType('text/plain')).toBe(false)
    expect(isImageType('video/mp4')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isImageType('')).toBe(false)
  })

  it('is case-sensitive (MIME types are lowercase by spec)', () => {
    expect(isImageType('Image/png')).toBe(false)
  })
})

// ── getFolderIconBg ────────────────────────────────────────────────

describe('getFolderIconBg', () => {
  it('returns mapped bg class for known emojis', () => {
    expect(getFolderIconBg('📋')).toContain('amber')
    expect(getFolderIconBg('🏦')).toContain('blue')
    expect(getFolderIconBg('🛡️')).toContain('emerald')
    expect(getFolderIconBg('🔍')).toContain('violet')
    expect(getFolderIconBg('🔨')).toContain('orange')
    expect(getFolderIconBg('📁')).toContain('slate')
    expect(getFolderIconBg('📦')).toContain('yellow')
    expect(getFolderIconBg('🏠')).toContain('sky')
    expect(getFolderIconBg('💰')).toContain('lime')
    expect(getFolderIconBg('📄')).toContain('gray')
    expect(getFolderIconBg('🔑')).toContain('rose')
    expect(getFolderIconBg('⚡')).toContain('yellow')
  })

  it('returns slate fallback for unknown emoji', () => {
    expect(getFolderIconBg('🎉')).toContain('slate')
  })

  it('returns slate fallback for empty string', () => {
    expect(getFolderIconBg('')).toContain('slate')
  })

  it('returns slate fallback for non-emoji strings', () => {
    expect(getFolderIconBg('hello')).toContain('slate')
    expect(getFolderIconBg('123')).toContain('slate')
  })

  it('all known emojis include dark mode variant', () => {
    const emojis = ['📋', '🏦', '🛡️', '🔍', '🔨', '📁', '📦', '🏠', '💰', '📄', '🔑', '⚡']
    for (const emoji of emojis) {
      expect(getFolderIconBg(emoji)).toContain('dark:')
    }
  })

  it('all known emojis return a valid Tailwind bg- class', () => {
    const emojis = ['📋', '🏦', '🛡️', '🔍', '🔨', '📁', '📦', '🏠', '💰', '📄', '🔑', '⚡']
    for (const emoji of emojis) {
      expect(getFolderIconBg(emoji)).toMatch(/^bg-/)
    }
  })

  it('covers every DEFAULT_FOLDERS icon with a non-fallback color', () => {
    // DEFAULT_FOLDERS icons must NOT fall back to generic slate
    const defaultIcons = ['📋', '🏦', '🛡️', '🔍', '🔨', '📁']
    const fallback = getFolderIconBg('🎉') // unknown → fallback
    for (const icon of defaultIcons) {
      const result = getFolderIconBg(icon)
      // 📁 legitimately uses slate, so just verify it returns something
      expect(result.length).toBeGreaterThan(0)
      // All non-📁 defaults should differ from the unknown-emoji fallback
      if (icon !== '📁') {
        expect(result).not.toBe(fallback)
      }
    }
  })

  it('handles emoji without variation selector (🛡 vs 🛡️)', () => {
    // 🛡️ (U+1F6E1 U+FE0F) is in the map; 🛡 (U+1F6E1 alone) is not
    // This is expected: Firestore preserves the exact string from FOLDER_ICONS
    const withSelector = getFolderIconBg('🛡️')
    const withoutSelector = getFolderIconBg('🛡')
    expect(withSelector).toContain('emerald')
    // Without the selector, it's a different string key → falls back
    expect(withoutSelector).toContain('slate')
  })
})

// ── getExtensionBadgeClasses ───────────────────────────────────────

describe('getExtensionBadgeClasses', () => {
  it('returns red classes for PDF', () => {
    const cls = getExtensionBadgeClasses('application/pdf')
    expect(cls).toContain('red')
    expect(cls).toContain('dark:')
  })

  it('returns blue classes for Word documents', () => {
    expect(getExtensionBadgeClasses('application/msword')).toContain('blue')
    expect(getExtensionBadgeClasses('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toContain('blue')
  })

  it('returns emerald classes for spreadsheets', () => {
    expect(getExtensionBadgeClasses('application/vnd.ms-excel')).toContain('emerald')
    expect(getExtensionBadgeClasses('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toContain('emerald')
  })

  it('returns violet classes for images', () => {
    expect(getExtensionBadgeClasses('image/png')).toContain('violet')
    expect(getExtensionBadgeClasses('image/jpeg')).toContain('violet')
  })

  it('returns slate classes for unknown types', () => {
    expect(getExtensionBadgeClasses('application/octet-stream')).toContain('slate')
    expect(getExtensionBadgeClasses('')).toContain('slate')
  })

  it('all return values include dark mode', () => {
    const mimes = ['application/pdf', 'application/msword', 'image/png', '']
    for (const mime of mimes) {
      expect(getExtensionBadgeClasses(mime)).toContain('dark:')
    }
  })
})

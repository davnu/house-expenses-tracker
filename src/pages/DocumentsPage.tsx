import { useState, useEffect, useMemo, useCallback, type DragEvent } from 'react'
import { Plus, Search, X, Upload, ChevronDown, Paperclip, ArrowRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DocumentsSkeleton } from '@/components/ui/loading'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { FolderView } from '@/components/documents/FolderView'
import { CreateFolderDialog } from '@/components/documents/CreateFolderDialog'
import { QuickUploadDialog } from '@/components/documents/QuickUploadDialog'
import { DocumentCard } from '@/components/documents/DocumentCard'
import { MoveDocumentDialog } from '@/components/documents/MoveDocumentDialog'
import { AttachmentViewer } from '@/components/expenses/AttachmentViewer'
import { useDocuments } from '@/context/DocumentContext'
import { useExpenses } from '@/context/ExpenseContext'
import { useIsMobile } from '@/hooks/use-mobile'
import { searchUnified, getRecentDocuments, attachmentToHouseDocument, type UnifiedSearchItem } from '@/lib/document-utils'
import { getCategoryLabel } from '@/lib/constants'
import { cn, formatCurrency, formatFileSize } from '@/lib/utils'
import { getFolderIconBg } from '@/lib/file-type-info'
import { MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'
import type { DocFolder, HouseDocument } from '@/types/document'
import type { Attachment } from '@/types/expense'

export function DocumentsPage() {
  const { t } = useTranslation()
  const { folders, documents, loading, totalStorageUsed, pendingDocumentIds, moveDocument, uploadDocuments, updateDocumentNotes } = useDocuments()
  const { expenses } = useExpenses()
  const isMobile = useIsMobile()
  const [selectedFolder, setSelectedFolder] = useState<DocFolder | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [quickUploadOpen, setQuickUploadOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [recentCollapsed, setRecentCollapsed] = useState(() => {
    const stored = localStorage.getItem('docs:recent-collapsed')
    if (stored !== null) return stored === 'true'
    return isMobile
  })

  const toggleRecent = () => {
    setRecentCollapsed((prev) => {
      localStorage.setItem('docs:recent-collapsed', String(!prev))
      return !prev
    })
  }

  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [movingDoc, setMovingDoc] = useState<HouseDocument | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)

  const liveFolder = selectedFolder ? folders.find((f) => f.id === selectedFolder.id) ?? null : null
  useEffect(() => {
    if (selectedFolder && !liveFolder) setSelectedFolder(null)
  }, [selectedFolder, liveFolder])

  // Unified search (documents + expense attachments)
  const unifiedResults = useMemo(
    () => searchUnified(documents, expenses, search),
    [documents, expenses, search]
  )

  // Recent standalone documents only (expense receipts stay in Expenses)
  const recentDocs = useMemo(() => getRecentDocuments(documents), [documents])

  // Whether any expense has attachments (for search bar visibility)
  const hasExpenseAttachments = useMemo(
    () => expenses.some(e => (e.attachments?.length ?? 0) > 0),
    [expenses]
  )

  // Image viewer — collect images from whatever is currently displayed
  const viewerImages = useMemo(() => {
    if (unifiedResults) {
      return unifiedResults
        .filter((item) => {
          const type = item.source === 'document' ? item.document.type : item.attachment.type
          const url = item.source === 'document' ? item.document.url : item.attachment.url
          return type.startsWith('image/') && url
        })
        .map((item): Attachment => {
          if (item.source === 'document') {
            const d = item.document
            return { id: d.id, name: d.name, type: d.type, size: d.size, url: d.url }
          }
          const a = item.attachment
          return { id: a.id, name: a.name, type: a.type, size: a.size, url: a.url }
        })
    }
    return recentDocs
      .filter((d) => d.type.startsWith('image/') && d.url)
      .map((d): Attachment => ({ id: d.id, name: d.name, type: d.type, size: d.size, url: d.url }))
  }, [unifiedResults, recentDocs])

  const getFolderName = useCallback((folderId: string) => folders.find((f) => f.id === folderId)?.name ?? '—', [folders])
  const getFolderIcon = useCallback((folderId: string) => folders.find((f) => f.id === folderId)?.icon ?? '\uD83D\uDCC1', [folders])

  // --- DnD handlers ---
  const handleFolderDragOver = useCallback((e: DragEvent, folderId: string) => {
    const types = e.dataTransfer.types
    if (!types.includes('application/x-document-id') && !types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = types.includes('Files') ? 'copy' : 'move'
    setDragOverFolderId(folderId)
  }, [])

  const handleFolderDragLeave = useCallback((e: DragEvent) => {
    const related = e.relatedTarget
    const current = e.currentTarget
    if (related instanceof Node && current.contains(related)) return
    setDragOverFolderId(null)
  }, [])

  const handleFolderDrop = useCallback(async (e: DragEvent, targetFolderId: string) => {
    e.preventDefault()
    setDragOverFolderId(null)
    const docId = e.dataTransfer.getData('application/x-document-id')
    if (docId) {
      const doc = documents.find((d) => d.id === docId)
      if (!doc || doc.folderId === targetFolderId) return
      try { await moveDocument(docId, targetFolderId) } catch { /* rolled back */ }
      return
    }
    if (e.dataTransfer.files.length > 0) {
      try { await uploadDocuments(targetFolderId, Array.from(e.dataTransfer.files)) } catch {}
    }
  }, [documents, moveDocument, uploadDocuments])

  const handlePreview = useCallback((id: string) => {
    const idx = viewerImages.findIndex((a) => a.id === id)
    if (idx >= 0) { setViewerIndex(idx); setViewerOpen(true) }
  }, [viewerImages])

  // --- Render helpers ---
  const renderFolderBadge = (doc: HouseDocument) => (
    <Badge
      variant="secondary"
      className="text-xs font-normal shrink-0 cursor-pointer hover:bg-accent"
      onClick={(e) => {
        e.stopPropagation()
        const folder = folders.find((f) => f.id === doc.folderId)
        if (folder) { setSearch(''); setSelectedFolder(folder) }
      }}
    >
      {getFolderIcon(doc.folderId)} {getFolderName(doc.folderId)}
    </Badge>
  )

  const renderReceiptBadge = (item: Extract<UnifiedSearchItem, { source: 'expense' }>) => (
    <Link
      to={`/app/expenses?highlight=${item.expense.id}`}
      className="shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <Badge variant="outline" className="text-xs font-normal cursor-pointer hover:bg-accent gap-1">
        <Paperclip className="h-3 w-3" />
        {getCategoryLabel(item.expense.category)} &middot; {formatCurrency(item.expense.amount)}
        <ArrowRight className="h-3 w-3 text-muted-foreground" />
      </Badge>
    </Link>
  )

  const renderUnifiedItem = (item: UnifiedSearchItem) => {
    if (item.source === 'document') {
      return (
        <DocumentCard
          key={item.document.id}
          document={item.document}
          isPending={pendingDocumentIds.has(item.document.id)}
          onMove={() => setMovingDoc(item.document)}
          onPreview={() => handlePreview(item.document.id)}
          onNotesChange={(notes) => updateDocumentNotes(item.document.id, notes)}
          folderBadge={renderFolderBadge(item.document)}
        />
      )
    }
    const syntheticDoc = attachmentToHouseDocument(item.attachment, item.expense)
    return (
      <DocumentCard
        key={`expense-${item.attachment.id}`}
        document={syntheticDoc}
        isPending={false}
        readOnly
        onPreview={() => handlePreview(item.attachment.id)}
        folderBadge={renderReceiptBadge(item)}
      />
    )
  }

  const renderStandaloneDocCard = (doc: HouseDocument) => (
    <DocumentCard
      key={doc.id}
      document={doc}
      isPending={pendingDocumentIds.has(doc.id)}
      onMove={() => setMovingDoc(doc)}
      onPreview={() => handlePreview(doc.id)}
      onNotesChange={(notes) => updateDocumentNotes(doc.id, notes)}
      folderBadge={renderFolderBadge(doc)}
    />
  )

  if (loading) return <DocumentsSkeleton />

  if (liveFolder && !search.trim()) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">{t('documents.title')}</h1>
        <FolderView
          folder={liveFolder}
          onBack={() => setSelectedFolder(null)}
          onNavigate={(f) => setSelectedFolder(f)}
        />
      </div>
    )
  }

  const sortedFolders = [...folders].sort((a, b) => a.order - b.order)
  const isSearching = !!search.trim()

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold flex items-center">
          {t('documents.title')}
          <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            <InfoTooltip text={t('files.securityTooltip')} position="bottom" />
          </span>
        </h1>
        {folders.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setQuickUploadOpen(true)}>
            <Upload className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">{t('documents.upload')}</span>
          </Button>
        )}
      </div>

      {/* Search bar */}
      {(folders.length > 0 || documents.length > 0 || hasExpenseAttachments) && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('documents.searchPlaceholder')}
            aria-label="Search documents and receipts"
            className="pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-sm text-muted-foreground hover:text-foreground cursor-pointer"
              onClick={() => setSearch('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Search results (unified: documents + expense receipts) */}
      {isSearching ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {unifiedResults?.length === 0
              ? t('documents.noResults')
              : t('documents.resultCount', { count: unifiedResults?.length ?? 0 })
            }
          </p>
          {unifiedResults && unifiedResults.length > 0 && (
            <div className="space-y-1.5">
              {unifiedResults.map(renderUnifiedItem)}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Storage bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('documents.storageUsed')}</span>
              <span>{formatFileSize(totalStorageUsed)} / {formatFileSize(MAX_HOUSEHOLD_STORAGE)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min((totalStorageUsed / MAX_HOUSEHOLD_STORAGE) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Recent documents (standalone only) */}
          {recentDocs.length > 0 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer mb-2"
                onClick={toggleRecent}
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${recentCollapsed ? '-rotate-90' : ''}`} />
                {t('documents.recent')}
                {recentCollapsed && (
                  <span className="text-xs font-normal ml-1">({recentDocs.length})</span>
                )}
              </button>
              {!recentCollapsed && (
                <div className="space-y-1.5">
                  {recentDocs.map(renderStandaloneDocCard)}
                </div>
              )}
            </div>
          )}

          {/* Folder grid */}
          {sortedFolders.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-lg font-medium">{t('documents.organizeTitle')}</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                {t('documents.organizeDesc')}
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                {t('documents.createFirstFolder')}
              </Button>
            </div>
          ) : (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">{t('documents.folders')}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {sortedFolders.map((folder) => {
                  const docCount = documents.filter((d) => d.folderId === folder.id).length
                  const isDropTarget = dragOverFolderId === folder.id
                  return (
                    <Card
                      key={folder.id}
                      className={cn(
                        'transition-[transform,box-shadow] duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                        isDropTarget
                          ? 'bg-primary/10 ring-2 ring-primary scale-[1.02] shadow-lg'
                          : 'hover:shadow-md hover:-translate-y-0.5',
                      )}
                      onClick={() => setSelectedFolder(folder)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFolder(folder) } }}
                      onDragOver={isMobile ? undefined : (e) => handleFolderDragOver(e, folder.id)}
                      onDragLeave={isMobile ? undefined : handleFolderDragLeave}
                      onDrop={isMobile ? undefined : (e) => handleFolderDrop(e, folder.id)}
                    >
                      <CardContent className="p-5 flex flex-col items-center text-center gap-2.5">
                        <div className={cn(
                          'h-12 w-12 rounded-2xl flex items-center justify-center',
                          getFolderIconBg(folder.icon)
                        )}>
                          <span className="text-2xl leading-none">{folder.icon}</span>
                        </div>
                        <div className="min-w-0 w-full">
                          <p className="text-sm font-medium truncate">{folder.name}</p>
                          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 min-h-[1em]">
                            {folder.description}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {isDropTarget ? t('documents.dropHere') : docCount === 0 ? t('documents.empty') : t('documents.fileCount', { count: docCount })}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
                <Card
                  className="border-dashed transition-[transform,box-shadow] duration-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                  onClick={() => setCreateOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCreateOpen(true) } }}
                >
                  <CardContent className="p-5 flex flex-col items-center text-center gap-2.5 justify-center h-full">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t('documents.newFolder')}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </>
      )}

      <CreateFolderDialog open={createOpen} onOpenChange={setCreateOpen} />
      <QuickUploadDialog open={quickUploadOpen} onOpenChange={setQuickUploadOpen} />
      <MoveDocumentDialog document={movingDoc} open={!!movingDoc} onOpenChange={(open) => { if (!open) setMovingDoc(null) }} />
      <AttachmentViewer attachments={viewerImages} initialIndex={viewerIndex} open={viewerOpen} onOpenChange={setViewerOpen} />
    </div>
  )
}

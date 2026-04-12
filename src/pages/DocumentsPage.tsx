import { useState, useEffect, useMemo, useCallback, type DragEvent } from 'react'
import { Plus, Search, X, Upload, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingInline } from '@/components/ui/loading'
import { FolderView } from '@/components/documents/FolderView'
import { CreateFolderDialog } from '@/components/documents/CreateFolderDialog'
import { QuickUploadDialog } from '@/components/documents/QuickUploadDialog'
import { DocumentCard } from '@/components/documents/DocumentCard'
import { MoveDocumentDialog } from '@/components/documents/MoveDocumentDialog'
import { AttachmentViewer } from '@/components/expenses/AttachmentViewer'
import { useDocuments } from '@/context/DocumentContext'
import { useIsMobile } from '@/hooks/use-mobile'
import { searchDocuments, getRecentDocuments } from '@/lib/document-utils'
import { cn } from '@/lib/utils'
import { MAX_HOUSEHOLD_STORAGE } from '@/lib/constants'
import type { DocFolder, HouseDocument } from '@/types/document'
import type { Attachment } from '@/types/expense'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function DocumentsPage() {
  const { folders, documents, loading, totalStorageUsed, pendingDocumentIds, moveDocument, uploadDocuments, updateDocumentNotes } = useDocuments()
  const isMobile = useIsMobile()
  const [selectedFolder, setSelectedFolder] = useState<DocFolder | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [quickUploadOpen, setQuickUploadOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [recentCollapsed, setRecentCollapsed] = useState(() => {
    const stored = localStorage.getItem('docs:recent-collapsed')
    if (stored !== null) return stored === 'true'
    return isMobile // default: collapsed on mobile, open on desktop
  })

  const toggleRecent = () => {
    setRecentCollapsed((prev) => {
      localStorage.setItem('docs:recent-collapsed', String(!prev))
      return !prev
    })
  }

  // DnD state for folder card drop targets
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  // Search/recent result actions
  const [movingDoc, setMovingDoc] = useState<HouseDocument | null>(null)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIndex, setViewerIndex] = useState(0)

  // Clear stale selection if folder was deleted
  const liveFolder = selectedFolder ? folders.find((f) => f.id === selectedFolder.id) ?? null : null
  useEffect(() => {
    if (selectedFolder && !liveFolder) setSelectedFolder(null)
  }, [selectedFolder, liveFolder])

  // Search results
  const searchResults = useMemo(() => searchDocuments(documents, search), [documents, search])

  // Recent documents (last 5, for the main page)
  const recentDocs = useMemo(() => getRecentDocuments(documents), [documents])

  // Image attachments for viewer
  const viewerSource = searchResults ?? recentDocs
  const viewerImageAttachments = useMemo(
    () => viewerSource
      .filter((d) => d.type.startsWith('image/') && d.url)
      .map((d): Attachment => ({ id: d.id, name: d.name, type: d.type, size: d.size, url: d.url })),
    [viewerSource]
  )

  const getFolderName = useCallback((folderId: string) => folders.find((f) => f.id === folderId)?.name ?? 'Unknown', [folders])
  const getFolderIcon = useCallback((folderId: string) => folders.find((f) => f.id === folderId)?.icon ?? '📁', [folders])

  // --- Folder card DnD handlers (accept both internal moves AND external file drops) ---
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

    // Internal document move
    const docId = e.dataTransfer.getData('application/x-document-id')
    if (docId) {
      const doc = documents.find((d) => d.id === docId)
      if (!doc || doc.folderId === targetFolderId) return
      try { await moveDocument(docId, targetFolderId) } catch { /* rolled back */ }
      return
    }

    // External file drop from OS
    if (e.dataTransfer.files.length > 0) {
      try { await uploadDocuments(targetFolderId, Array.from(e.dataTransfer.files)) } catch { /* error shown in context */ }
    }
  }, [documents, moveDocument, uploadDocuments])

  const handleDocPreview = useCallback((doc: HouseDocument) => {
    const idx = viewerImageAttachments.findIndex((a) => a.id === doc.id)
    if (idx >= 0) { setViewerIndex(idx); setViewerOpen(true) }
  }, [viewerImageAttachments])

  const renderFolderBadge = useCallback((doc: HouseDocument) => (
    <Badge
      variant="secondary"
      className="text-xs font-normal shrink-0 cursor-pointer hover:bg-accent"
      onClick={(e) => {
        e.stopPropagation()
        const folder = folders.find((f) => f.id === doc.folderId)
        if (folder) setSelectedFolder(folder)
      }}
    >
      {getFolderIcon(doc.folderId)} {getFolderName(doc.folderId)}
    </Badge>
  ), [folders, getFolderIcon, getFolderName])

  const renderDocCard = (doc: HouseDocument, showBadge: boolean) => (
    <DocumentCard
      key={doc.id}
      document={doc}
      isPending={pendingDocumentIds.has(doc.id)}
      onMove={() => setMovingDoc(doc)}
      onPreview={() => handleDocPreview(doc)}
      onNotesChange={(notes) => updateDocumentNotes(doc.id, notes)}
      folderBadge={showBadge ? renderFolderBadge(doc) : undefined}
    />
  )

  if (loading) return <LoadingInline />

  // Folder view (not searching)
  if (liveFolder && !search.trim()) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Documents</h1>
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
        <h1 className="text-2xl font-bold">Documents</h1>
        <div className="flex items-center gap-2">
          {folders.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setQuickUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-1.5" />
              Upload
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Folder
          </Button>
        </div>
      </div>

      {/* Search bar */}
      {(folders.length > 0 || documents.length > 0) && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all documents..."
            aria-label="Search documents"
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

      {/* Search results */}
      {isSearching ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {searchResults?.length === 0
              ? 'No documents found'
              : `${searchResults?.length} result${searchResults?.length !== 1 ? 's' : ''}`
            }
          </p>
          {searchResults && searchResults.length > 0 && (
            <div className="space-y-1.5">
              {searchResults.map((doc) => renderDocCard(doc, true))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Storage bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Storage used</span>
              <span>{formatSize(totalStorageUsed)} / {formatSize(MAX_HOUSEHOLD_STORAGE)}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.min((totalStorageUsed / MAX_HOUSEHOLD_STORAGE) * 100, 100)}%` }}
              />
            </div>
          </div>

          {/* Recent documents */}
          {recentDocs.length > 0 && (
            <div>
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer mb-2"
                onClick={toggleRecent}
              >
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${recentCollapsed ? '-rotate-90' : ''}`} />
                Recent
                {recentCollapsed && (
                  <span className="text-xs font-normal ml-1">({recentDocs.length})</span>
                )}
              </button>
              {!recentCollapsed && (
                <div className="space-y-1.5">
                  {recentDocs.map((doc) => renderDocCard(doc, true))}
                </div>
              )}
            </div>
          )}

          {/* Folder grid */}
          {sortedFolders.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-lg font-medium">Organize your house documents</p>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Store contracts, inspection reports, insurance policies, and anything else related to your house purchase.
              </p>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Create First Folder
              </Button>
            </div>
          ) : (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-2">Folders</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {sortedFolders.map((folder) => {
                  const docCount = documents.filter((d) => d.folderId === folder.id).length
                  const isDropTarget = dragOverFolderId === folder.id
                  return (
                    <Card
                      key={folder.id}
                      className={cn(
                        'transition-all cursor-pointer',
                        isDropTarget
                          ? 'bg-primary/10 ring-2 ring-primary scale-[1.02]'
                          : 'hover:bg-accent/50',
                      )}
                      onClick={() => setSelectedFolder(folder)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFolder(folder) } }}
                      onDragOver={isMobile ? undefined : (e) => handleFolderDragOver(e, folder.id)}
                      onDragLeave={isMobile ? undefined : handleFolderDragLeave}
                      onDrop={isMobile ? undefined : (e) => handleFolderDrop(e, folder.id)}
                    >
                      <CardContent className="p-4 flex flex-col items-center text-center gap-1.5">
                        <span className="text-3xl">{folder.icon}</span>
                        <div className="min-w-0 w-full">
                          <p className="text-sm font-medium truncate">{folder.name}</p>
                          {folder.description && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1">{folder.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {isDropTarget
                              ? 'Drop here'
                              : docCount === 0 ? 'Empty' : `${docCount} file${docCount !== 1 ? 's' : ''}`
                            }
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}

                {/* Add folder card */}
                <Card
                  className="border-dashed hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setCreateOpen(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCreateOpen(true) } }}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2 justify-center h-full">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plus className="h-4 w-4 text-primary" />
                    </div>
                    <p className="text-sm text-muted-foreground">New Folder</p>
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
      <AttachmentViewer attachments={viewerImageAttachments} initialIndex={viewerIndex} open={viewerOpen} onOpenChange={setViewerOpen} />
    </div>
  )
}

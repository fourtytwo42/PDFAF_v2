'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist/types/src/display/api';
import {
  convertPdfBoundsToOverlayRect,
  getVisiblePageWindow,
  groupIssuesForPage,
  type EditPageRenderInfo,
} from '../../../lib/editor/editOverlayGeometry';
import type { EditRenderStatus } from '../../../types/editEditor';
import type { EditorIssue } from '../../../types/editor';
import { FileIcon, InfoIcon } from '../../common/AppIcons';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.mjs',
  import.meta.url,
).toString();

interface EditPdfViewerProps {
  sourceBlob: Blob | null;
  pageCount: number;
  selectedPage: number;
  zoom: number;
  issues: EditorIssue[];
  selectedIssueId: string | null;
  onSelectIssue: (issueId: string) => void;
  onSelectPage: (page: number) => void;
  onRenderStatusChange: (status: EditRenderStatus, error?: string | null) => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Unable to render this PDF.';
}

function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}

function RenderedPage({
  document,
  pageNumber,
  zoom,
  issues,
  selectedIssueId,
  selectedPage,
  onSelectIssue,
  onSelectPage,
  registerPage,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  issues: EditorIssue[];
  selectedIssueId: string | null;
  selectedPage: number;
  onSelectIssue: (issueId: string) => void;
  onSelectPage: (page: number) => void;
  registerPage: (page: number, element: HTMLElement | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pageInfo, setPageInfo] = useState<EditPageRenderInfo | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const pageIssues = useMemo(() => groupIssuesForPage(issues, pageNumber), [issues, pageNumber]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;

    async function renderPage() {
      setRenderError(null);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) {
        setRenderError('Canvas rendering is unavailable in this browser.');
        return;
      }

      try {
        const page: PDFPageProxy = await document.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: zoom });
        const deviceScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * deviceScale);
        canvas.height = Math.floor(viewport.height * deviceScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        setPageInfo({
          page: pageNumber,
          width: viewport.width,
          height: viewport.height,
          renderedScale: zoom,
        });

        renderTask = page.render({
          canvasContext: context,
          viewport,
          transform: deviceScale === 1 ? undefined : [deviceScale, 0, 0, deviceScale, 0, 0],
        });
        await renderTask.promise;
      } catch (error) {
        if (!cancelled && !isCancellation(error)) {
          setRenderError(toErrorMessage(error));
        }
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber, zoom]);

  const selected = selectedPage === pageNumber;
  const pageSize = pageInfo
    ? {
        width: pageInfo.width / pageInfo.renderedScale,
        height: pageInfo.height / pageInfo.renderedScale,
      }
    : null;

  return (
    <section
      ref={(element) => registerPage(pageNumber, element)}
      className={`rounded-2xl border p-3 transition ${
        selected
          ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
          : 'border-[color:var(--surface-border)] bg-[var(--surface)]'
      }`}
      onClick={() => onSelectPage(pageNumber)}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--muted)]">Page {pageNumber}</p>
        <p className="text-xs text-[var(--muted)]">{pageIssues.pageIssues.length} issues</p>
      </div>
      <div className="overflow-auto rounded-xl bg-[#e2e8f0] p-3">
        <div className="relative mx-auto w-fit shadow-sm">
          <canvas ref={canvasRef} className="block bg-white" />

          {pageInfo && pageSize
            ? pageIssues.boundsIssues.map((issue) => {
                if (!issue.bounds) return null;
                const rect = convertPdfBoundsToOverlayRect(issue.bounds, pageSize, {
                  width: pageInfo.width,
                  height: pageInfo.height,
                });
                const active = issue.id === selectedIssueId;
                return (
                  <button
                    key={issue.id}
                    type="button"
                    aria-label={issue.message}
                    title={issue.message}
                    className={`absolute border-2 bg-[color:rgba(31,111,235,0.14)] transition ${
                      active ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]' : 'border-[color:rgba(31,111,235,0.55)]'
                    }`}
                    style={{
                      left: rect.left,
                      top: rect.top,
                      width: Math.max(rect.width, 16),
                      height: Math.max(rect.height, 16),
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectIssue(issue.id);
                    }}
                  />
                );
              })
            : null}

          {pageIssues.pageMarkerIssues.length ? (
            <div className="absolute left-3 top-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
              {pageIssues.pageMarkerIssues.slice(0, 4).map((issue) => {
                const active = issue.id === selectedIssueId;
                return (
                  <button
                    key={issue.id}
                    type="button"
                    className={`focus-ring rounded-full border px-2 py-1 text-[11px] font-semibold shadow-sm transition ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[color:var(--surface-border)] bg-white text-[var(--accent)] hover:border-[var(--accent)]'
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectIssue(issue.id);
                    }}
                  >
                    {issue.category.replaceAll('_', ' ')}
                  </button>
                );
              })}
              {pageIssues.pageMarkerIssues.length > 4 ? (
                <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-[var(--muted)] shadow-sm">
                  +{pageIssues.pageMarkerIssues.length - 4}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {renderError ? (
        <p className="mt-2 rounded-xl border border-[color:rgba(220,38,38,0.24)] bg-[color:rgba(220,38,38,0.06)] px-3 py-2 text-xs text-[var(--danger)]">
          {renderError}
        </p>
      ) : null}
    </section>
  );
}

export function EditPdfViewer({
  sourceBlob,
  pageCount,
  selectedPage,
  zoom,
  issues,
  selectedIssueId,
  onSelectIssue,
  onSelectPage,
  onRenderStatusChange,
}: EditPdfViewerProps) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const pageRefs = useRef(new Map<number, HTMLElement>());
  const visiblePages = useMemo(
    () => getVisiblePageWindow(selectedPage, document?.numPages ?? pageCount, 1),
    [document?.numPages, pageCount, selectedPage],
  );

  useEffect(() => {
    let cancelled = false;
    let loadingTask: ReturnType<typeof pdfjsLib.getDocument> | null = null;

    async function loadDocument() {
      if (!sourceBlob) {
        setDocument(null);
        onRenderStatusChange('idle');
        return;
      }

      onRenderStatusChange('loading');
      setDocument(null);

      try {
        const data = new Uint8Array(await sourceBlob.arrayBuffer());
        if (cancelled) return;

        loadingTask = pdfjsLib.getDocument({ data });
        const loaded = await loadingTask.promise;
        if (cancelled) {
          await loaded.destroy();
          return;
        }

        setDocument(loaded);
        onRenderStatusChange('ready');
      } catch (error) {
        if (!cancelled) {
          onRenderStatusChange('failed', toErrorMessage(error));
        }
      }
    }

    void loadDocument();

    return () => {
      cancelled = true;
      void loadingTask?.destroy();
    };
  }, [onRenderStatusChange, sourceBlob]);

  useEffect(() => {
    const element = pageRefs.current.get(selectedPage);
    element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedIssueId, selectedPage]);

  const registerPage = (page: number, element: HTMLElement | null) => {
    if (element) pageRefs.current.set(page, element);
    else pageRefs.current.delete(page);
  };

  if (!sourceBlob) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--surface-border)] bg-[var(--surface)] p-6 text-center">
        <div>
          <FileIcon className="mx-auto size-10 text-[var(--muted)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">Open a PDF for review</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-[var(--muted)]">
            Stage 5 renders the source PDF, then connects analyzer findings to page markers and overlays.
          </p>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-dashed border-[color:var(--surface-border)] bg-[var(--surface)] p-6 text-center">
        <div>
          <InfoIcon className="mx-auto size-10 text-[var(--accent)]" />
          <h2 className="mt-4 text-lg font-semibold text-[var(--foreground)]">Loading PDF preview</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Preparing the selected page window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-[color:var(--surface-border)] bg-[var(--surface)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Rendered PDF preview</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Showing page {selectedPage} with nearby pages. Zoom {Math.round(zoom * 100)}%.
            </p>
          </div>
          <p className="text-xs font-semibold text-[var(--muted)]">{document.numPages} pages</p>
        </div>
      </div>
      <div className="grid gap-4">
        {visiblePages.map((pageNumber) => (
          <RenderedPage
            key={pageNumber}
            document={document}
            pageNumber={pageNumber}
            zoom={zoom}
            issues={issues}
            selectedIssueId={selectedIssueId}
            selectedPage={selectedPage}
            onSelectIssue={onSelectIssue}
            onSelectPage={onSelectPage}
            registerPage={registerPage}
          />
        ))}
      </div>
    </div>
  );
}

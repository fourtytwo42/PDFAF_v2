'use client';

import { useMemo } from 'react';
import { ProductNav } from '../../common/ProductNav';
import { AddIcon, DownloadIcon, FileIcon } from '../../common/AppIcons';
import { EditorInspector } from '../EditorInspector';
import { EditorIssueList } from '../EditorIssueList';
import { EditorRail } from '../EditorRail';
import { EditorShell } from '../EditorShell';
import { computeReadinessSummary, sortEditorIssues } from '../../../lib/editor/issues';
import { validateCreateDocument } from '../../../lib/editor/createValidation';
import { getSelectedCreateObject, useCreateEditorStore } from '../../../stores/createEditor';
import type { CreatePage, CreatePageObject } from '../../../types/createEditor';
import type { EditorIssue, EditorShellModeConfig } from '../../../types/editor';

const config: EditorShellModeConfig = {
  mode: 'create',
  title: 'Untitled PDF',
  subtitle: 'Build an accessible PDF from structured content.',
  emptyTitle: 'Create PDF workspace',
  emptyDescription: 'Stage 2 structured authoring prototype.',
};

function ToolbarButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="focus-ring inline-flex size-9 items-center justify-center rounded-full border border-[color:var(--surface-border)] bg-[var(--surface)] text-[var(--muted)] transition hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function objectLabel(object: CreatePageObject): string {
  if (object.type === 'heading') return `H${object.level} · ${object.text}`;
  if (object.type === 'paragraph') return object.text;
  if (object.type === 'image') return object.label;
  return object.caption || 'Table';
}

function CreateRail({
  pages,
  selectedPageId,
  selectedObjectId,
  onSelectPage,
  onSelectObject,
}: {
  pages: CreatePage[];
  selectedPageId: string | null;
  selectedObjectId: string | null;
  onSelectPage: (pageId: string) => void;
  onSelectObject: (pageId: string, objectId: string) => void;
}) {
  return (
    <EditorRail title="Document">
      <div className="flex flex-col gap-3">
        {pages.map((page, index) => {
          const selectedPage = page.id === selectedPageId;
          return (
            <section key={page.id} className="rounded-2xl border border-[color:var(--surface-border)] p-2">
              <button
                type="button"
                onClick={() => onSelectPage(page.id)}
                className={`focus-ring w-full rounded-xl px-2 py-2 text-left text-sm font-semibold ${
                  selectedPage ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-[var(--foreground)]'
                }`}
              >
                {page.title || `Page ${index + 1}`}
              </button>
              <div className="mt-2 flex flex-col gap-1">
                {page.objects.map((object) => (
                  <button
                    key={object.id}
                    type="button"
                    onClick={() => onSelectObject(page.id, object.id)}
                    className={`focus-ring truncate rounded-lg px-2 py-1.5 text-left text-xs ${
                      object.id === selectedObjectId
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]'
                    }`}
                  >
                    {objectLabel(object)}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </EditorRail>
  );
}

function WorkspaceObject({
  page,
  object,
  selected,
  onSelect,
}: {
  page: CreatePage;
  object: CreatePageObject;
  selected: boolean;
  onSelect: (pageId: string, objectId: string) => void;
}) {
  const baseClass = `focus-ring w-full rounded-xl border p-3 text-left transition ${
    selected
      ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]'
      : 'border-[color:var(--surface-border)] hover:border-[var(--accent)]'
  }`;

  if (object.type === 'heading') {
    return (
      <button type="button" className={baseClass} onClick={() => onSelect(page.id, object.id)}>
        <p className="font-semibold text-[var(--foreground)]">
          <span className="mr-2 text-xs text-[var(--muted)]">H{object.level}</span>
          {object.text}
        </p>
      </button>
    );
  }

  if (object.type === 'paragraph') {
    return (
      <button type="button" className={baseClass} onClick={() => onSelect(page.id, object.id)}>
        <p className="text-sm leading-6 text-[var(--foreground)]">{object.text}</p>
      </button>
    );
  }

  if (object.type === 'image') {
    return (
      <button type="button" className={baseClass} onClick={() => onSelect(page.id, object.id)}>
        <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-[color:var(--surface-border)] bg-[#f8fafc] text-sm font-semibold text-[var(--muted)]">
          {object.label}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          {object.decorative ? 'Decorative' : object.altText || 'Alt text needed'}
        </p>
      </button>
    );
  }

  return (
    <button type="button" className={baseClass} onClick={() => onSelect(page.id, object.id)}>
      <p className="mb-2 text-sm font-semibold text-[var(--foreground)]">{object.caption}</p>
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-[color:var(--surface-border)] text-xs">
        {object.rows.flatMap((row, rowIndex) =>
          row.cells.map((cell) => (
            <div
              key={cell.id}
              className={`border-b border-r border-[color:var(--surface-border)] px-2 py-1 ${
                object.hasHeaderRow && rowIndex === 0 ? 'bg-[var(--accent-soft)] font-semibold' : ''
              }`}
            >
              {cell.text}
            </div>
          )),
        )}
      </div>
    </button>
  );
}

function CreateWorkspace({
  pages,
  selectedPageId,
  selectedObjectId,
  onSelectObject,
}: {
  pages: CreatePage[];
  selectedPageId: string | null;
  selectedObjectId: string | null;
  onSelectObject: (pageId: string, objectId: string) => void;
}) {
  return (
    <div className="h-full min-h-[360px] overflow-auto rounded-2xl bg-[#eef3f9] p-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {pages.map((page, index) => (
          <section key={page.id} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between text-xs text-[var(--muted)]">
              <span>{page.title || `Page ${index + 1}`}</span>
              <span>{page.objects.length} objects</span>
            </div>
            <div className="flex flex-col gap-3">
              {page.objects.map((object) => (
                <WorkspaceObject
                  key={object.id}
                  page={page}
                  object={object}
                  selected={page.id === selectedPageId && object.id === selectedObjectId}
                  onSelect={onSelectObject}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--foreground)]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="focus-ring rounded-xl border border-[color:var(--surface-border)] bg-white px-3 py-2 text-sm font-normal"
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--foreground)]">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="focus-ring rounded-xl border border-[color:var(--surface-border)] bg-white px-3 py-2 text-sm font-normal"
      />
    </label>
  );
}

function InspectorContent({
  selectedObject,
  documentTitle,
  documentLanguage,
  updateMetadata,
  updateSelectedObject,
}: {
  selectedObject: CreatePageObject | null;
  documentTitle: string;
  documentLanguage: string;
  updateMetadata: (metadata: { title?: string; language?: string }) => void;
  updateSelectedObject: (updates: Partial<CreatePageObject>) => void;
}) {
  if (!selectedObject) {
    return (
      <div className="flex flex-col gap-3">
        <TextInput label="Document title" value={documentTitle} onChange={(title) => updateMetadata({ title })} />
        <TextInput
          label="Document language"
          value={documentLanguage}
          onChange={(language) => updateMetadata({ language })}
        />
      </div>
    );
  }

  if (selectedObject.type === 'heading') {
    return (
      <div className="flex flex-col gap-3">
        <TextInput label="Heading text" value={selectedObject.text} onChange={(text) => updateSelectedObject({ text })} />
        <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--foreground)]">
          Heading level
          <select
            value={selectedObject.level}
            onChange={(event) =>
              updateSelectedObject({ level: Number(event.target.value) as 1 | 2 | 3 | 4 | 5 | 6 })
            }
            className="focus-ring rounded-xl border border-[color:var(--surface-border)] bg-white px-3 py-2 text-sm font-normal"
          >
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <option key={level} value={level}>
                H{level}
              </option>
            ))}
          </select>
        </label>
      </div>
    );
  }

  if (selectedObject.type === 'paragraph') {
    return (
      <TextArea
        label="Paragraph text"
        value={selectedObject.text}
        onChange={(text) => updateSelectedObject({ text })}
      />
    );
  }

  if (selectedObject.type === 'image') {
    return (
      <div className="flex flex-col gap-3">
        <TextInput label="Image label" value={selectedObject.label} onChange={(label) => updateSelectedObject({ label })} />
        <TextArea
          label="Alt text"
          value={selectedObject.altText}
          onChange={(altText) => updateSelectedObject({ altText })}
        />
        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <input
            type="checkbox"
            checked={selectedObject.decorative}
            onChange={(event) => updateSelectedObject({ decorative: event.target.checked })}
          />
          Decorative image
        </label>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <TextInput label="Table caption" value={selectedObject.caption} onChange={(caption) => updateSelectedObject({ caption })} />
      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
        <input
          type="checkbox"
          checked={selectedObject.hasHeaderRow}
          onChange={(event) => updateSelectedObject({ hasHeaderRow: event.target.checked })}
        />
        First row is a header
      </label>
    </div>
  );
}

export function CreateEditorWorkspace() {
  const document = useCreateEditorStore((state) => state.document);
  const selection = useCreateEditorStore((state) => state.selection);
  const selectPage = useCreateEditorStore((state) => state.selectPage);
  const selectObject = useCreateEditorStore((state) => state.selectObject);
  const clearObjectSelection = useCreateEditorStore((state) => state.clearObjectSelection);
  const updateMetadata = useCreateEditorStore((state) => state.updateMetadata);
  const addHeading = useCreateEditorStore((state) => state.addHeading);
  const addParagraph = useCreateEditorStore((state) => state.addParagraph);
  const addImage = useCreateEditorStore((state) => state.addImage);
  const addTable = useCreateEditorStore((state) => state.addTable);
  const updateSelectedObject = useCreateEditorStore((state) => state.updateSelectedObject);

  const issues = useMemo(() => sortEditorIssues(validateCreateDocument(document)), [document]);
  const readiness = useMemo(() => computeReadinessSummary(issues), [issues]);
  const selectedObject = getSelectedCreateObject(document, selection);

  function selectIssue(issueId: string) {
    const issue = issues.find((candidate) => candidate.id === issueId);
    if (!issue?.target?.pageId) return;
    if (issue.target.objectId) {
      selectObject(issue.target.pageId, issue.target.objectId);
    } else {
      selectPage(issue.target.pageId);
    }
  }

  return (
    <EditorShell
      config={{
        ...config,
        title: document.metadata.title || config.title,
      }}
      issues={issues}
      readiness={readiness}
      selectedIssueId={null}
      onSelectIssue={selectIssue}
      beforeToolbar={<ProductNav />}
      pageLabel={`${document.pages.length} pages`}
      saveStateLabel="In memory"
      slots={{
        leftRail: (
          <CreateRail
            pages={document.pages}
            selectedPageId={selection.pageId}
            selectedObjectId={selection.objectId}
            onSelectPage={selectPage}
            onSelectObject={selectObject}
          />
        ),
        workspace: (
          <CreateWorkspace
            pages={document.pages}
            selectedPageId={selection.pageId}
            selectedObjectId={selection.objectId}
            onSelectObject={selectObject}
          />
        ),
        inspector: (
          <EditorInspector title={selectedObject ? 'Properties' : 'Document'}>
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={clearObjectSelection}
                className="focus-ring rounded-full border border-[color:var(--surface-border)] px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--accent-soft)] hover:text-[var(--foreground)]"
              >
                Document settings
              </button>
              <InspectorContent
                selectedObject={selectedObject}
                documentTitle={document.metadata.title}
                documentLanguage={document.metadata.language}
                updateMetadata={updateMetadata}
                updateSelectedObject={updateSelectedObject}
              />
              <div className="border-t border-[color:var(--surface-border)] pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Issues
                </h3>
                <EditorIssueList issues={issues} onSelectIssue={selectIssue} />
              </div>
            </div>
          </EditorInspector>
        ),
      }}
    >
      <ToolbarButton label="Add heading" onClick={addHeading}>
        <AddIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Add paragraph" onClick={addParagraph}>
        <FileIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Add image" onClick={addImage}>
        <AddIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Add table" onClick={addTable}>
        <FileIcon className="size-4" />
      </ToolbarButton>
      <ToolbarButton label="Export PDF starts in Stage 3" disabled>
        <DownloadIcon className="size-4" />
      </ToolbarButton>
    </EditorShell>
  );
}

/**
 * Visual-first editor for Harper `schema.graphql` files. Mirrors the SVG
 * `MarkupImageView` toggle: the table GUI is the default, with an "Edit as text"
 * escape hatch to the Monaco {@link TextEditorView} (and back). Both views share
 * the same session buffer via {@link useEditorFileContent}, so the Save button,
 * dirty indicator, and unsaved-content continuity all keep working.
 *
 * The buffer is the source of truth; the reducer's document is an editable
 * projection re-derived from the buffer on mount, on revert, and whenever we
 * return from the text editor (so manual text edits are never lost).
 */
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { parseSchema } from '@/features/instance/applications/lib/schema/parseSchema';
import { serializeSchema } from '@/features/instance/applications/lib/schema/serializeSchema';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { useListener } from '@/lib/events/listener';
import { MAX_WORKER_MODEL_CHARS } from '@/lib/monaco/workerLimits';
import { CodeIcon, PlusIcon, Table2Icon } from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { TextEditorView } from '../TextEditorView';
import { documentTables, hasUnmodeledContent, parseDocument, schemaEditorReducer } from './schemaEditorReducer';
import { TableCard } from './TableCard';

export function SchemaEditorView() {
	const { openedEntry, openedEntryContents, isSavingFile, saveFile } = useEditorView();
	const instanceParams = useInstanceClientIdParams();
	const canManage = useInstanceBrowseManagePermission();
	const path = !!openedEntry && !openedEntry.package && openedEntry.path;
	const { content: updatedFileContent, setContent } = useEditorFileContent(path);

	const buffer = updatedFileContent ?? openedEntryContents ?? '';
	// Latest buffer available to effects that must not list it as a dependency
	// (they'd otherwise re-run — and clobber the doc — on our own writes).
	const bufferRef = useRef(buffer);
	bufferRef.current = buffer;

	const readOnly = !!openedEntry?.package || !canManage;
	const canUseVisual = useMemo(
		() => buffer.length <= MAX_WORKER_MODEL_CHARS && parseSchema(buffer).ok,
		[buffer],
	);

	const [doc, dispatch] = useReducer(schemaEditorReducer, bufferRef.current, parseDocument);
	const [showSource, setShowSource] = useState(() => !canUseVisual);
	const pendingAddTable = useRef(false);

	// Re-derive the doc from the buffer on mount, when the saved content changes
	// (e.g. it finishes loading, or a save lands), and when we return from the
	// text editor. Deliberately excludes `updatedFileContent` so our own visual
	// edits don't trigger a re-parse that would discard them.
	useEffect(() => {
		if (showSource) {
			return;
		}
		dispatch({ type: 'reset', source: bufferRef.current });
		if (pendingAddTable.current) {
			pendingAddTable.current = false;
			dispatch({ type: 'addTable' });
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [openedEntryContents, showSource]);

	// Push the regenerated schema into the shared buffer, or clear it when the
	// result matches the saved content (so merely opening the view never dirties
	// the file). The text editor owns the buffer while showing source.
	const serialized = useMemo(() => serializeSchema(doc), [doc]);
	useEffect(() => {
		if (showSource || readOnly) {
			return;
		}
		setContent(serialized === (openedEntryContents ?? '') ? undefined : serialized);
	}, [serialized, showSource, readOnly, openedEntryContents, setContent]);

	useListener(
		'SaveFile',
		() => {
			if (showSource || !openedEntry || isSavingFile || updatedFileContent === undefined) {
				return;
			}
			saveFile(
				{
					...instanceParams,
					file: openedEntry.path.split('/').slice(1).join('/'),
					payload: updatedFileContent,
					project: openedEntry.project,
				},
				openedEntry.path,
			);
		},
		[showSource, openedEntry, instanceParams, updatedFileContent, isSavingFile],
	);

	useListener(
		'RevertChanges',
		() => {
			if (showSource) {
				return;
			}
			setContent(undefined);
			dispatch({ type: 'reset', source: openedEntryContents ?? '' });
		},
		[showSource, openedEntryContents, setContent],
	);

	useListener(
		'AddSchemaTable',
		() => {
			if (showSource) {
				pendingAddTable.current = true;
				setShowSource(false);
			} else {
				dispatch({ type: 'addTable' });
			}
		},
		[showSource],
	);

	const tables = useMemo(() => documentTables(doc), [doc]);
	const typeNames = useMemo(() => tables.map(table => table.typeName).filter(Boolean), [tables]);
	const showPreservedHint = useMemo(() => hasUnmodeledContent(doc), [doc]);

	if (!openedEntry) {
		return null;
	}

	if (showSource) {
		return (
			<>
				<TextEditorView />
				{canUseVisual && (
					<Button
						type="button"
						variant="defaultOutline"
						size="sm"
						className="absolute top-11 right-4 z-10 bg-background shadow-md"
						onClick={() => setShowSource(false)}
					>
						<Table2Icon /> Visual editor
					</Button>
				)}
			</>
		);
	}

	return (
		<>
			<div className="mt-9 absolute inset-0 overflow-y-auto p-4 md:p-8">
				<div className="mx-auto flex max-w-4xl flex-col gap-4">
					<div className="pr-4">
						<h2 className="text-xl">Schema</h2>
						<p className="text-sm text-muted-foreground">
							Tables in <code>{openedEntry.name}</code>. Changes save back to the file.
						</p>
					</div>

					{tables.length === 0 && (
						<div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
							<p>No tables yet.</p>
							{!readOnly && <p className="mt-1 text-sm">Use “Add table” to define your first one.</p>}
						</div>
					)}

					{tables.map(table => (
						<TableCard
							key={table.id}
							table={table}
							typeNames={typeNames}
							readOnly={readOnly}
							defaultCollapsed={!table.id.startsWith('new-')}
							onChange={next => dispatch({ type: 'updateTable', id: table.id, table: next })}
							onRemove={() => dispatch({ type: 'removeTable', id: table.id })}
						/>
					))}

					{showPreservedHint && (
						<p className="text-xs text-muted-foreground italic">
							This file has other content (e.g. non-table definitions) that isn’t shown here. It’s preserved as-is —
							switch to “Edit as text” to see it.
						</p>
					)}
				</div>
			</div>
			<div className="absolute top-11 right-4 z-10 flex gap-2">
				{!readOnly && (
					<Button
						type="button"
						variant="positive"
						size="sm"
						className="shadow-md"
						onClick={() => dispatch({ type: 'addTable' })}
					>
						<PlusIcon /> Add table
					</Button>
				)}
				<Button
					type="button"
					variant="defaultOutline"
					size="sm"
					className="bg-background shadow-md"
					onClick={() => setShowSource(true)}
				>
					<CodeIcon /> Edit as text
				</Button>
			</div>
		</>
	);
}

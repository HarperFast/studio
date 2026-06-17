import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';

export interface EntryActions {
	/** Editable file (not a directory, not a read-only package). */
	canEditFile: boolean;
	/** New file / directory can be created relative to this entry. */
	canAddEntries: boolean;
	/** Entry is a `.graphql` schema that supports adding a table. */
	canAddTable: boolean;
	/** Entry can be deleted (or, for imported packages, removed). */
	canDeleteEntry: boolean;
	/** Entry belongs to a downloadable application. */
	canDownload: boolean;
	/** Imported read-only package that can be redeployed. */
	canRedeploy: boolean;
}

/**
 * Capability flags for a single file/directory entry, shared by the editor menu
 * bar ({@link ContentActions}) and the sidebar right-click context menu so the two
 * can't drift. Mirrors the gating previously inlined in ContentActions.
 */
export function useEntryActions(entry: DirectoryEntry | FileEntry | undefined): EntryActions {
	const { restrictPackageModification } = useEditorView();
	const canManageBrowseInstance = useInstanceBrowseManagePermission();

	const isReadOnlyPackage = !!entry?.package;
	const canEditFile = !!entry && !isDirectory(entry) && !isReadOnlyPackage && canManageBrowseInstance;
	const canAddEntries = !!entry && !isReadOnlyPackage && canManageBrowseInstance;
	const canAddTable = !!entry && entry.path.endsWith('.graphql') && canManageBrowseInstance;
	const canDeleteEntry = !restrictPackageModification && canManageBrowseInstance;
	const canDownload = !!entry?.project;
	const canRedeploy = isReadOnlyPackage && canManageBrowseInstance && !restrictPackageModification;

	return { canEditFile, canAddEntries, canAddTable, canDeleteEntry, canDownload, canRedeploy };
}

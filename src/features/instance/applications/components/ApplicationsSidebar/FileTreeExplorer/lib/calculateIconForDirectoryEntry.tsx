import { DirectoryEntry } from '@/features/instance/operations/queries/getComponents';
import { FileTypeIcon } from '../FileTypeIcon';
import { FolderIcon } from '../FolderIcon';
import { PackageIcon } from '../PackageIcon';
import { ProjectIcon } from '../ProjectIcon';

export function calculateIconForDirectoryEntry(directoryEntry: DirectoryEntry, open: boolean, setOpen: (value: boolean) => void, fileExtension: string | null) {
	if (directoryEntry.package) {
		return () => PackageIcon({ isOpen: open, toggleClosed: () => setOpen(!open) });
	} else if (directoryEntry.path && directoryEntry.path.split('/').length === 2) {
		return () => ProjectIcon({ isOpen: open, toggleClosed: () => setOpen(!open) });
	} else if (directoryEntry.entries) {
		return () => FolderIcon({ isOpen: open, toggleClosed: () => setOpen(!open) });
	} else {
		return () => FileTypeIcon({ extension: fileExtension });
	}
}

import { FolderIcon, FolderOpenIcon, PackageIcon, PackageOpenIcon } from 'lucide-react';
import { iconSharedClassName } from './constants';

export function DirectoryIcon({ opened, pkg }: { readonly opened?: boolean; readonly pkg?: boolean }) {
	const iconClassName = iconSharedClassName + 'w-4 h-4 shrink-0';

	if (pkg) {
		return opened
			? <PackageOpenIcon className={`${iconClassName} text-orange-600`} />
			: <PackageIcon className={`${iconClassName} text-orange-600`} />;
	}
	return opened
		? <FolderOpenIcon className={`${iconClassName} text-orange-400`} />
		: <FolderIcon className={`${iconClassName} text-orange-400`} />;
}

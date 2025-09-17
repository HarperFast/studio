import { cn } from '@/lib/cn';
import { collapsibleSharedClassName, expandableSharedClassName } from './constants';

export function FolderIcon({
	toggleClosed,
	isOpen,
}: {
	toggleClosed: () => void;
	isOpen: boolean;
}) {
	return (
		// NOTE: A11y on this is not good at all..... Need to refactor the file tree to make the file tree more accessible for ALL users.
		<div
			onClick={toggleClosed}
			onKeyDown={toggleClosed}
			className={cn(
				`folder-icon fas text-purple`,
				isOpen ? 'fa-folder-open' : 'fa-folder',
				isOpen ? collapsibleSharedClassName : expandableSharedClassName,
			)}
			tabIndex={0}
			aria-expanded={isOpen}
			aria-label={isOpen ? 'close folder' : 'open folder'}
		/>
	);
}

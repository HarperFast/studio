import { cn } from '@/lib/cn';
import { SyntheticEvent } from 'react';
import { collapsibleSharedClassName, expandableSharedClassName } from './constants';

export function FolderIcon({
	open,
	toggle,
}: {
	open: boolean;
	toggle: (e: SyntheticEvent) => void;
}) {
	return (
		// NOTE: A11y on this is not good at all..... Need to refactor the file tree to make the file tree more accessible for ALL users.
		<div
			onClick={toggle}
			onKeyDown={toggle}
			className={cn(
				`folder-icon fas text-purple`,
				open ? 'fa-folder-open' : 'fa-folder',
				open ? collapsibleSharedClassName : expandableSharedClassName,
			)}
			tabIndex={0}
			aria-expanded={open}
			aria-label={open ? 'close folder' : 'open folder'}
		/>
	);
}

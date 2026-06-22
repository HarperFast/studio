import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { cn } from '@/lib/cn';
import type { TreeItem } from 'react-complex-tree';
import type { TreeItemRenderContext } from 'react-complex-tree/src/types';

/**
 * Custom expand/collapse arrow renderer.
 *
 * The library's default arrow `onClick` both toggles expansion AND selects the
 * row (and focuses it), so you couldn't peek into a folder without yanking the
 * editor onto it. Here the arrow does one thing: toggle expansion. It never
 * selects or focuses, so the currently-open file in the editor stays put. We
 * also `preventDefault` the mousedown so the arrow never steals focus (which the
 * `setOpenedEntryFromFocusedItem` effect would otherwise turn into a selection).
 *
 * Non-folder rows render an inert spacer (see `pointer-events: none` in
 * file-explorer-modern.css) so a click there falls through to the row button and
 * still selects the file, while keeping the indentation aligned.
 *
 * The chevron markup mirrors the library default (same `rct-tree-item-arrow-path`
 * class) so the visuals are unchanged. The enlarged hit area lives in CSS.
 */
export function ItemArrow({ item, context }: {
	item: TreeItem<DirectoryEntry | FileEntry | undefined>;
	context: TreeItemRenderContext;
}) {
	if (!item.isFolder) {
		return <div className="rct-tree-item-arrow" aria-hidden />;
	}

	return (
		<div
			className={cn(
				'rct-tree-item-arrow',
				'rct-tree-item-arrow-isFolder',
				context.isExpanded && 'rct-tree-item-arrow-expanded',
			)}
			aria-hidden
			tabIndex={-1}
			onMouseDown={event => event.preventDefault()}
			onClick={(event) => {
				event.stopPropagation();
				context.toggleExpandedState();
			}}
		>
			{context.isExpanded
				? (
					<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
						<path
							fillRule="evenodd"
							clipRule="evenodd"
							d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"
							className="rct-tree-item-arrow-path"
						/>
					</svg>
				)
				: (
					<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
						<path
							fillRule="evenodd"
							clipRule="evenodd"
							d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
							className="rct-tree-item-arrow-path"
						/>
					</svg>
				)}
		</div>
	);
}

import { FolderInputIcon, FolderOpenIcon, MousePointerClickIcon, PanelTopIcon } from 'lucide-react';
import { ReactNode } from 'react';

/**
 * Shown in the editor area when a folder with no README is selected. Rather than
 * leaving the space blank, it quietly hints at what you can do with a folder.
 * Deliberately low-emphasis (muted) — it's a hint, not the focus.
 */
export function DirectoryPlaceholder({ name }: { name?: string }) {
	return (
		<div className="max-w-3xl px-6 pt-10 text-muted-foreground select-none">
			<div className="flex items-center gap-2 text-lg font-medium">
				<FolderOpenIcon className="size-5 shrink-0" />
				<span className="truncate">{name}</span>
			</div>
			<p className="mt-2 text-sm">
				This folder doesn&apos;t have a README. A few things you can do with it:
			</p>
			<ul className="mt-4 space-y-2 text-sm">
				<Hint icon={<FolderInputIcon className="size-4 shrink-0" />}>
					Drag and drop files or folders onto it to move them in.
				</Hint>
				<Hint icon={<PanelTopIcon className="size-4 shrink-0" />}>
					Use the toolbar above to add a file or directory, rename, or download.
				</Hint>
				<Hint icon={<MousePointerClickIcon className="size-4 shrink-0" />}>
					Right-click the folder for more actions.
				</Hint>
			</ul>
		</div>
	);
}

function Hint({ icon, children }: { icon: ReactNode; children: ReactNode }) {
	return (
		<li className="flex items-center gap-2">
			{icon}
			<span>{children}</span>
		</li>
	);
}

import { EyeOffIcon, FileIcon, FolderOpenIcon } from 'lucide-react';

export function UnreadableEntryPlaceholder(
	{ name, isFolder, message = 'This read-only connection can list applications but not open their files.' }: {
		name: string;
		isFolder: boolean;
		message?: string;
	},
) {
	const Icon = isFolder ? FolderOpenIcon : FileIcon;
	return (
		<div className="max-w-3xl px-6 pt-10 text-muted-foreground select-none">
			<div className="flex items-center gap-2 text-lg font-medium">
				<Icon className="size-5 shrink-0" />
				<span className="truncate">{name}</span>
			</div>
			<p className="mt-2 flex items-center gap-2 text-sm">
				<EyeOffIcon className="size-4 shrink-0" />
				{message}
			</p>
		</div>
	);
}

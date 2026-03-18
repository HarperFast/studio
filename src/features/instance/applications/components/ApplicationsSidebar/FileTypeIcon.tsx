import {
	CodeIcon,
	FileCode2Icon,
	FileIcon,
	FileImageIcon,
	FileJsonIcon,
	FileTypeIcon as LucideFileTypeIcon,
} from 'lucide-react';

export function FileTypeIcon({ extension }: { readonly extension: string | null }) {
	const iconClassName = 'w-4 h-4 mr-2 shrink-0';

	switch (extension) {
		case 'js':
		case 'jsx':
		case 'cjs':
			return <FileCode2Icon className={`${iconClassName} text-yellow-500`} />;
		case 'ts':
		case 'tsx':
			return <FileCode2Icon className={`${iconClassName} text-blue-500`} />;
		case 'yaml':
		case 'yml':
			return <FileIcon className={iconClassName} />;
		case 'css':
			return <FileIcon className={`${iconClassName} text-blue-500`} />;
		case 'html':
			return <CodeIcon className={iconClassName} />;
		case 'json':
			return <FileJsonIcon className={iconClassName} />;
		case 'png':
		case 'jpg':
		case 'jpeg':
		case 'gif':
			return <FileImageIcon className={iconClassName} />;
		case 'svg':
			return <LucideFileTypeIcon className={iconClassName} />;
		case 'vue':
			return <FileCode2Icon className={`${iconClassName} text-green-500`} />;
		default:
			return <FileIcon className={iconClassName} />;
	}
}

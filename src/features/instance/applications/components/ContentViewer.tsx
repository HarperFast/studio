import { Button } from '@/components/ui/button';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useReadMeUrlTransformer } from '@/features/instance/applications/lib/readMeUrlTransform';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { hasImageFileExtension } from '@/lib/string/hasImageFileExtension';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { CopyIcon } from 'lucide-react';
import Markdown from 'react-markdown';
import { newApplication } from './ApplicationsSidebar/specialItems';
import { NewApplication } from './NewApplication';
import { TextEditorView } from './TextEditorView';
import './directoryReadMe.css';

export function ContentViewer() {
	const { openedEntry, openedEntryContents } = useEditorView();
	const urlTransform = useReadMeUrlTransformer(openedEntry?.project);

	if (openedEntry?.path === newApplication) {
		return <NewApplication />;
	}

	if (isDirectory(openedEntry)) {
		return (
			<div className="directoryReadMe max-w-3xl">
				<Markdown urlTransform={urlTransform} components={{ code: MarkdownCode }}>{openedEntryContents}</Markdown>
			</div>
		);
	}

	if (hasImageFileExtension(openedEntry?.name)) {
		return (
			<div className="mt-9 absolute top-0 right-0 bottom-0 left-0">
				<img
					className="w-full h-full object-contain p-20"
					alt={openedEntry?.name}
					src={`data:image/${parseFileExtension(openedEntry?.name)};base64,${openedEntryContents}`}
				/>
			</div>
		);
	} else {
		return <TextEditorView />;
	}
}

function MarkdownCode({
	inline,
	className,
	children,
}: {
	inline?: boolean;
	className?: string;
	children?: unknown;
}) {
	const code = String(children ?? '');
	const [copy] = useCopyToClipboard(code);

	if (inline || !code.includes('\n')) {
		return <code className={className}>{children as any}</code>;
	}
	return (
		<code className="relative">
			<Button className="absolute top-2 right-2" type="button" variant="default" size="sm" onClick={copy}>
				<CopyIcon className="w-4 h-4" />
			</Button>
			{code}
		</code>
	);
}

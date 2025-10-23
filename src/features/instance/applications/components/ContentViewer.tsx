import { Loading } from '@/components/Loading';
import { TextEditorView } from '@/features/instance/applications/components/TextEditorView';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import Markdown from 'react-markdown';

export function ContentViewer() {
	const { openedEntry, openedEntryContents } = useEditorView();

	if (isDirectory(openedEntry)) {
		if (openedEntryContents !== undefined) {
			return <div className="directoryReadMe max-w-4xl">
				<Markdown>
					{openedEntryContents}
				</Markdown>
			</div>;
		}
		return <span></span>;
	}
	if (openedEntryContents === undefined) {
		return <Loading />;
	}
	return <TextEditorView />;
}

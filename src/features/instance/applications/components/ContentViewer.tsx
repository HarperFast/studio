import { newApplication } from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
import { ContentActions } from '@/features/instance/applications/components/ContentActions';
import { TextEditorView } from '@/features/instance/applications/components/TextEditorView';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { NewApplication } from '@/features/instance/applications/modals/NewApplication';
import Markdown from 'react-markdown';
import './directory-read-me.css';

export function ContentViewer() {
	const { openedEntry, openedEntryContents } = useEditorView();

	if (openedEntry?.path === newApplication) {
		return <NewApplication />;
	}

	if (isDirectory(openedEntry)) {
		return <div className="directoryReadMe max-w-3xl">
			<ContentActions />
			<Markdown>{openedEntryContents}</Markdown>
		</div>;
	}

	return <TextEditorView />;
}

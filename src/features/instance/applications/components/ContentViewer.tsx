import { newApplication } from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
import { ContentActions } from '@/features/instance/applications/components/ContentActions';
import { TextEditorView } from '@/features/instance/applications/components/TextEditorView';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { CreateOrImportAnApplication } from '@/features/instance/applications/modals/CreateOrImportAnApplication';
import Markdown from 'react-markdown';

export function ContentViewer() {
	const { openedEntry, openedEntryContents } = useEditorView();

	if (openedEntry?.path === newApplication) {
		return <CreateOrImportAnApplication />;
	}

	if (isDirectory(openedEntry)) {
		return <div className="directoryReadMe max-w-4xl">
			<ContentActions />
			<Markdown>{openedEntryContents}</Markdown>
		</div>;
	}
	return <TextEditorView />;
}

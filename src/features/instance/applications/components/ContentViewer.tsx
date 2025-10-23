import { Loading } from '@/components/Loading';
import { newApplication } from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
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

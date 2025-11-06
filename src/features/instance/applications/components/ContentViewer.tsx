import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useReadMeUrlTransformer } from '@/features/instance/applications/lib/readMeUrlTransform';
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
		return <div className="directoryReadMe max-w-3xl">
			<Markdown urlTransform={urlTransform}>{openedEntryContents}</Markdown>
		</div>;
	}

	return <TextEditorView />;
}

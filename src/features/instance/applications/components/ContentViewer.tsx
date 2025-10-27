import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { useEditorView } from '@/features/instance/applications/hooks/useEditorView';
import { useReadMeUrlTransformer } from '@/features/instance/applications/lib/readMeUrlTransform';
import { NewApplication } from '@/features/instance/applications/modals/NewApplication';
import Markdown from 'react-markdown';
import { newApplication } from './ApplicationsSidebar/specialItems';
import { ContentActions } from './ContentActions';
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
			<ContentActions />
			<Markdown urlTransform={urlTransform}>{openedEntryContents}</Markdown>
		</div>;
	}

	return <TextEditorView />;
}

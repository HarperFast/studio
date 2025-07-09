import { useContext } from 'react';
import { EditorViewContext, EditorViewContextValue } from '@/features/instance/applications/context/EditorViewContext';

export function useEditorView() {
	return useContext(EditorViewContext) as EditorViewContextValue;
}

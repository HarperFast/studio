import { EditorViewContext, EditorViewContextValue } from '@/features/instance/applications/context/EditorViewContext';
import { useContext } from 'react';

export function useEditorView() {
	return useContext(EditorViewContext) as EditorViewContextValue;
}

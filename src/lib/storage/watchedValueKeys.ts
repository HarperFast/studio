export interface WatchedValuesTypeMap {
	RevertChanges: true;
	SaveFile: true;
	NavigateBack: true;
	NavigateForward: true;
	CanNavigateBack: boolean;
	CanNavigateForward: boolean;
	RunEditorAction: string;
	ShowAddDirectoryOrFileModalType: 'file' | 'directory' | false;
	AddSchemaTable: true;
	ShowDeleteDirectoryOrFileModal: boolean;
	ShowDownloadApplicationModal: boolean;
	ShowRedeployApplicationModal: boolean;
	ShowRenameFileModal: boolean;
	ShowDeleteDatabase: boolean;
	ShowDeleteTable: boolean;
	'Session:{key}': unknown;
	ReloadApplicationRootEntries: true;
	FocusEditor: true;
	FocusFileTree: true;
}

export type WatchedValueKeys = keyof WatchedValuesTypeMap;

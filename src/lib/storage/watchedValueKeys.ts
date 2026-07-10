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
	/** True while the visual schema editor has validation errors that must block Save. */
	EditorSaveBlocked: boolean;
	ShowDeleteDirectoryOrFileModal: boolean;
	ShowDownloadApplicationModal: boolean;
	ShowRedeployApplicationModal: boolean;
	ShowRenameFileModal: boolean;
	// Database/table action triggers carry their target in the payload so the (single, always-mounted)
	// modal hub can act on any tree item -- not just the currently-open table. `false` means "closed".
	ShowDeleteDatabase: { databaseName: string } | false;
	ShowDeleteTable: { databaseName: string; tableName: string } | false;
	ShowCreateTable: { databaseName?: string } | false;
	ShowAddTableRecords: { databaseName: string; tableName: string } | false;
	ShowImportData: { databaseName?: string; tableName?: string } | false;
	'Session:{key}': unknown;
	ReloadApplicationRootEntries: true;
	FocusEditor: true;
	FocusFileTree: true;
}

export type WatchedValueKeys = keyof WatchedValuesTypeMap;

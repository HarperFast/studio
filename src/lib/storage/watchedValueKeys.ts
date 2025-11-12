export interface WatchedValuesTypeMap {
	RevertChanges: true;
	SaveFile: true;
	ShowAddDirectoryOrFileModalType: 'file' | 'directory' | false;
	ShowAddSchemaModal: boolean;
	ShowDeleteDirectoryOrFileModal: boolean;
	ShowRedeployApplicationModal: boolean;
	ShowRenameFileModal: boolean;
	ShowDeleteDatabase: boolean;
	ShowDeleteTable: boolean;
	'Session:{key}': unknown;
}

export type WatchedValueKeys = keyof WatchedValuesTypeMap;

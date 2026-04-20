export interface WatchedValuesTypeMap {
	RevertChanges: true;
	SaveFile: true;
	ShowAddDirectoryOrFileModalType: 'file' | 'directory' | false;
	ShowNewTableModal: boolean;
	ShowDeleteDirectoryOrFileModal: boolean;
	ShowDownloadApplicationModal: boolean;
	ShowRedeployApplicationModal: boolean;
	ShowRenameFileModal: boolean;
	ShowDeleteDatabase: boolean;
	ShowDeleteTable: boolean;
	'Session:{key}': unknown;
	ReloadApplicationRootEntries: true;
}

export type WatchedValueKeys = keyof WatchedValuesTypeMap;

export interface WatchedValuesTypeMap {
	RevertChanges: true;
	SaveFile: true;
	ShowAddDirectoryOrFileModalType: 'file' | 'directory' | false;
	ShowDeleteDirectoryOrFileModal: boolean;
	ShowRedeployApplicationModal: boolean;
	ShowRenameFileModal: boolean;
	'Session:{key}': unknown;
}

export type WatchedValueKeys = keyof WatchedValuesTypeMap;

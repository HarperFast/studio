export interface WatchedValuesTypeMap {
	RevertChanges: true;
	SaveFile: true;
	ShowAddDirectoryOrFileModalType: 'file' | 'directory' | false;
	ShowDeleteDirectoryOrFileModal: boolean;
	ShowRedeployApplicationModal: boolean;
	ShowRenameFileModal: boolean;
}

export type WatchedValueKeys = keyof WatchedValuesTypeMap;

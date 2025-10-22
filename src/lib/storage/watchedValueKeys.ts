export interface WatchedValuesTypeMap {
	ShowAddDirectoryOrFileModalType: 'file' | 'directory' | false;
	ShowDeleteDirectoryOrFileModal: boolean;
	ShowRedeployApplicationModal: boolean;
	ShowRenameFileModal: boolean;
}

export type WatchedValueKeys = keyof WatchedValuesTypeMap;

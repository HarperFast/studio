import React from 'react';

import NameInput from './NameInput';

export default function NameProjectFolderWindow({ active, onConfirm, onCancel, selectedFolder }) {
	return !active ? null : (
		<div className="content-window">
			<h4 className="mb-5">
				Add Folder To <span className="text-success">{selectedFolder.path.replace('components', '')}</span>
			</h4>
			<NameInput
				type="folder"
				selectedFolder={selectedFolder}
				onEnter={onConfirm}
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>
		</div>
	);
}

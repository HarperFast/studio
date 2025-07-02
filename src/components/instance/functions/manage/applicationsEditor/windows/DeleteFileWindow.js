import React from 'react';
import ButtonWithLoader from '../../../../../shared/ButtonWithLoader';

export default function DeleteFileWindow({ active, selectedFile, onConfirm, onCancel }) {
	if (!active) {
		return null;
	}

	const { path } = selectedFile;
	const pathArray = path.split(`/`);
	const fileName = pathArray.pop();
	const projectPath = pathArray.slice(1);

	return (
		<div className="content-window">
			<h4 className="mb-5">
				Delete <span className="text-danger">{fileName}</span> File
			</h4>
			<ButtonWithLoader className="btn btn-danger btn-block delete-button mt-2" onClick={onConfirm}>
				Delete
			</ButtonWithLoader>
			<button type="button" className="btn btn-outline-danger btn-block mt-2" onClick={onCancel}>
				Cancel
			</button>
			<div className="mt-5">
				Are you sure you want to delete <span className="text-danger">{fileName}</span> from{' '}
				<span className="text-danger">{projectPath.join(`/`)}</span>?
			</div>
		</div>
	);
}

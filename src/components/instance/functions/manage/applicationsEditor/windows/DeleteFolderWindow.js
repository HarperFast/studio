import React from 'react';
import ButtonWithLoader from '../../../../../shared/ButtonWithLoader';

export default function DeleteFolderWindow({ active, selectedFolder, onConfirm, onCancel }) {
	if (!active) {
		return null;
	}

	// the currently selectedFolder can be unselected from the file menu while this
	// window is open
	if (!selectedFolder) {
		return null;
	}

	const pathSegmentsFromRoot = selectedFolder.path.split('/');
	const isProjectFolder = pathSegmentsFromRoot.length === 2;
	const projectSubdir = isProjectFolder ? null : pathSegmentsFromRoot.slice(-1)[0];

	return (
		<div className="content-window">
			<h4 className="mb-5">
				Delete <span className="text-danger">{isProjectFolder ? selectedFolder?.project : projectSubdir}</span>{' '}
				{isProjectFolder ? 'Project' : 'Folder'}
			</h4>
			<ButtonWithLoader className="btn btn-danger btn-block delete-button mt-2" onClick={onConfirm}>
				Delete
			</ButtonWithLoader>
			<button type="button" className="btn btn-outline-danger btn-block mt-2" onClick={onCancel}>
				Cancel
			</button>
			<div className="mt-5">
				{isProjectFolder ? (
					<div>
						Are you sure you want to delete project <span className="text-danger">{selectedFolder?.project}</span> ?
					</div>
				) : (
					<div>
						Are you sure you want to delete the folder <span className="text-danger">{projectSubdir}</span> from{' '}
						<span className="text-danger">{selectedFolder?.project}</span>?
					</div>
				)}
			</div>
		</div>
	);
}

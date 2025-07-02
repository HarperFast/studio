import React from 'react';
import ButtonWithLoader from '../../../../../shared/ButtonWithLoader';

export default function DeletePackageWindow({ active, selectedPackage, onConfirm, onCancel }) {
	if (!active) {
		return null;
	}

	const packageName = selectedPackage.name;

	return (
		<div className="content-window">
			<h4 className="mb-5">
				Delete <span className="text-danger">{packageName}</span> Package
			</h4>
			<ButtonWithLoader className="btn btn-danger btn-block delete-button mt-2" onClick={onConfirm}>
				Delete
			</ButtonWithLoader>
			<button type="button" className="btn btn-outline-danger btn-block mt-2" onClick={onCancel}>
				Cancel
			</button>
			<div className="mt-5">
				Are you sure you want to delete <span className="text-danger">{packageName}</span>?
			</div>
		</div>
	);
}

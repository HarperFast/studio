import React from 'react';

import NameInput from './NameInput';

export default function NameFileWindow({ active, onConfirm, onCancel }) {
	return !active ? null : (
		<div className="content-window">
			<h4 className="mb-5">Add A New File</h4>
			<NameInput type="file" onEnter={onConfirm} onConfirm={onConfirm} onCancel={onCancel} />
		</div>
	);
}

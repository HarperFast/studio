import React from 'react';
import NameInput from './NameInput';
import { isValidProjectName } from './lib';

export default function NameProjectWindow({ active, onConfirm, onCancel }) {
	return !active ? null : (
		<div className="content-window">
			<h4 className="mb-5">Default Template Application</h4>
			<NameInput
				type="project"
				validate={isValidProjectName}
				onEnter={onConfirm}
				onConfirm={onConfirm}
				onCancel={onCancel}
			/>
		</div>
	);
}

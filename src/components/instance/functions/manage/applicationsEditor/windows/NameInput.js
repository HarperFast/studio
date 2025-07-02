import React, { useState } from 'react';
import cn from 'classnames';
import ButtonWithLoader from '../../../../../shared/ButtonWithLoader';

export default function NameInput({ onCancel, onConfirm, onEnter, value, type, validate = () => true }) {
	const [name, setName] = useState(value || '');
	const [isValidName, setIsValidName] = useState(false);

	function handleKeyDown(e) {
		if (e.key === 'Enter') {
			onEnter(e.target.value);
		} else if (e.key === 'Esc') {
			onCancel();
		}
	}

	return (
		<>
			<input
				className={cn('w-100 text-center', { invalid: name.length > 0 && !isValidName })}
				onChange={(e) => {
					setName(e.target.value);
					setIsValidName(validate(e.target.value));
				}}
				onKeyDown={handleKeyDown}
				value={name}
				placeholder={`name for your new ${type}`}
				title={`name for your new ${type}`}
			/>
			<i
				title="error: name must contain only alphanumeric characters, dashes and underscores."
				className={cn('text-danger fa fa-warning', { hidden: isValidName || name.length === 0 })}
			/>
			<ButtonWithLoader
				disabled={!isValidName}
				className="btn btn-success btn-block mt-3"
				onClick={() => onConfirm(name)}
			>
				OK
			</ButtonWithLoader>
			<button type="button" className="btn btn-outline-success btn-block mt-2" onClick={onCancel}>
				Cancel
			</button>

			{name.length > 0 && !isValidName && (
				<div className="validation-message mt-5">
					error: name must contain only alphanumeric characters, dashes and underscores.
				</div>
			)}
		</>
	);
}

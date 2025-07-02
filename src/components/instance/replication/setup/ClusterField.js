import React, { useState } from 'react';
import { Input } from 'reactstrap';
import cn from 'classnames';

function ClusterField({
	label,
	value,
	type = 'text',
	max = null,
	min = null,
	editable = false,
	handleChange,
	validator = () => true,
	errorMessage = 'is required',
	addSpace = true,
	valid = false,
}) {
	const [error, setError] = useState(null);

	return editable ? (
		<>
			{addSpace && <br />}
			<div className={cn('text-nowrap mt-2 mb-1', { 'text-danger': error })}>
				{label} {error}
			</div>
			<Input
				id={`cluster-field-${label}`}
				type={type}
				className={cn('cluster-field form-control', { error })}
				max={max}
				min={min}
				defaultValue={value}
				valid={valid}
				onChange={(e) => handleChange(e.target.value)}
				onBlur={(e) => {
					const isValid = validator(e.target.value);
					setError(isValid ? null : errorMessage);
				}}
			/>
		</>
	) : (
		<>
			{addSpace && <br />}
			<div className="text-nowrap mt-2 mb-1">{label}</div>
			<Input readOnly valid type={type} value={value} />
		</>
	);
}

export default ClusterField;

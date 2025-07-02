import React from 'react';
import cn from 'classnames';

export default function FormValidationError({ error, style = {} }) {
	return (
		<div style={style} className={cn('form-validation-error', { error })}>
			{error || 'input is valid'}
		</div>
	);
}

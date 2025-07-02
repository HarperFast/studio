import React from 'react';

function Alert({ message, options, close }) {
	return (
		<button type="button" tabIndex="0" className={`alert ${options.type}`} onClick={close}>
			<div className="text-white icon">
				{options.type === 'info' && <i className="fa fa-lg fa-info-circle" />}
				{options.type === 'success' && <i className="fa fa-lg fa-check-circle" />}
				{options.type === 'error' && <i className="fa fa-lg fa-exclamation-circle" />}
			</div>
			<div className="text-white message">{message}</div>
		</button>
	);
}

export default Alert;

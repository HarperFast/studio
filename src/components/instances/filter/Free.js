import React from 'react';

function Free({ local }) {
	return (
		<div className="free-instances text-nowrap text-white">
			<i className="fa fa-dollar-sign me-2" />
			Free {local && <span className="ms-1">Enterprise</span>}
		</div>
	);
}

export default Free;

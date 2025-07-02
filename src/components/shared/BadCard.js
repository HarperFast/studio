import React from 'react';

function BadCard() {
	return (
		<div className="text-danger">
			<i>Your most recent card payment failed. Please update your card below.</i>
			<hr className="mt-3 mb-2" />
		</div>
	);
}

export default BadCard;

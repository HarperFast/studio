import React from 'react';
import { Button } from 'reactstrap';

function ActionConnectionOpen({ handleRemoveNode, loading }) {
	return (
		<Button
			color="purple"
			className="round"
			title="Disconnect From This Instance"
			disabled={loading}
			onClick={handleRemoveNode}
		>
			<i className={`fa ${loading ? 'fa-spin fa-spinner' : 'fa-minus'} text-white`} />
		</Button>
	);
}

export default ActionConnectionOpen;

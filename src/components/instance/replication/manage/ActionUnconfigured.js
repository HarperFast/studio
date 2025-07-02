import React from 'react';
import { Button } from 'reactstrap';

function ActionUnconfigured({ handleConfigureNode, loading }) {
	return (
		<Button
			color="success"
			className="round me-1"
			title="Enable Clustering"
			disabled={loading}
			onClick={handleConfigureNode}
		>
			<i className={`fa ${loading ? 'fa-spin fa-spinner' : 'fa-share'} text-white`} />
		</Button>
	);
}

export default ActionUnconfigured;

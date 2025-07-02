import React from 'react';
import { Button } from 'reactstrap';

function ActionNoConnection({ handleAddNode, loading }) {
	return (
		<Button
			color="purple"
			className="round"
			title="Connect To This Instance"
			disabled={loading}
			onClick={handleAddNode}
		>
			<i className={`fa ${loading ? 'fa-spin fa-spinner' : 'fa-plus'} text-white`} />
		</Button>
	);
}

export default ActionNoConnection;

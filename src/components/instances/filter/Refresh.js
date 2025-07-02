import React, { useState, useCallback } from 'react';
import { Button } from 'reactstrap';

function Refresh({ refreshInstances }) {
	const [loading, setLoading] = useState(false);

	const handleClick = useCallback(() => {
		setLoading(true);
		refreshInstances();
		setTimeout(() => setLoading(false), 250);
	}, [setLoading, refreshInstances]);

	return (
		<Button className="refresh-instances" color="link" onClick={handleClick}>
			<i className={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'} me-2`} />
			<span className="d-none d-md-inline-block">refresh</span>
		</Button>
	);
}

export default Refresh;

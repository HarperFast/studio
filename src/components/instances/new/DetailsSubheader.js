import { Button } from 'reactstrap';
import React from 'react';

function DetailsSubheader({ hasPrepaid, newInstance, setNewInstance, toggleValue }) {
	return hasPrepaid || newInstance[toggleValue] ? (
		<span>
			<div className="d-inline align-top me-2">show prepaid options:</div>
			<Button color="link" onClick={() => setNewInstance({ ...newInstance, [toggleValue]: !newInstance[toggleValue] })}>
				<i className={`fa fa-lg text-lightpurple fa-toggle-${newInstance[toggleValue] ? 'on' : 'off'}`} />
			</Button>
		</span>
	) : (
		<span>scroll for more</span>
	);
}

export default DetailsSubheader;

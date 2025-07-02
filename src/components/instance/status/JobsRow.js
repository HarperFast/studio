import React from 'react';
import { Row, Col } from 'reactstrap';

import isObject from '../../../functions/util/isObject';

function JobsRow({ end_datetime, start_datetime, status, message }) {
	return (
		<div className="item-row">
			<Row>
				<Col xs="3" className={`text-nowrap ${status.toLowerCase()}`}>
					{status}
				</Col>
				<Col xs="3" className="text-nowrap">
					{new Date(start_datetime).toLocaleDateString()}
				</Col>
				<Col xs="3" className="text-nowrap">
					{new Date(start_datetime).toLocaleTimeString()}
				</Col>
				<Col xs="3" className="text-nowrap">
					{new Date(end_datetime).toLocaleTimeString()}
				</Col>
				<Col xs="12" className="mt-1">
					{isObject(message) ? JSON.stringify(message) : message}
				</Col>
			</Row>
		</div>
	);
}

export default JobsRow;

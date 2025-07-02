import React from 'react';
import { Row, Col } from 'reactstrap';

import isObject from '../../../functions/util/isObject';

function AlarmsRow({ date, type, message }) {
	return (
		<div className="item-row">
			<Row>
				<Col xs="3" className="text-danger text-nowrap">
					{type}
				</Col>
				<Col xs="9" className="text-nowrap">
					{new Date(date).toLocaleString()}
				</Col>
				<Col xs="12" className="mt-1">
					{isObject(message) ? JSON.stringify(message) : message}
				</Col>
			</Row>
		</div>
	);
}

export default AlarmsRow;

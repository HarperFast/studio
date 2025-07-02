import React from 'react';
import { Row, Col } from 'reactstrap';

import isObject from '../../../functions/util/isObject';

function LogsRow({ onRowClick, level, timestamp, message, tags, thread }) {
	return (
		<Row xs="12" md="12" className="item-row" onClick={onRowClick}>
			<Col xs="2" md="1" className={`text-nowrap ${level?.toLowerCase()}`}>
				{level?.toUpperCase() || 'UNKNOWN'}
			</Col>
			<Col xs="2" md="2" lg="1">
				{new Date(timestamp || null).toLocaleDateString()}
			</Col>
			<Col xs="2" md="2" lg="1">
				{new Date(timestamp || null).toLocaleTimeString()}
			</Col>
			<Col xs="2" md="1" lg="1">
				{thread}
			</Col>
			<Col xs="2" md="2" lg="1">
				{tags?.join(', ')}
			</Col>
			<Col xs="2" md="4" lg="7">
				{isObject(message) && message.error ? (
					message.error
				) : (
					<pre>
						<code>{message}</code>
					</pre>
				)}
			</Col>
		</Row>
	);
}

export default LogsRow;

import React from 'react';
import { Col, Row } from 'reactstrap';

function CardFrontStatusRow({ label, value, textClass = '', isReady, bottomDivider = false }) {
	return (
		<Row className="card-front-status-row text-darkgrey">
			<Col xs="4">{label}</Col>
			<Col xs="8" className={textClass}>
				{isReady ? value : ''}
			</Col>
			{bottomDivider && (
				<Col xs="12">
					<hr />
				</Col>
			)}
		</Row>
	);
}

export default CardFrontStatusRow;

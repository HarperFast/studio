import { Col, Row, Card, CardBody } from 'reactstrap';
import React from 'react';

function ChangeSummary({ which, compute, storage, total }) {
	return (
		<Card className="my-3">
			<CardBody className="p-2 text-small">
				<Row>
					<Col xs="6" className="text-nowrap">
						Compute
						{which === 'compute' && ' (new)'}
					</Col>
					<Col xs="6" className="text-nowrap text-end text-truncate">
						{compute}
					</Col>
					<Col xs="12">
						<hr className="my-1" />
					</Col>
				</Row>
				<Row>
					<Col xs="6" className="text-nowrap">
						Storage
						{which === 'storage' && ' (new)'}
					</Col>
					<Col xs="6" className="text-nowrap text-end text-truncate">
						{storage}
					</Col>
					<Col xs="12">
						<hr className="my-1" />
					</Col>
				</Row>
				<Row>
					<Col xs="6" className="text-nowrap">
						<b>New Total</b>
					</Col>
					<Col xs="6" className="text-nowrap text-end text-truncate">
						<b>{total}</b>
					</Col>
				</Row>
			</CardBody>
		</Card>
	);
}

export default ChangeSummary;

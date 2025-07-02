import React from 'react';
import { Card, CardBody } from 'reactstrap';

function Unpaid() {
	return (
		<Card color="danger" className="mb-4">
			<CardBody className="text-center text-danger">This Organization Will Not Be Billed</CardBody>
		</Card>
	);
}

export default Unpaid;

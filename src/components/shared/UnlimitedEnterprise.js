import React from 'react';
import { Card, CardBody } from 'reactstrap';

function UnlimitedEnterprise() {
	return (
		<Card color="danger" className="mb-4">
			<CardBody className="text-center text-danger">
				This Organization Will Not Be Billed for Enterprise Instances
			</CardBody>
		</Card>
	);
}

export default UnlimitedEnterprise;

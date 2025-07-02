import React from 'react';
import { Card, CardBody, Col } from 'reactstrap';

function NoInstancesCard() {
	return (
		<Col xs="12" md="6" lg="4" xl="3" className="mb-4">
			<Card tabIndex="0" id="noInstancesCard" title="No Instances Yet" className="instance new">
				<CardBody className="d-flex flex-column align-items-center justify-content-center">
					<span>This Organization Has No Instances</span>
					<div className="my-4">
						<i className="fa fa-2x fa-exclamation-circle" />
					</div>
					<span>Organization Admins Must Add Them</span>
				</CardBody>
			</Card>
		</Col>
	);
}

export default NoInstancesCard;

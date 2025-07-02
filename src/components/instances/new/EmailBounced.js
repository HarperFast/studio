import React from 'react';

import { Button, Card, CardBody, Col, Row } from 'reactstrap';
import { useNavigate, useParams } from 'react-router-dom';

function EmailBounced() {
	const navigate = useNavigate();
	const { customer_id } = useParams();

	return (
		<Card>
			<CardBody>
				<div className="p-4 pb-0 text-center">
					<b>Unable to Create New Instance</b>
					<br />
					<br />
					Your email address seems to be unreachable. Please update it to ensure billing, upgrade, and other critical
					system announcements reach you.
				</div>
				<Row>
					<Col sm="6">
						<Button
							id="cancelNewInstance"
							onClick={() => navigate(`/o/${customer_id}/instances`)}
							title="Cancel New Org"
							block
							className="mt-2"
							color="grey"
						>
							Cancel
						</Button>
					</Col>
					<Col sm="6">
						<Button
							id="updateEmail"
							onClick={() => navigate('/profile')}
							title="Update My Email"
							block
							className="mt-2"
							color="danger"
						>
							Update My Email
						</Button>
					</Col>
				</Row>
			</CardBody>
		</Card>
	);
}
export default EmailBounced;

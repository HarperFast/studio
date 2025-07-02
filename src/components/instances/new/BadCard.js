import React from 'react';

import { Button, Card, CardBody, Col, Row } from 'reactstrap';
import { useNavigate, useParams } from 'react-router-dom';

import VisitCard from '../../shared/VisitCard';

function BadCard() {
	const navigate = useNavigate();
	const { customer_id } = useParams();

	return (
		<Card>
			<CardBody>
				<div className="p-4 pb-0 text-center">
					<b>The Credit Card On File Has An Issue</b>
					<br />
					<br />
					Please update it to proceed, as well as to ensure uninterrupted service for this organization&apos;s existing
					instances.
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
						<VisitCard
							label="Update Credit Card"
							onClick={() => navigate(`/o/${customer_id}/billing?returnURL=/o/${customer_id}/instances/new`)}
						/>
					</Col>
				</Row>
			</CardBody>
		</Card>
	);
}
export default BadCard;

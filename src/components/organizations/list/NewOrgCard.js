import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Col } from 'reactstrap';
import { ErrorBoundary } from 'react-error-boundary';

import addError from '../../../functions/api/lms/addError';
import ErrorFallback from '../../shared/ErrorFallback';

function NewOrgCard() {
	const navigate = useNavigate();

	const handleClick = () => {
		if (window._kmq) window._kmq.push(['record', 'clicked new org card']);
		navigate('/organizations/new');
	};

	return (
		<Col xs="12" md="6" lg="4" xl="3" className="mb-4">
			<ErrorBoundary
				onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
				FallbackComponent={ErrorFallback}
			>
				<Card
					tabIndex="0"
					id="newOrgCard"
					title="Add New Organization"
					className="instance new"
					onKeyDown={(e) => e.keyCode !== 13 || handleClick()}
					onClick={handleClick}
				>
					<CardBody className="d-flex flex-column align-items-center justify-content-center">
						<span>Create A New Organization</span>
						<div className="my-4">
							<i className="fa fa-2x fa-plus-circle new-org-plus" />
						</div>
						<span>With Its Own Instances And Billing</span>
					</CardBody>
				</Card>
			</ErrorBoundary>
		</Col>
	);
}

export default NewOrgCard;

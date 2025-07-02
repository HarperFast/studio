import React from 'react';
import { Button, Card, CardBody, Col, Row } from 'reactstrap';

function ErrorFallback({ error, componentStack, resetErrorBoundary, extraClass = undefined }) {
	return (
		<div className="d-flex justify-content-center align-items-center auth-centered-container">
			<Card className={`error-boundary mb-3 w-400 ${extraClass}`}>
				<CardBody>
					<b>Component Error {new Date().toLocaleTimeString()}</b>
					<hr className="my-1" />
					<div className="error-message">{error.message}</div>
					<hr className="my-1" />
					<div className="stack-trace">
						<pre>{componentStack}</pre>
					</div>
					<Row>
						<Col>
							<Button
								color="danger"
								block
								href="https://harperdbhelp.zendesk.com/hc/en-us/requests/new"
								target="_blank"
								rel="noopener noreferrer"
							>
								Create A Support Ticket
							</Button>
						</Col>
						<Col>
							<Button color="success" block onClick={resetErrorBoundary}>
								Retry Component Load
							</Button>
						</Col>
					</Row>
				</CardBody>
			</Card>
		</div>
	);
}

export default ErrorFallback;

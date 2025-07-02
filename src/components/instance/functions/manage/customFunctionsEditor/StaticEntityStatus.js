import React from 'react';
import { Button, Card, CardBody, Col, Row } from 'reactstrap';

function StaticEntityStatus({ url, project, fileCount }) {
	return (
		<div className="entity-manager">
			<div className="floating-card-header">/{project}/static</div>
			<Card className="my-3">
				<CardBody>
					<Row className="item-row">
						<Col className="item-label">{fileCount ? 'enabled' : '"static" subfolder not found'}</Col>
						<Col className="item-action">
							<Button
								tabIndex="-1"
								color={fileCount ? 'success' : 'danger'}
								disabled={!fileCount}
								className="round me-1"
							>
								{fileCount}
							</Button>
							<Button
								tabIndex="-1"
								color="purple"
								className="round"
								disabled={!fileCount}
								href={`${url}/${project}/static`}
								target="_blank"
								rel="noopener noreferrer"
							>
								<i title="View UI" className="fa fa-share" />
							</Button>
						</Col>
					</Row>
				</CardBody>
			</Card>
		</div>
	);
}

export default StaticEntityStatus;

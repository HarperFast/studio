import React from 'react';
import { Card, CardBody } from 'reactstrap';

function SetupIndex() {
	return (
		<>
			<div className="floating-card-header text-end">&nbsp;</div>
			<Card className="my-3">
				<CardBody>
					<div className="empty-prompt narrow">
						<i className="fa fa-bullhorn fa-3x text-success" />
						<div className="mt-3 text-bold">Coming Soon: Custom Functions!</div>
						<div className="mt-3">
							<ul>
								<li>Add your own API endpoints to a standalone API server inside Harper</li>
								<li>Use Harper Core methods to interact with your data at lightning speed</li>
								<li>Custom Functions are powered by Fastify, so they&apos;re extremely flexible</li>
								<li>Manage in Harper Studio, or use your own IDE and Version Management System</li>
								<li>Distribute your Custom Functions to all your Harper instances with a single click</li>
							</ul>
						</div>
					</div>
				</CardBody>
			</Card>
		</>
	);
}

export default SetupIndex;

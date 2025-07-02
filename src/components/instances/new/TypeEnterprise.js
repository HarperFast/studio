import React from 'react';
import { Row, Col, Card, CardBody, Button } from 'reactstrap';
import HarperDBDogLogo from '../../shared/logos/HarperDBDogLogo';

function TypeEnterprise({ setFormData }) {
	return (
		<Card className="mb-3">
			<CardBody className="instance-form-card-body">
				<Row>
					<Col xs="8" className="logo-header">
						<HarperDBDogLogo />
						<div className="ps-2">Enterprise</div>
					</Col>
					<Col xs="4">
						<Button
							id="createLocalInstanceButton"
							color="purple"
							block
							onClick={() =>
								setFormData({ cloud_provider: null, is_local: true, is_wavelength: false, is_akamai: false })
							}
						>
							Register
						</Button>
					</Col>
				</Row>

				<hr />
				<ul className="mb-0">
					<li>On-Prem/On Your Cloud</li>
					<li>Billed Annually, Free Tier Available</li>
					<li>24/7 Customer Support</li>
					<li>
						<a href="https://docs.harperdb.io/docs/getting-started" target="_blank" rel="noopener noreferrer">
							Click To View Install Docs
						</a>
					</li>
				</ul>
			</CardBody>
		</Card>
	);
}

export default TypeEnterprise;

import React from 'react';
import { Row, Col, Card, CardBody, Button } from 'reactstrap';
import AkamaiLogo from '../../shared/logos/AkamaiLogo';

function TypeAkamai({ setFormData }) {
	return (
		<Card className="mb-3">
			<CardBody className="instance-form-card-body">
				<Row>
					<Col xs="8" className="logo-header">
						<AkamaiLogo />
					</Col>
					<Col xs="4">
						<Button
							id="createCloudInstanceButton"
							color="purple"
							block
							onClick={() =>
								setFormData({ cloud_provider: 'akamai', is_local: false, is_wavelength: false, is_akamai: true })
							}
						>
							Create
						</Button>
					</Col>
				</Row>

				<hr />
				<ul className="mb-0">
					<li>On Akamai Connected Cloud</li>
					<li>Billed Monthly</li>
					<li>24/7 Customer Support</li>
					<li>Choose RAM and Disk Size</li>
				</ul>
			</CardBody>
		</Card>
	);
}

export default TypeAkamai;

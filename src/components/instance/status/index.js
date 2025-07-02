import React from 'react';
import { Col, Row } from 'reactstrap';

import SystemInfo from './SystemInfo';
import Jobs from './Jobs';
import Alarms from './Alarms';
import config from '../../../config';

function MetricsIndex() {
	return (
		<Row id="config">
			<Col xs="12">
				<SystemInfo />
			</Col>
			<Col lg={6} xs="12">
				<Jobs />
			</Col>
			{!config.is_local_studio && (
				<Col lg="6" xs="12">
					<Alarms />
				</Col>
			)}
		</Row>
	);
}

export default MetricsIndex;

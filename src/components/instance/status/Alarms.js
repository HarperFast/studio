import React, { useState, useEffect } from 'react';
import { useStoreState } from 'pullstate';
import { Card, CardBody, Row, Col, Button } from 'reactstrap';
import useInterval from 'use-interval';
import { ErrorBoundary } from 'react-error-boundary';
import { useParams } from 'react-router-dom';

import appState from '../../../functions/state/appState';
import config from '../../../config';

import AlarmsRow from './AlarmsRow';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import getAlarms from '../../../functions/api/lms/getAlarms';
import instanceState from '../../../functions/state/instanceState';

let controller;

function Alarms() {
	const { customer_id } = useParams();
	const compute_stack_id = useStoreState(instanceState, (s) => s.compute_stack_id);
	const auth = useStoreState(appState, (s) => s.auth);
	const alarms = useStoreState(appState, (s) => s.alarms && s.alarms[compute_stack_id]?.alarms, [compute_stack_id]);
	const alarmsError = useStoreState(appState, (s) => s.alarmsError);
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [loading, setLoading] = useState(false);
	const [lastUpdate, setLastUpdate] = useState(true);

	useEffect(() => {
		let isMounted = true;

		const fetchData = async () => {
			setLoading(true);
			controller = new AbortController();
			await getAlarms({ auth, signal: controller.signal, customer_id, currentAlarmsLength: alarms?.length });
			if (isMounted) setLoading(false);
		};

		if (auth) fetchData();

		return () => {
			controller?.abort();
			isMounted = false;
		};
		// eslint-disable-next-line
	}, [auth, lastUpdate]);

	useInterval(() => auth && autoRefresh && setLastUpdate(Date.now()), config.refresh_content_interval);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<Row className="floating-card-header">
				<Col>alarms</Col>
				<Col className="text-end">
					<Button color="link" title="Update Jobs" className="me-2" onClick={() => setLastUpdate(Date.now())}>
						<i className={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
					</Button>
					<Button color="link" title="Turn on autofresh" onClick={() => setAutoRefresh(!autoRefresh)}>
						<span className="me-2">auto</span>
						<i className={`fa fa-lg fa-toggle-${autoRefresh ? 'on' : 'off'}`} />
					</Button>
				</Col>
			</Row>
			<Card className="my-3">
				<CardBody className="item-list">
					<Row className="header">
						<Col xs="3" className="text-bold text-nowrap">
							status
						</Col>
						<Col xs="3" className="text-bold text-nowrap">
							date
						</Col>
						<Col xs="6" className="text-end text-danger text-bold">
							{!loading && alarmsError && (
								<span>alarms fetch error: {new Date().toLocaleTimeString().toLowerCase()}</span>
							)}
						</Col>
					</Row>
					<hr className="mt-1 mb-0" />
					<div className="item-scroller">
						{loading && !alarms && !autoRefresh ? (
							<div className="pt-5 text-center">
								<i className="fa fa-spinner fa-spin text-lightgrey" />
							</div>
						) : alarms?.length ? (
							alarms.map((a) => <AlarmsRow key={a.id} {...a} />)
						) : (
							<div className="pt-5 text-center">no alarms found</div>
						)}
					</div>
				</CardBody>
			</Card>
			<br />
		</ErrorBoundary>
	);
}

export default Alarms;

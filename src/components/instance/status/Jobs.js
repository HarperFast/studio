import React, { useState, useEffect } from 'react';
import { useStoreState } from 'pullstate';
import { Card, CardBody, Row, Col, Button } from 'reactstrap';
import useInterval from 'use-interval';
import { ErrorBoundary } from 'react-error-boundary';

import instanceState from '../../../functions/state/instanceState';
import config from '../../../config';

import searchJobsByStartDate from '../../../functions/api/instance/searchJobsByStartDate';
import JobRow from './JobsRow';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';

let controller;

function Jobs() {
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const jobs = useStoreState(instanceState, (s) => s.jobs);
	const jobsError = useStoreState(instanceState, (s) => s.jobsError);
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [loading, setLoading] = useState(true);
	const [lastUpdate, setLastUpdate] = useState(true);

	useEffect(() => {
		let isMounted = true;

		const fetchData = async () => {
			setLoading(true);
			controller = new AbortController();
			const tomorrow = new Date();
			tomorrow.setDate(tomorrow.getDate() + 1);
			const toDate = tomorrow.toISOString().split('T')[0];
			tomorrow.setFullYear(tomorrow.getFullYear() - 1);
			const fromDate = tomorrow.toISOString().split('T')[0];
			await searchJobsByStartDate({
				auth,
				url,
				signal: controller.signal,
				currentJobCount: jobs?.length || 0,
				from_date: fromDate,
				to_date: toDate,
			});
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
				<Col>jobs</Col>
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
						{!loading && jobsError ? (
							<Col xs="6" className="text-end text-danger text-bold text-nowrap">
								<b>job fetch error: {new Date().toLocaleTimeString().toLowerCase()}</b>
							</Col>
						) : (
							<>
								<Col xs="3" className="text-bold text-nowrap">
									start
								</Col>
								<Col xs="3" className="text-bold text-nowrap">
									end
								</Col>
							</>
						)}
					</Row>
					<hr className="mt-1 mb-0" />
					<div className="item-scroller">
						{loading && !jobs && !autoRefresh ? (
							<div className="pt-5 text-center">
								<i className="fa fa-spinner fa-spin text-lightgrey" />
							</div>
						) : jobs?.length ? (
							jobs.map((j) => <JobRow key={j.id} {...j} />)
						) : (
							<div className="pt-5 text-center">no jobs found</div>
						)}
					</div>
				</CardBody>
			</Card>
			<br />
		</ErrorBoundary>
	);
}

export default Jobs;

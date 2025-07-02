import React, { useState, useEffect } from 'react';
import { useStoreState } from 'pullstate';
import { Card, CardBody, Row, Col, Button, Modal, ModalHeader, ModalBody } from 'reactstrap';
import useInterval from 'use-interval';
import { ErrorBoundary } from 'react-error-boundary';
import { useParams } from 'react-router-dom';

import instanceState from '../../../functions/state/instanceState';
import appState from '../../../functions/state/appState';
import config from '../../../config';

import readLog from '../../../functions/api/instance/readLog';
import LogRow from './LogRow';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';

let controller;

const fetchData = async ({ auth, url, logsFilter }) => {
	controller = new AbortController();
	await readLog({
		auth,
		url,
		signal: controller.signal,
		// currentLogCount: logs?.length || 0,
		logsFilter, // default log limit is 1000
	});
};

function Logs({ logsFilter }) {
	const { compute_stack_id } = useParams();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const logs = useStoreState(instanceState, (s) => s.logs, [compute_stack_id]);
	const logsError = useStoreState(instanceState, (s) => s.logsError);
	const theme = useStoreState(appState, (s) => s.theme);
	const [autoRefresh, setAutoRefresh] = useState(false);
	const [loading, setLoading] = useState(true);
	const [lastUpdate, setLastUpdate] = useState(true);
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedLogInfo, setSelectedLogInfo] = useState({});

	const toggleModal = () => setIsModalOpen(!isModalOpen);

	useEffect(() => {
		if (auth) {
			setLoading(true);
			fetchData({ auth, url, logsFilter });
			setLoading(false);
		}

		return () => {
			controller?.abort();
		};
		// eslint-disable-next-line
	}, [auth, lastUpdate, logsFilter]);

	useInterval(() => auth && autoRefresh && setLastUpdate(Date.now()), config.refresh_content_interval);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<Row className="floating-card-header">
				<Col>logs</Col>
				<Col className="text-end">
					<Button color="link" title="Update Logs" className="me-2" onClick={() => setLastUpdate(Date.now())}>
						<i className={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
					</Button>
					<Button color="link" title="Turn on auto refresh" onClick={() => setAutoRefresh(!autoRefresh)}>
						<span className="me-2">auto</span>
						<i className={`fa fa-lg fa-toggle-${autoRefresh ? 'on' : 'off'}`} />
					</Button>
				</Col>
			</Row>
			<Card className="my-3">
				<CardBody className="item-list">
					<Row xs="12" md="12" className="header">
						<Col xs="2" md="1" className="text-bold text-nowrap">
							Status
						</Col>
						<Col xs="2" md="2" lg="1" className="text-bold text-nowrap">
							Date
						</Col>
						<Col xs="2" md="2" lg="1" className="text-left text-bold text-nowrap">
							{!loading && logsError ? (
								<span className="text-danger">log fetch error: {new Date().toLocaleTimeString().toLowerCase()}</span>
							) : (
								<span>Time</span>
							)}
						</Col>
						<Col xs="2" md="1" lg="1" className="text-bold text-nowrap">
							Thread
						</Col>
						<Col xs="2" md="2" lg="1" className="text-bold text-nowrap">
							Tags
						</Col>
						<Col xs="2" md="3" lg="7" className="text-bold text-nowrap">
							Message
						</Col>
					</Row>
					<hr className="mt-1 mb-0" />
					<div className="item-scroller">
						{loading && !logs && !autoRefresh ? (
							<div className="pt-5 text-center">
								<i className="fa fa-spinner fa-spin text-lightgrey" />
							</div>
						) : logs && logs.length ? (
							logs.map((log, index) => (
								<LogRow
									// eslint-disable-next-line react/no-array-index-key
									key={log.timestamp + index} // NOTE - Timestamp is not entirely unique, but it's the best we have for now, added index for "improved" uniqueness in rendering this list of logs,
									level={log.level}
									timestamp={log.timestamp}
									message={log.message}
									tags={log.tags}
									thread={log.thread}
									onRowClick={() => {
										setSelectedLogInfo(log);
										toggleModal();
									}}
								/>
							))
						) : logs && !logs.length ? (
							<div className="pt-5 text-center">no logs found</div>
						) : (
							<div className="pt-5 text-center">no logs found in this view</div>
						)}
					</div>
				</CardBody>
			</Card>
			<br />
			<Modal isOpen={isModalOpen} className={theme} centered fade={false} id="log-info-modal">
				<ModalHeader toggle={toggleModal}>View Log Info</ModalHeader>
				<ModalBody>
					{selectedLogInfo && (
						<div>
							<p>
								<b>Level:</b>{' '}
								<span className={`${selectedLogInfo?.level?.toLowerCase()}`}>
									{selectedLogInfo?.level?.toUpperCase()}
								</span>
							</p>
							<p className="mb-1">
								<b>Timestamp(UTC):</b>
							</p>
							<span>{selectedLogInfo?.timestamp}</span>
							<p className="mt-4">
								<b>Thread:</b> {selectedLogInfo?.thread}
							</p>
							<p>
								<b>Tags:</b> {selectedLogInfo?.tags?.join(', ')}
							</p>
							<p className="mb-2">
								<b>Message:</b>
							</p>
							<pre>
								{/* <code> */}
								{selectedLogInfo?.message?.error ? selectedLogInfo?.message?.error : selectedLogInfo?.message}
								{/* </code> */}
							</pre>
						</div>
					)}
				</ModalBody>
			</Modal>
		</ErrorBoundary>
	);
}

export default Logs;

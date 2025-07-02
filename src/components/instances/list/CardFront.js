import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardBody, Col, Row } from 'reactstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import useInterval from 'use-interval';
import useAsyncEffect from 'use-async-effect';
import { ErrorBoundary } from 'react-error-boundary';

import config from '../../../config';
import appState from '../../../functions/state/appState';
import useInstanceAuth from '../../../functions/state/instanceAuths';

import handleInstanceRegistration from '../../../functions/instances/handleInstanceRegistration';
import generateTypeString from '../../../functions/instances/generateTypeString';
import userInfo from '../../../functions/api/instance/userInfo';
import addError from '../../../functions/api/lms/addError';

import CopyableText from '../../shared/CopyableText';
import CardFrontIcons from './CardFrontIcons';
import CardInstanceUpdateRole from './CardInstanceUpdateRole';
import CardFrontStatusRow from '../../shared/CardFrontStatusRow';
import ErrorFallback from '../../shared/ErrorFallback';

const modifyingStatus = [
	'CREATING INSTANCE',
	'DELETING INSTANCE',
	'UPDATING INSTANCE',
	'LOADING',
	'CONFIGURING NETWORK',
	'APPLYING LICENSE',
];
const clickableStatus = ['OK', 'PLEASE LOG IN', 'LOGIN FAILED', 'LICENSE UPDATED - PLEASE RESTART'];

function CardFront({
	compute_stack_id,
	instance_id,
	url,
	status,
	instance_name,
	is_local,
	is_ssl,
	cloud_provider,
	setFlipState,
	flipState,
	compute,
	storage,
	wavelength_zone_id,
}) {
	const { customer_id } = useParams();
	const navigate = useNavigate();
	const auth = useStoreState(appState, (s) => s.auth);
	const isOrgOwner = auth?.orgs?.find((o) => o.customer_id?.toString() === customer_id)?.status === 'owner';
	const [instanceAuths, setInstanceAuths] = useInstanceAuth({});
	const instanceAuth = useMemo(() => instanceAuths?.[compute_stack_id], [instanceAuths, compute_stack_id]);
	const [instanceData, setInstanceData] = useState({ status: 'LOADING', clustering: '', version: '' });
	const [lastUpdate, setLastUpdate] = useState(false);
	const [processing, setProcessing] = useState(false);
	const [formState, setFormState] = useState({});
	const isReady = useMemo(() => !modifyingStatus.includes(instanceData.status), [instanceData.status]);
	const statusString =
		wavelength_zone_id && instanceData.status === 'UNABLE TO CONNECT'
			? 'UNABLE TO CONENCT - ON VERIZON?'
			: instanceData.status;
	const statusClass = `text-bold text-${instanceData.error ? 'danger' : 'success'}`;
	const ramString = `${compute?.compute_ram_string || '...'}`;
	const typeString = generateTypeString({ wavelength_zone_id, is_local, cloud_provider });
	const alarms = useStoreState(appState, (s) => s.alarms?.[compute_stack_id]?.alarmCounts, [compute_stack_id]);
	const diskClass = alarms?.Storage ? 'text-danger' : '';
	const diskString = `${storage?.data_volume_size_string || 'DEVICE DISK'} ${alarms?.Storage ? `/ ${alarms.Storage} ALARM${alarms.Storage > 1 ? 'S' : ''}` : ''}`;

	const handleCardClick = useCallback(
		async (e) => {
			if (['CREATE FAILED', 'DELETE FAILED'].includes(instanceData.status)) {
				e.stopPropagation();
			} else if (!instanceAuth) {
				setFlipState('login');
			} else if (instanceData.status === 'OK' || instanceData.status === 'LICENSE UPDATED - PLEASE RESTART') {
				const result = await userInfo({ auth: instanceAuth, url });
				if (result.error) {
					setInstanceData({ ...instanceData, status: 'UNABLE TO CONNECT', error: true, retry: true });
					setFormState({ error: result.message });
				} else {
					navigate(`/o/${customer_id}/i/${compute_stack_id}`);
				}
			}
		},
		// eslint-disable-next-line
		[instanceAuth, instanceData.status]
	);

	useAsyncEffect(async () => {
		if (processing) return false;

		if (
			['CREATE_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'CONFIGURING_NETWORK', 'CREATE_FAILED', 'DELETE_FAILED'].includes(
				status
			)
		) {
			return setInstanceData({
				...instanceData,
				status:
					status === 'CREATE_IN_PROGRESS'
						? 'CREATING INSTANCE'
						: status === 'UPDATE_IN_PROGRESS'
							? 'UPDATING INSTANCE'
							: status === 'CREATE_FAILED'
								? 'CREATE FAILED'
								: status === 'DELETE_FAILED'
									? 'DELETE FAILED'
									: 'CONFIGURING NETWORK',
				error: ['CREATE_FAILED', 'DELETE_FAILED'].includes(status),
				retry: status === 'CONFIGURING_NETWORK',
			});
		}

		if (!instanceAuth) {
			return setInstanceData({ ...instanceData, status: 'PLEASE LOG IN', error: true, retry: false });
		}

		if (!instanceAuth.super) {
			return setInstanceData({ ...instanceData, status: 'OK', error: false, retry: false });
		}

		if (instanceData.status === 'APPLYING LICENSE') {
			const restartResult = await userInfo({ auth: instanceAuth, url });
			if (!restartResult.error) {
				setInstanceData({ ...instanceData, status: 'OK', error: false, retry: false });
			}
			return false;
		}

		setProcessing(true);

		const registrationResult = await handleInstanceRegistration({
			auth,
			customer_id,
			instanceAuth,
			url,
			is_local,
			is_ssl,
			cloud_provider,
			instance_id,
			instance_name,
			compute_stack_id,
			compute,
			status: instanceData.status,
		});

		setInstanceAuths({
			...instanceAuths,
			[compute_stack_id]: { ...instanceAuths[compute_stack_id], version: registrationResult.version },
		});

		setProcessing(false);

		if (
			['UNABLE TO CONNECT', 'LOGIN FAILED'].includes(registrationResult.instance) &&
			['APPLYING LICENSE', 'CONFIGURING NETWORK'].includes(instanceData.status)
		) {
			return false;
		}

		if (['PLEASE LOG IN', 'LOGIN FAILED'].includes(registrationResult.instance)) {
			if (instanceAuth) {
				setInstanceAuths({ ...instanceAuths, [compute_stack_id]: null });
			}
			if (['PLEASE LOG IN', 'LOGIN FAILED', 'UNABLE TO CONNECT'].includes(instanceData.status)) {
				registrationResult.instance = 'LOGIN FAILED';
			}
		}
		return setInstanceData({ ...instanceData, ...registrationResult });
	}, [status, instanceAuth?.user, instanceAuth?.pass, lastUpdate]);

	useInterval(
		() => {
			if (instanceData.retry) setLastUpdate(Date.now());
		},
		instanceData.status === 'SSL ERROR' ? config.refresh_content_interval / 3 : config.refresh_content_interval
	);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			{formState.error && formState.error.indexOf('This instance was recently') !== -1 ? (
				<Card className="instance">
					<CardBody>
						<CardInstanceUpdateRole formState={formState} setFormState={setFormState} />
					</CardBody>
				</Card>
			) : (
				<Card
					tabIndex="0"
					title={`${instanceAuth ? 'Connect to' : 'Log into'} instance ${instance_name}`}
					className={`instance ${clickableStatus.includes(instanceData.status) ? '' : 'unclickable'}`}
					onKeyDown={(e) => e.keyCode !== 13 || handleCardClick(e)}
					onClick={handleCardClick}
				>
					{!flipState && (
						<CardBody>
							<Row className="g-0">
								<Col xs="9" className="instance-name">
									{instance_name}
								</Col>
								<Col xs="3" className="instance-icons">
									<CardFrontIcons
										isOrgOwner={isOrgOwner}
										isReady={isReady}
										showLogout={instanceAuth}
										setFlipState={setFlipState}
										compute_stack_id={compute_stack_id}
										instance_name={instance_name}
										onlyDelete={['CREATE FAILED', 'DELETE FAILED'].includes(instanceData.status)}
									/>
								</Col>
							</Row>

							<>
								{['CREATE FAILED', 'DELETE FAILED'].includes(instanceData.status) ? (
									<div className="copyable-text-holder">
										<div className="text-container">
											<a
												href="https://harperdbhelp.zendesk.com/hc/en-us/requests/new"
												target="_blank"
												rel="noopener noreferrer"
												className="text-nowrap text-decoration-none"
											>
												<span className="text-danger text-small text-uppercase text-bold">
													UH OH. CREATE A SUPPORT TICKET?
												</span>
												<i className="ms-2 fa fa-lg fa-external-link-square text-danger" />
											</a>
										</div>
									</div>
								) : instanceData.status === 'SSL ERROR' ? (
									<div className="copyable-text-holder">
										<div className="text-container">
											<a
												href={url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-nowrap text-decoration-none"
											>
												<span className="text-danger text-small text-uppercase text-bold">
													CLICK TO ACCEPT SELF-SIGNED CERT?
												</span>
												{url && <i className="ms-2 fa fa-lg fa-external-link-square text-danger" />}
											</a>
										</div>
									</div>
								) : (
									<CopyableText text={url} />
								)}
								<CardFrontStatusRow label="STATUS" isReady value={statusString} textClass={statusClass} bottomDivider />
								<CardFrontStatusRow label="TYPE" isReady value={typeString} bottomDivider />
								<CardFrontStatusRow label="RAM" isReady value={ramString} bottomDivider />
								<CardFrontStatusRow label="DISK" isReady value={diskString} textClass={diskClass} bottomDivider />
								<CardFrontStatusRow label="VERSION" isReady value={instanceData.version} bottomDivider />
							</>
						</CardBody>
					)}
				</Card>
			)}
		</ErrorBoundary>
	);
}

export default CardFront;

import React, { useCallback, useEffect, useState } from 'react';
import { Row, Col } from 'reactstrap';
import { ErrorBoundary } from 'react-error-boundary';
import { useStoreState } from 'pullstate';
import { useParams } from 'react-router-dom';
import useInterval from 'use-interval';

import instanceState from '../../../../functions/state/instanceState';

import InstanceManager from './InstanceManager';
import DataTable from './Datatable';
import ManageErrorModal from './ErrorModal';
import ErrorFallback from '../../../shared/ErrorFallback';
import addError from '../../../../functions/api/lms/addError';
import buildNetwork from '../../../../functions/instance/clustering/buildNetwork';
import appState from '../../../../functions/state/appState';
import useInstanceAuth from '../../../../functions/state/instanceAuths';

function ManageIndex({ configuring }) {
	const { compute_stack_id } = useParams();

	const instances = useStoreState(appState, (s) => s.instances);
	const [instanceAuths] = useInstanceAuth({});
	const auth = useStoreState(instanceState, (s) => s.auth, [compute_stack_id]);
	const url = useStoreState(instanceState, (s) => s.url, [compute_stack_id]);
	const clusterPartners = useStoreState(instanceState, (s) => s.clusterPartners, [compute_stack_id]);
	const restarting = useStoreState(instanceState, (s) => s.restarting, [compute_stack_id]);
	const clusterEngine = useStoreState(
		instanceState,
		(s) => (parseFloat(s.registration?.version) >= 4 ? 'nats' : 'socketcluster'),
		[compute_stack_id]
	);
	const aNodeIsConnecting =
		clusterEngine === 'socketcluster' && clusterPartners?.connected.some((c) => c.connection.state === 'connecting');

	const [showModal, setShowModal] = useState(false);
	const [loading, setLoading] = useState(false);

	const refreshNetwork = useCallback(async () => {
		if (auth && url && instances && compute_stack_id && !restarting && !configuring) {
			await buildNetwork({ auth, url, instances, compute_stack_id, instanceAuths, setLoading });
		}
	}, [auth, url, instances, compute_stack_id, restarting, instanceAuths, configuring]);

	useEffect(() => {
		refreshNetwork();
	}, [refreshNetwork]);

	useInterval(() => aNodeIsConnecting && refreshNetwork(), 1500);

	return (
		<>
			<Row id="clustering">
				<Col xl="3" lg="4" md="6" xs="12">
					<ErrorBoundary
						onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
						FallbackComponent={ErrorFallback}
					>
						<InstanceManager
							items={clusterPartners?.connected}
							itemType="connected"
							loading={loading}
							refreshNetwork={refreshNetwork}
							setLoading={setLoading}
							setShowModal={setShowModal}
						/>
						<InstanceManager
							items={clusterPartners?.unconnected}
							itemType="unconnected"
							loading={loading}
							refreshNetwork={refreshNetwork}
							setLoading={setLoading}
						/>
						<InstanceManager items={clusterPartners?.unconfigured} itemType="unconfigured" loading={loading} />
						<InstanceManager
							items={clusterPartners?.unreachable}
							itemType="incompatible/unreachable"
							loading={loading}
						/>
					</ErrorBoundary>
				</Col>
				<Col xl="9" lg="8" md="6" xs="12">
					<DataTable refreshNetwork={refreshNetwork} loading={loading} setLoading={setLoading} />
				</Col>
			</Row>
			<ManageErrorModal showModal={showModal} setShowModal={setShowModal} />
		</>
	);
}

export default ManageIndex;

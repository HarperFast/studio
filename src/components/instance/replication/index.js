import React, { useState, useCallback, useEffect } from 'react';
import { useStoreState } from 'pullstate';
import useInterval from 'use-interval';
import { useParams } from 'react-router-dom';

import instanceState from '../../../functions/state/instanceState';

import Setup from './setup';
import Manage from './manage';
import Loader from '../../shared/Loader';
import EmptyPrompt from '../../shared/EmptyPrompt';
import checkClusterStatus from '../../../functions/instance/clustering/checkClusterStatus';

function ClusteringIndex() {
	const { compute_stack_id } = useParams();
	const auth = useStoreState(instanceState, (s) => s.auth, [compute_stack_id]);
	const url = useStoreState(instanceState, (s) => s.url, [compute_stack_id]);
	const [clusterStatus, setClusterStatus] = useState(false);
	const [configuring, setConfiguring] = useState(false);

	const refreshStatus = useCallback(async () => {
		if (auth && url) {
			const result = await checkClusterStatus({ auth, url });
			setClusterStatus(result);
			if (result.is_ready) {
				setConfiguring(false);
			}
		}
	}, [auth, url]);

	useInterval(async () => {
		if (configuring) {
			refreshStatus();
		}
	}, 3000);

	useEffect(() => {
		refreshStatus();
	}, [refreshStatus]);

	useEffect(() => {
		setClusterStatus(false);
	}, [compute_stack_id]);

	return !clusterStatus ? (
		<Loader header="loading network" spinner />
	) : configuring ? (
		<EmptyPrompt description="Configuring Clustering" icon={<i className="fa fa-spinner fa-spin" />} />
	) : clusterStatus.is_ready ? (
		<Manage configuring={configuring} />
	) : (
		<Setup setConfiguring={setConfiguring} clusterStatus={clusterStatus} refreshStatus={refreshStatus} />
	);
}

export default ClusteringIndex;

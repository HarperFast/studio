import React, { useState } from 'react';
import { Button } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useParams } from 'react-router-dom';
import useAsyncEffect from 'use-async-effect';

import instanceState from '../../../../functions/state/instanceState';
import setConfiguration from '../../../../functions/api/instance/setConfiguration';
import restartInstance from '../../../../functions/api/instance/restartInstance';
import checkClusterStatus from '../../../../functions/instance/clustering/checkClusterStatus';

function Enable({ setConfiguring }) {
	const { compute_stack_id } = useParams();
	const auth = useStoreState(instanceState, (s) => s.auth, [compute_stack_id]);
	const url = useStoreState(instanceState, (s) => s.url, [compute_stack_id]);
	const clusterEngine = useStoreState(
		instanceState,
		(s) => (parseFloat(s.registration?.version) >= 4 ? 'nats' : 'socketcluster'),
		[compute_stack_id]
	);
	const [formState, setFormState] = useState({});

	useAsyncEffect(async () => {
		if (formState.submitted) {
			if (clusterEngine === 'nats') {
				await setConfiguration({
					auth,
					url,
					customFunctions_enabled: true,
				});
			} else {
				const clusterStatus = await checkClusterStatus({ auth, url });
				await setConfiguration({
					auth,
					url,
					operation: 'configure_cluster',
					CUSTOM_FUNCTIONS: true,
					CLUSTERING: Boolean(clusterStatus?.config_cluster_user),
					CLUSTERING_PORT: clusterStatus?.config_cluster_port,
					CLUSTERING_USER: clusterStatus?.config_cluster_user,
					NODE_NAME: clusterStatus?.nodeName,
				});
			}
			if (window._kmq) window._kmq.push(['record', 'enabled custom functions']);
			restartInstance({ auth, url });
			setTimeout(() => setConfiguring(true), 0);
		}
	}, [formState.submitted]);

	return (
		<>
			<hr className="my-3" />
			<Button color="success" disabled={formState.submitted} block onClick={() => setFormState({ submitted: true })}>
				{formState.submitted ? <i className="fa fa-spinner fa-spin text-white" /> : 'Enable Custom Functions'}
			</Button>
		</>
	);
}

export default Enable;

import React from 'react';
import { Button } from 'reactstrap';
import { useStoreState } from 'pullstate';

import instanceState from '../../../../../functions/state/instanceState';

import restartService from '../../../../../functions/api/instance/restartService';

function EntityReloader({ loading, refreshCustomFunctions, restarting }) {
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);

	return (
		<span className="structure-reloader d-block text-center mb-4">
			<Button disabled={loading} color="link" onClick={refreshCustomFunctions}>
				<span className="me-2">refresh projects</span>
				<i title="Refresh Endpoint Files" className={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
			</Button>
			<span className="mx-3 text">|</span>
			<Button
				disabled={restarting}
				color="link"
				onClick={() => restartService({ auth, url, service: 'custom_functions' })}
				className="me-2"
			>
				<span className="me-2">restart server</span>
				<i title="Refresh Endpoint Files" className={`fa ${restarting ? 'fa-spinner fa-spin' : 'fa-stop-circle'}`} />
			</Button>
			<hr className="d-block d-md-none mt-4" />
		</span>
	);
}

export default EntityReloader;

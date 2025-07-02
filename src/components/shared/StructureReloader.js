import React, { useCallback } from 'react';
import { useStoreState } from 'pullstate';
import { Button } from 'reactstrap';
import { useParams } from 'react-router-dom';

import instanceState from '../../functions/state/instanceState';
import appState from '../../functions/state/appState';
import buildInstanceStructure from '../../functions/instance/browse/buildInstanceStructure';

function StructureReloader({ label = 'instance', centerText = false }) {
	const { compute_stack_id } = useParams();
	const loading = useStoreState(instanceState, (s) => s.loading);
	const instances = useStoreState(appState, (s) => s.instances);
	const auth = useStoreState(instanceState, (s) => s.auth);

	const refresh = useCallback(() => {
		const instance = instances.find((i) => i.compute_stack_id === compute_stack_id);
		buildInstanceStructure({ auth, url: instance.url });
	}, [auth, compute_stack_id, instances]);

	return (
		<span className={`structure-reloader ${centerText ? 'd-block text-center' : ''}`}>
			<Button color="link" onClick={refresh}>
				<i title="Refresh Structure" className={`fa me-2 ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
				{label}
			</Button>
		</span>
	);
}

export default StructureReloader;

import React from 'react';
import ToggleButton from 'react-toggle';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';

const updateFilter = (e) => {
	appState.update((s) => {
		s.filterCloud = e.target.checked;
	});
};

const icons = {
	checked: <div>cloud</div>,
	unchecked: <div>cloud</div>,
};

function Cloud() {
	const filterCloud = useStoreState(appState, (s) => s.filterCloud);

	return (
		<div title={`Click to ${filterCloud ? 'hide' : 'show'} cloud instances`} className="instance-toggle-holder">
			<ToggleButton width="100%" icons={icons} checked={filterCloud} onChange={updateFilter} />
		</div>
	);
}

export default Cloud;

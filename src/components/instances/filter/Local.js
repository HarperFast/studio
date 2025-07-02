import React from 'react';
import ToggleButton from 'react-toggle';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';

const updateFilter = (e) => {
	appState.update((s) => {
		s.filterLocal = e.target.checked;
	});
};

const icons = {
	checked: <div>local</div>,
	unchecked: <div>local</div>,
};

function Local() {
	const filterLocal = useStoreState(appState, (s) => s.filterLocal);

	return (
		<div title={`Click to ${filterLocal ? 'hide' : 'show'} local instances`} className="instance-toggle-holder">
			<ToggleButton width="100%" icons={icons} checked={filterLocal} id="filterLocal" onChange={updateFilter} />
		</div>
	);
}

export default Local;

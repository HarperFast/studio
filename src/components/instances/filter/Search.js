import React from 'react';
import { Input, Button } from 'reactstrap';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';

const updateFilter = (e) => {
	appState.update((s) => {
		s.filterSearch = e.target.value;
	});
};

const clearFilter = () => {
	appState.update((s) => {
		s.filterSearch = '';
	});
};

function Search() {
	const filterSearch = useStoreState(appState, (s) => s.filterSearch);

	return (
		<div className="filter-holder">
			<Input
				id="filter_instances"
				title="filter instances by name, host, url, or region"
				type="text"
				className="text-center"
				onChange={updateFilter}
				placeholder="filter instances"
				value={filterSearch}
			/>
			{filterSearch && (
				<Button title="Clear instance filter" className="clear-filter" onClick={clearFilter}>
					<i className="fa fa-times" />
				</Button>
			)}
		</div>
	);
}

export default Search;

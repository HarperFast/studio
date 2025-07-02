import React, { useState } from 'react';
import { useStoreState } from 'pullstate';

import appState from '../../../functions/state/appState';
import InstanceCard from './InstanceCard';
import filterInstances from '../../../functions/instances/filterInstances';

const InstanceList = () => {
	const [flippedCard, setFlippedCard] = useState(false);
	const instances = useStoreState(appState, (s) =>
		filterInstances({
			filterSearch: s.filterSearch,
			filterCloud: s.filterCloud,
			filterLocal: s.filterLocal,
			instances: s.instances,
		})
	);

	return instances
		.filter((instance) => {
			const { wavelength_zone_id, status } = instance;
			const deleted_wavelength_instance = wavelength_zone_id && status === 'DELETE_FAILED';

			if (deleted_wavelength_instance) {
				return false;
			}

			return true;
		})
		.map((i) => (
			<InstanceCard key={i.compute_stack_id} {...i} flippedCard={flippedCard} setFlippedCard={setFlippedCard} />
		));
};

export default InstanceList;

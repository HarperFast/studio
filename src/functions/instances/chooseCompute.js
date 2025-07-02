const chooseCompute = ({ is_local, wavelength_zone_id, cloud_provider }) => {
	switch (true) {
		case wavelength_zone_id:
			return 'wavelength_compute';
		case is_local:
			return 'local_compute';
		case cloud_provider === 'akamai':
			return 'akamai_compute';
		default:
			return 'cloud_compute';
	}
};

export default chooseCompute;

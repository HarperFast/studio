const generateTypeString = ({ wavelength_zone_id, is_local, cloud_provider }) => {
	switch (true) {
		case wavelength_zone_id:
			return 'HARPER CLOUD - VERIZON 5G';
		case is_local:
			return 'HARPER ENTERPRISE - USER MANAGED';
		case cloud_provider === 'akamai':
			return 'HARPER CLOUD - AKAMAI';
		default:
			return 'HARPER CLOUD - AWS';
	}
};

export default generateTypeString;

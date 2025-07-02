export default (array, key) => {
	const existingCustomerIds = {};

	return array.filter((item) => {
		if (existingCustomerIds[item[key]]) {
			return false;
		}
		existingCustomerIds[item[key]] = true;
		return true;
	});
};

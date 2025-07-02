import arrayUniqueByKey from '../util/arrayUniqueByKey';

export default ({ orgSearch, orgs }) => {
	if (!orgs) return [];

	const uniqueOrgs = arrayUniqueByKey(orgs, 'customer_id');

	if (!orgSearch || orgSearch === '') return uniqueOrgs;

	return uniqueOrgs.filter(
		(i) => i.customer_name && i.customer_name.toLowerCase().indexOf(orgSearch.toLowerCase()) !== -1
	);
};

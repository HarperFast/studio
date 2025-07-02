import describeAll from '../../api/instance/describeAll';
import buildInstanceDataStructure from '../browse/buildInstanceDataStructure';
import checkClusterStatus from './checkClusterStatus';

const processInstance = async ({ instance, auth }) => {
	const clustering = auth && (await checkClusterStatus({ auth, url: instance.url }));
	const schema = auth && (await describeAll({ auth, url: instance.url }));
	const { structure } = schema ? buildInstanceDataStructure(schema) : { structure: {} };
	const urlObject = new URL(instance.url);
	const instanceObject = {
		...instance,
		auth,
		structure,
		host: urlObject.hostname,
		clustering,
	};
	return Object.entries(instanceObject).reduce((a, [k, v]) => (v == null ? a : ((a[k] = v), a)), {});
};

export default processInstance;

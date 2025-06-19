import axios from 'axios';

const instanceClient = axios.create({
	withCredentials: true,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json',
	},
});
// TODO: }) as TypedAxios?
export default instanceClient;

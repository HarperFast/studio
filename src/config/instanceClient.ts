import axios from 'axios';

export const instanceClient = axios.create({
	withCredentials: true,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json',
	},
});
// TODO: as TypedAxios?

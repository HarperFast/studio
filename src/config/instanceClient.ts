import axios from 'axios';
import { localStudioDevUrl } from '@/config/constants';

export const instanceClient = axios.create({
	withCredentials: true,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json',
	},
});
// TODO: as TypedAxios?

if (localStudioDevUrl) {
	instanceClient.defaults.baseURL = localStudioDevUrl;
}

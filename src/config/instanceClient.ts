import axios from 'axios';
import { isLocalStudio, localStudioDevUrl } from '@/config/constants';

export const instanceClient = axios.create({
	withCredentials: true,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json',
	},
});
// TODO: as TypedAxios?

if (isLocalStudio && localStudioDevUrl) {
	instanceClient.defaults.baseURL = localStudioDevUrl;
}

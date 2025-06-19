import axios from 'axios';
import type { TypedAxios } from './typed-axios';

const apiClient = axios.create({
	withCredentials: true,
	baseURL: import.meta.env.VITE_CENTRAL_MANAGER_API_URL,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json',
	},
}) as TypedAxios;

export default apiClient;

import axios from 'axios';
import type { TypedAxios } from './typedAxios';

export const apiClient = axios.create({
	withCredentials: true,
	baseURL: import.meta.env.VITE_CENTRAL_MANAGER_API_URL,
	timeout: 15000,
	headers: {
		'Content-Type': 'application/json',
	},
}) as TypedAxios;

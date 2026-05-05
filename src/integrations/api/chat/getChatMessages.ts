import { apiClient } from '@/config/apiClient';

export async function getChatMessages() {
	const { data } = await apiClient.get('/Chat/Messages/' as any);
	return data;
}

import { apiClient } from '@/config/apiClient';

export async function clearChatMessages() {
	await apiClient.delete('/Chat/Messages/' as any);
}

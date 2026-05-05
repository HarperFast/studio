import { joinPath } from '@/lib/string/paths/joinPath';
import { DefaultChatTransport } from 'ai';

export function getChatTransport(orgId: string) {
	return new DefaultChatTransport({
		api: joinPath(import.meta.env.VITE_CENTRAL_MANAGER_API_URL || '/', 'Chat/Messages/'),
		credentials: 'include',
		body: { orgId },
	});
}

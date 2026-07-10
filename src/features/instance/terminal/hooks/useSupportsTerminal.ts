import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';

/**
 * True when a live terminal WebSocket can be attempted for this entity.
 *
 * Gated purely on a direct connection: the central-manager fabric-connect proxy
 * buffers/does not upgrade streamed responses, so a WebSocket over it can't be
 * established. Mirrors `useSupportsLogSSE`.
 */
export function useSupportsTerminal(): boolean {
	const params = useInstanceClientIdParams();
	return authStore.isDirectConnection(params.entityId);
}

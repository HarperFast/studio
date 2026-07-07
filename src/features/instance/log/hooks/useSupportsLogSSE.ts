import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { authStore } from '@/features/auth/store/authStore';

/**
 * True when we should attempt a LIVE SSE tail of `read_log` for this entity.
 *
 * Gated purely on a direct connection: the central-manager fabric-connect proxy buffers
 * `text/event-stream` (it withholds the whole response until the operation completes), so a
 * tail over it never streams — mirroring `useSupportsDeploymentSSE`.
 *
 * Deliberately NOT gated on a Harper version. Streaming `read_log` is negotiated per request
 * via the `Accept` header, and `streamReadLog` detects a non-streaming instance cheaply (a
 * non-`text/event-stream` response throws `SSEUnsupportedError` before any tail begins), so
 * the caller falls back to polling with no wasted work. A version gate can be added here once
 * the minimum streaming version is pinned down.
 */
export function useSupportsLogSSE(): boolean {
	const params = useInstanceClientIdParams();
	return authStore.isDirectConnection(params.entityId);
}

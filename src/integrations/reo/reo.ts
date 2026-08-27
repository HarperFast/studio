import { useEffect } from 'react';
import { loadReoScript, ReoClient } from 'reodotdev';

export let reoClient: ReoClient | undefined;

export function useReo() {
	useEffect(() => {
		if (import.meta.env.VITE_REO_DEV_CLIENT_ID && import.meta.env.VITE_REO_DEV_CLIENT_ID !== '0') {
			loadReoScript({ clientID: import.meta.env.VITE_REO_DEV_CLIENT_ID })
				.then((Reo) => {
					Reo?.init?.({ clientID: import.meta.env.VITE_REO_DEV_CLIENT_ID });
					return reoClient = Reo;
				})
				// Reo is optional analytics whose CDN ad blockers routinely block. Its loader rejects
				// from the injected script's own `onerror`, so the rejection's only stack frame is our
				// bundle and `shouldKeepEvent`'s reo.dev filter cannot attribute it away — unhandled,
				// it lands in Error Tracking as a Studio error. Nothing degrades when Reo is absent.
				.catch(() => {});
		}
	}, []);
}

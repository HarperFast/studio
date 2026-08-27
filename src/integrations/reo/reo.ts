import { useEffect } from 'react';
import { loadReoScript, ReoClient } from 'reodotdev';

export let reoClient: ReoClient | undefined;

export function useReo() {
	useEffect(() => {
		const clientID = import.meta.env.VITE_REO_DEV_CLIENT_ID;
		if (!clientID || clientID === '0') {
			return;
		}
		// Reo is optional analytics whose CDN ad blockers routinely block, and its loader rejects
		// from the injected script's own `onerror`. That rejection's only located frame is our own
		// bundle, so `shouldKeepEvent`'s reo.dev stack filter cannot attribute it away — left
		// unhandled it lands in Error Tracking as a Studio error. Starting from a resolved promise
		// funnels a synchronous throw into the same handler: `useReo` runs above the router with no
		// boundary over it, so a throw that escaped this effect would blank Studio.
		Promise.resolve()
			.then(() => loadReoScript({ clientID }))
			.then((Reo) => {
				Reo?.init?.({ clientID });
				return reoClient = Reo;
			})
			.catch(() => {});
	}, []);
}

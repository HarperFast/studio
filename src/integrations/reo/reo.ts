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
		// unhandled it lands in Error Tracking as a Studio error. `useReo` runs above the router with
		// no error boundary over it, so a synchronous throw has to land here too or Studio blanks.
		Promise.resolve()
			.then(() => loadReoScript({ clientID }))
			.then((Reo) => {
				Reo?.init?.({ clientID });
				return reoClient = Reo;
			})
			.catch(() => {});
	}, []);
}

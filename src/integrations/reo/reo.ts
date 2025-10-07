import { useEffect } from 'react';
import { loadReoScript, ReoClient } from 'reodotdev';

export let reoClient: ReoClient | undefined;

export function useReo() {
	useEffect(() => {
		if (import.meta.env.VITE_REO_DEV_CLIENT_ID && import.meta.env.VITE_REO_DEV_CLIENT_ID !== '0') {
			loadReoScript({ clientID: import.meta.env.VITE_REO_DEV_CLIENT_ID })
				.then((Reo) => reoClient = Reo?.init?.({ clientID: import.meta.env.VITE_REO_DEV_CLIENT_ID }));
		}
	}, []);
}

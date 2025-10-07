declare module 'reodotdev' {
	export function loadReoScript({ clientID: string }): Promise<{
		init: null | (({ clientID: string }) => ReoClient);
	}>;

	export interface ReoClient {
		identify: null | ((person: { username: string; type: string; company: string; }) => void);
	}
}

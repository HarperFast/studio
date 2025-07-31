declare module 'reodotdev' {
	export function loadReoScript({ clientID: string }): Promise<{
		init: ({ clientID: string }) => ReoClient;
	}>;

	export interface ReoClient {
		identify: (person: { username: string; type: string; company: string; }) => void;
	}
}

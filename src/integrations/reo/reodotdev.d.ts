declare module 'reodotdev' {
	export function loadReoScript({ clientID: string }): Promise<ReoClient>;

	export interface ReoClient {
		init: null | (({ clientID: string }) => ReoClient);
		identify: null | ((person: Record<string, unknown>) => void);
	}
}

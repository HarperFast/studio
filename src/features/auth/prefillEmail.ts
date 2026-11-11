import { useLocation } from '@tanstack/react-router';

declare module '@tanstack/react-router' {
	interface HistoryState {
		// History state, not `?me=`: every analytics pixel the page loads reads the URL (AGENTS.md).
		prefillEmail?: string;
	}
}

export function usePrefillEmail(): string | undefined {
	return useLocation({ select: (location) => location.state.prefillEmail });
}

/** `12s`, `2m 05s`, `1h 02m`; sub-second spans read as milliseconds. */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) {
		return '—';
	}
	if (ms < 1000) {
		return `${Math.round(ms)} ms`;
	}
	const totalSeconds = Math.floor(ms / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) {
		return `${hours}h ${String(minutes).padStart(2, '0')}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
	}
	return `${seconds}s`;
}

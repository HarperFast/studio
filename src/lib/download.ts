export function triggerBlobDownload(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	// Revoke on a later tick: some browsers (Firefox) start the download
	// asynchronously, and a synchronous revoke can abort it.
	window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function slugifyForFilename(prefix: string): string {
	return prefix.replace(/[^a-z0-9-]+/gi, '-').replace(/(^-|-$)/g, '').toLowerCase();
}

export function filenameTimestamp(ms: number): string {
	return new Date(ms).toISOString().replace(/[:.]/g, '-');
}

/** HTTP status off an axios-style error, tolerating both the axios shape
 *  (`error.response.status`) and a bare `{ status }`. Never throws: error
 *  boundaries call it on arbitrary thrown values, and a throwing getter there
 *  would escape the boundary's own fallback. */
export function errorStatus(err: unknown): number | undefined {
	try {
		return (err as { response?: { status?: number } })?.response?.status
			?? (err as { status?: number })?.status;
	} catch {
		return undefined;
	}
}

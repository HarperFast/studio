/** A write that answered 200 without confirming it did what was asked. */
export interface IncompleteWrite {
	message: string;
	/**
	 * True only when the response says plainly that nothing was written. A caller can then skip its
	 * cache invalidation: there is nothing new to read, and refetching would reset an editor that
	 * still holds the user's draft (#1600). An undecidable answer leaves this false, so the caller
	 * refreshes — the write may have landed and replicated even if the answer was unreadable.
	 */
	wroteNothing: boolean;
}

/** Present, but not the array of hashes the operation is documented to return. */
export function isMalformedHashes(value: unknown): boolean {
	return value !== undefined && !Array.isArray(value);
}

export const UNREADABLE_WRITE_MESSAGE =
	"Harper's response didn't report which records it wrote, so the change may not have been saved.";

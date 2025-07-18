/**
 * Collapses a kebab-case string to meet a maximum length restriction.
 * It shortens segments one by one starting from the end, keeping the first character of each segment.
 *
 * @param str - The kebab-case string to collapse
 * @param maxLength - The maximum length the resulting string should have
 * @returns The collapsed string that meets the max length restriction
 *
 * @example
 * collapseKebabsToMaxLength('one-two-three', 8) // 'one-t-t'
 * collapseKebabsToMaxLength('hello-world', 7) // 'hello-w'
 * collapseKebabsToMaxLength('a-b-c-d', 5) // 'a-b-c'
 * collapseKebabsToMaxLength('short', 10) // 'short' (already within max length)
 */
export function collapseKebabsToMaxLength(str: string, maxLength: number): string {
	// Handle edge cases with zero or negative max length
	if (maxLength <= 0) {
		return '';
	}

	// If the string is already within the max length, return it as is
	if (str.length <= maxLength) {
		return str;
	}

	// Split the string by hyphens to get individual segments
	const segments = str.split('-');

	// If there's only one segment, just truncate it
	if (segments.length === 1) {
		return segments[0].slice(0, maxLength);
	}

	// First, collapse all segments except the first one to their first character
	const collapsedSegments = [
		segments[0],
		...segments.slice(1).map(segment => segment.charAt(0)),
	];

	// Check if the collapsed string now meets the max length
	const result = collapsedSegments.join('-');
	if (result.length <= maxLength) {
		return result;
	}

	// If we still exceed the max length, we need to truncate the first segment
	// Calculate how much space we have for the first segment
	const otherSegmentsLength = collapsedSegments.slice(1).join('').length;
	const hyphensLength = collapsedSegments.length - 1; // Number of hyphens
	const maxFirstSegmentLength = maxLength - otherSegmentsLength - hyphensLength;

	if (maxFirstSegmentLength > 0) {
		// We have some space for the first segment
		collapsedSegments[0] = collapsedSegments[0].slice(0, maxFirstSegmentLength);
		return collapsedSegments.join('-');
	} else {
		// We don't have space for all segments, so we need to remove segments from the end
		// Keep as many segments as possible, starting from the beginning
		const finalSegments = [];
		let currentLength = 0;

		// Always include at least the first character of the first segment if possible
		if (maxLength > 0) {
			finalSegments.push(segments[0].charAt(0));
			currentLength = 1;
		}

		// Add as many collapsed segments as we can fit
		for (let i = 1; i < collapsedSegments.length; i++) {
			// +1 for the hyphen
			const segmentLength = 1 + 1; // 1 for the collapsed segment, 1 for the hyphen

			if (currentLength + segmentLength <= maxLength) {
				finalSegments.push(collapsedSegments[i]);
				currentLength += segmentLength;
			} else {
				break;
			}
		}

		return finalSegments.join('-');
	}
}

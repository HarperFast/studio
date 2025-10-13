import { useEffect, useState } from 'react';

/**
 * useDebounce hook
 * Returns a debounced version of a changing value after the specified delay.
 *
 * Example:
 * const debouncedSearch = useDebounce(search, 300);
 */
export function useDebounce<T>(value: T, delay: number = 300, hasher?: (value: T) => string): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	const hashed = hasher ? hasher(value) : value;
	useEffect(() => {
		const timer = setTimeout(() => setDebouncedValue(value), delay);
		return () => clearTimeout(timer);
		// We watch the hashed value, and the delay, so that we can decide when to bust the state.
	}, [hashed, delay]);

	return debouncedValue;
}

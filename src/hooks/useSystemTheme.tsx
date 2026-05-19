import { useEffect, useState } from 'react';

export function useSystemTheme(): 'light' | 'dark' {
	const [theme, setTheme] = useState<'light' | 'dark'>(
		() => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
	);
	useEffect(() => {
		const mq = window.matchMedia('(prefers-color-scheme: dark)');
		const handler = (e: MediaQueryListEvent) => setTheme(e.matches ? 'dark' : 'light');
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	}, []);
	return theme;
}

import { useSystemTheme } from '@/hooks/useSystemTheme';
import { useTheme } from '@/hooks/useTheme';

/** Returns the Monaco Editor theme string matching the current Studio theme. */
export function useMonacoTheme(): 'vs-dark' | 'light' {
	const [theme] = useTheme();
	const systemTheme = useSystemTheme();
	const isDark = theme === 'dark' || (theme === 'system' && systemTheme === 'dark');
	return isDark ? 'vs-dark' : 'light';
}

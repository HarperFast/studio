import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useSystemTheme } from '@/hooks/useSystemTheme';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { createContext, ReactNode, useContext, useEffect } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const ThemeContext = createContext<[Theme, (t: Theme) => void]>(['system', () => {}]);

export function ThemeProvider({ children }: { children: ReactNode }) {
	const [theme, setTheme] = useLocalStorage<Theme>(LocalStorageKeys.Theme, 'system');
	const systemTheme = useSystemTheme();

	useEffect(() => {
		const isDark = theme === 'dark' || (theme === 'system' && systemTheme === 'dark');
		document.documentElement.classList.toggle('dark', isDark);
	}, [theme, systemTheme]);

	return <ThemeContext.Provider value={[theme, setTheme]}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
	return useContext(ThemeContext);
}

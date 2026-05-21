import { type Theme, useTheme } from '@/hooks/useTheme';
import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';

const OPTIONS: Array<{ value: Theme; icon: React.ReactNode; label: string }> = [
	{ value: 'light', icon: <SunIcon className="size-4" />, label: 'Light' },
	{ value: 'system', icon: <MonitorIcon className="size-4" />, label: 'System' },
	{ value: 'dark', icon: <MoonIcon className="size-4" />, label: 'Dark' },
];

export function ThemeToggle() {
	const [theme, setTheme] = useTheme();
	return (
		<div className="flex items-center bg-muted dark:bg-black rounded-xl p-0.5 gap-0.5">
			{OPTIONS.map(({ value, icon, label }) => (
				<button
					key={value}
					type="button"
					title={label}
					onClick={() => setTheme(value)}
					className={`p-1.5 rounded-lg transition-colors ${
						theme === value
							? 'bg-background text-foreground shadow-xs'
							: 'text-muted-foreground hover:text-foreground'
					}`}
				>
					{icon}
				</button>
			))}
		</div>
	);
}

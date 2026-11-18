export const navigationLinkClasses =
	'flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring';

export const navigationInactiveProps = {
	className: 'text-muted-foreground hover:bg-accent hover:text-foreground',
};

export const navigationActiveProps = {
	className: 'bg-primary/10 text-primary dark:bg-white/10 dark:text-white',
};

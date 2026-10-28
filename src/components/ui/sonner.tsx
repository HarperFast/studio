// import { useTheme } from 'next-themes';
import { Toaster as Sonner, ToasterProps } from 'sonner';

const Toaster = ({ ...props }: ToasterProps) => {
	// const { theme = 'system' } = useTheme();

	return (
		<Sonner
			// theme={theme as ToasterProps['theme']}
			className="toaster group"
			// Sonner's own 24px/16px gaps, kept clear of the system notification banner.
			offset={{ bottom: 'calc(24px + var(--notification-banner-height))' }}
			mobileOffset={{ bottom: 'calc(16px + var(--notification-banner-height))' }}
			toastOptions={{
				classNames: {
					toast:
						'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
					description: 'group-[.toast]:text-muted-foreground',
					actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground font-medium',
					cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground font-medium',
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };

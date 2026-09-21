import { LucideIcon } from 'lucide-react';

export function AuthHeading({ icon: Icon, title, subtitle, loading = false }: {
	icon: LucideIcon;
	title: string;
	subtitle?: string;
	loading?: boolean;
}) {
	return (
		<div className="auth-heading">
			<span className="auth-status-icon">
				<Icon aria-hidden="true" className={loading ? 'auth-loading-icon' : undefined} />
			</span>
			<div>
				<h1>{title}</h1>
				{subtitle && <p className="auth-heading-subtitle">{subtitle}</p>}
			</div>
		</div>
	);
}

import { Loading } from '@/components/Loading';
import { ConfigNavigation } from '@/features/instance/config/ConfigNavigation';
import { useConfigNavigation } from '@/features/instance/config/useConfigNavigation';
import { useLoadedInstanceVersion } from '@/features/instance/useLoadedInstanceVersion';
import { Navigate, Outlet, useLocation } from '@tanstack/react-router';
import { Suspense } from 'react';
import './config-navigation.css';

export function ConfigIndex() {
	const version = useLoadedInstanceVersion();
	return version === undefined
		? <Loading className="flex flex-col items-center justify-center py-24" text="Loading..." />
		: <ConfigShell version={version} />;
}

function ConfigShell({ version }: { version: string }) {
	const { pathname } = useLocation();
	const { groups, configPath, firstExtension, canManage } = useConfigNavigation(version);

	const atIndex = pathname.replace(/\/+$/, '') === configPath;
	if (!canManage && firstExtension && atIndex) {
		return <Navigate to={firstExtension} replace />;
	}

	return (
		<div className="config-shell">
			<div className="config-layout" data-has-navigation={groups.length > 0}>
				{groups.length > 0 && <ConfigNavigation groups={groups} atIndex={atIndex} />}
				<div className="min-w-0">
					<Suspense
						fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}
					>
						<Outlet />
					</Suspense>
				</div>
			</div>
		</div>
	);
}

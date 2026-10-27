import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import { useNavigationVisibility, useVisibleExtensionPages } from '@/features/instance/extensions/useStudioExtensions';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { supportsGetStatus } from '@/integrations/api/instance/status/getStatus';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useLoaderData, useParams } from '@tanstack/react-router';
import {
	DatabaseIcon,
	GaugeIcon,
	NotepadTextIcon,
	PackageIcon,
	ServerIcon,
	SettingsIcon,
	SquareTerminalIcon,
} from 'lucide-react';
import { ReactNode, useMemo } from 'react';

export interface InstanceNavLink {
	/** A built-in tab (`applications`, …) or a component page's `<component>.<id>`. */
	key: string;
	to: string;
	name: string;
	shortName?: string;
	icon: ReactNode;
	activeOptions?: { exact: boolean };
}

/**
 * The instance nav's tabs: what the viewer's role may open, split by the cluster's `studio.navigation`
 * into the bar itself and the More menu. A hidden tab is left out of both but still opens from a link —
 * hiding focuses the UI, it doesn't restrict anything.
 */
export function useInstanceNavLinks(): { links: InstanceNavLink[]; tucked: InstanceNavLink[]; all: InstanceNavLink[] } {
	const canManage = useInstanceManagePermission();
	const params = useParams({ strict: false });
	const { version }: RegistrationInfoResponse = useLoaderData({ strict: false });
	const statusAvailable = supportsGetStatus(version) && canManage;
	const apisAvailable = wasAReleasedBeforeB('4.7.0-beta.7', version);
	const extensionTabs = useVisibleExtensionPages('tab');
	const extensionConfigEntries = useVisibleExtensionPages('config');
	const visibilityOf = useNavigationVisibility();

	return useMemo(() => {
		const all = [
			canManage && {
				key: 'applications',
				// In cluster context the bare index is the cluster home, so Applications lives at /apps.
				// Instance and local modes keep Applications at their index.
				to: params.clusterId && !params.instanceId
					? buildAbsoluteLinkToPage(params, 'apps')
					: buildAbsoluteLinkToPage(params),
				activeOptions: { exact: true },
				name: 'Applications',
				shortName: 'Apps',
				icon: <PackageIcon className="inline-block" />,
			},
			{
				key: 'databases',
				to: buildAbsoluteLinkToPage(params, 'databases'),
				icon: <DatabaseIcon className="inline-block" />,
				name: 'Databases',
			},
			canManage && apisAvailable && {
				key: 'apis',
				to: buildAbsoluteLinkToPage(params, 'apis'),
				name: 'APIs',
				icon: <ServerIcon className="inline-block" />,
			},
			canManage && {
				key: 'operations',
				to: buildAbsoluteLinkToPage(params, 'operations'),
				name: 'Operations',
				icon: <SquareTerminalIcon className="inline-block" />,
			},
			canManage && statusAvailable && {
				key: 'status',
				to: buildAbsoluteLinkToPage(params, 'status'),
				icon: <GaugeIcon className="inline-block" />,
				name: 'Status',
			},
			canManage && {
				key: 'logs',
				to: buildAbsoluteLinkToPage(params, 'logs'),
				icon: <NotepadTextIcon className="inline-block" />,
				name: 'Logs',
			},
			// Tabs added by the cluster's components, after the built-in ones and ahead of Config.
			...extensionTabs.map((page) => ({
				key: page.key,
				to: buildAbsoluteLinkToPage(params, `ext/${page.key}`),
				icon: <ExtensionIcon name={page.icon} className="inline-block" />,
				name: page.name,
			})),
			// Config is a super-user page, except that a component can add an entry a lesser role may open;
			// then Config holds just those entries for them.
			(canManage || extensionConfigEntries.length > 0) && {
				key: 'config',
				to: buildAbsoluteLinkToPage(params, 'config'),
				icon: <SettingsIcon className="inline-block" />,
				name: 'Config',
			},
		].filter(excludeFalsy) satisfies InstanceNavLink[];
		return {
			all,
			links: all.filter((link) => visibilityOf(link.key) === 'visible'),
			tucked: all.filter((link) => visibilityOf(link.key) === 'tucked'),
		};
	}, [canManage, params, apisAvailable, statusAvailable, extensionTabs, extensionConfigEntries.length, visibilityOf]);
}

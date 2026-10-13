import { ServiceAccountsSection } from '@/features/organization/serviceAccounts/ServiceAccountsSection';
import { ApiTokensSetting } from '@/features/organization/settings/ApiTokensSetting';
import { SettingsSection } from '@/features/organization/settings/SettingsSection';
import { useCanManageServiceAccounts } from '@/hooks/usePermissions';

/** Organization admins only, as central manager enforces; other members with settings access see none of it. */
export function ApiAccessSettings(
	{ organizationId, apiTokensEnabled }: { organizationId: string; apiTokensEnabled: boolean },
) {
	const canManage = useCanManageServiceAccounts(organizationId);
	if (!canManage) {
		return null;
	}
	return (
		<SettingsSection title="API access" bodyClassName="p-0">
			<ApiTokensSetting organizationId={organizationId} enabled={apiTokensEnabled} />
			<ServiceAccountsSection organizationId={organizationId} />
		</SettingsSection>
	);
}

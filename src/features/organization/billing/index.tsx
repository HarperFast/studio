import { SubNavMenu } from '@/components/SubNavMenu';
import { OrgPageLayout } from '@/features/organization/components/OrgPageLayout';
import { useOrganizationPermissions } from '@/hooks/usePermissions';
import { Outlet, useParams } from '@tanstack/react-router';

export function OrgBillingIndex() {
	const { organizationId } = useParams({ strict: false });
	const { update } = useOrganizationPermissions(organizationId);

	if (!update) {
		return (
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				You don't have access to manage payments for this organization. Please contact your administrator.
			</div>
		);
	}

	// Payment Method and Invoices are surfaced as sub-items under Billing in the org sub-nav
	// (OrgPageLayout), so this layout just hosts the active billing page.
	return (
		<>
			<SubNavMenu />
			<OrgPageLayout>
				<Outlet />
			</OrgPageLayout>
		</>
	);
}

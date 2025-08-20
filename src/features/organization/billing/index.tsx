import { useOrganizationPermissions } from '@/hooks/usePermissions';
import { Link, Outlet, useParams } from '@tanstack/react-router';
import { CreditCardIcon, ReceiptIcon, ReceiptTextIcon } from 'lucide-react';

const sharedClasses = 'flex items-center p-2 rounded-lg group';
const inactiveProps = { className: 'text-white hover:bg-gray-700' };
const activeProps = { className: 'text-black bg-white pointer-events-none cursor-default' };

export function OrgBillingIndex() {
	const { organizationId } = useParams({ strict: false });
	const { update } = useOrganizationPermissions(organizationId);

	if (!update) {
		return (
			<div className="mt-20 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				You don't have access to manage payments for this organization. Please contact your administrator.
			</div>
		);
	}

	return (
		<div className="mt-20 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
			<div className="md:grid gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))] mb-12">
				<section className="col-span-1 text-white md:col-span-4 lg:col-span-3 md:border-r-1 border-b md:border-b-0 md:pr-4 border-gray-700">
					<DesktopBillingNavBar />
					<MobileBillingNavBar />
				</section>
				<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
					<Outlet />
				</section>
			</div>
		</div>
	);
}

function DesktopBillingNavBar() {
	return (
		<div className="hidden md:block">
			<span className={sharedClasses}>
				<ReceiptIcon className="inline-block" />
				<h3 className="ms-3 text-2xl font-extrabold dark:text-white">Billing</h3>
			</span>

			<ul className="border-t border-gray-700 pt-4 mt-4 space-y-2">
				<li>
					<Link to={``} className={sharedClasses} activeOptions={{ exact: true }} inactiveProps={inactiveProps} activeProps={activeProps}>
						<CreditCardIcon className="inline-block" /> <span className="ms-3">Payment Method</span>
					</Link>
				</li>
				<li>
					<Link to={`invoices`} className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
						<ReceiptTextIcon className="inline-block" /> <span className="ms-3">Invoices &amp; Payments</span>
					</Link>
				</li>
			</ul>
		</div>
	);
}

function MobileBillingNavBar() {
	return (
		<ul className="flex space-x-4 md:hidden py-2">
			<li>
				<Link to={``} className={sharedClasses} activeOptions={{ exact: true }} inactiveProps={inactiveProps} activeProps={activeProps}>
					<CreditCardIcon className="inline-block" /> <span className="ms-3">Payment Method</span>
				</Link>
			</li>
			<li>
				<Link to={`invoices`} className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
					<ReceiptTextIcon className="inline-block" /> <span className="ms-3">Invoices &amp; Payments</span>
				</Link>
			</li>
		</ul>
	);
}

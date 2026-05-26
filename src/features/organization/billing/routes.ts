import type { orgLayoutRoute } from '@/features/organization/routes';
import { createRoute } from '@tanstack/react-router';
import { ConfirmSetupIntent } from './confirm/ConfirmSetupIntent';
import { OrgBillingIndex } from './index';
import { Invoices } from './invoices/Invoices';
import { PaymentMethodsDisplay } from './paymentMethod/PaymentMethodsDisplay';

export function createBillingRouteTree(parentRoute: typeof orgLayoutRoute) {
	const rootRoute = createRoute({
		getParentRoute: () => parentRoute,
		path: 'billing',
		head: () => ({ meta: [{ title: 'Billing — Harper Fabric' }] }),
		component: OrgBillingIndex,
	});
	const paymentMethodsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		head: () => ({ meta: [{ title: 'Payment Methods — Harper Fabric' }] }),
		component: PaymentMethodsDisplay,
	});
	const invoicesRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'invoices',
		head: () => ({ meta: [{ title: 'Invoices — Harper Fabric' }] }),
		component: Invoices,
	});
	const confirmRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'confirm',
		head: () => ({ meta: [{ title: 'Confirm Payment — Harper Fabric' }] }),
		component: ConfirmSetupIntent,
	});

	return rootRoute.addChildren([
		paymentMethodsRoute,
		invoicesRoute,
		confirmRoute,
	]);
}

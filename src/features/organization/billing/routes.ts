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
		component: OrgBillingIndex,
	});
	const paymentMethodsRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: '/',
		component: PaymentMethodsDisplay,
	});
	const invoicesRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'invoices',
		component: Invoices,
	});
	const confirmRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: 'confirm',
		component: ConfirmSetupIntent,
	});

	return rootRoute.addChildren([
		paymentMethodsRoute,
		invoicesRoute,
		confirmRoute,
	]);
}

import { StripeElementsOptions } from '@stripe/stripe-js';
import { createContext, useContext } from 'react';

export const StripeContext = createContext<StripeElementsOptions | null>(null);

export function useStripeOptions() {
	return useContext(StripeContext) as StripeElementsOptions;
}

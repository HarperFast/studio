import { loadStripe, Stripe } from '@stripe/stripe-js';

let cachedPromise: Promise<Stripe | null> | null = null;

export async function stripePromise(): Promise<Stripe | null> {
	if (cachedPromise !== null) {
		return cachedPromise;
	}
	return cachedPromise = loadStripe(import.meta.env.VITE_PUBLIC_STRIPE_KEY);
}

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { defaultInstanceRoute, isLocalStudio } from '@/config/constants';
import { useOverallAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { isValidElement, ReactNode } from 'react';

interface ErrorProps {
	className?: string | undefined;
	// `unknown`, not `Error`, so this stays assignable to TanStack Router's
	// ErrorRouteComponent: router-core types ErrorComponentProps['error'] as
	// `unknown` by default (DefaultErrorBoundaryTypes), and under
	// strictFunctionTypes a narrower parameter type is not assignable.
	// It also matches reality — a throw can be any value, not just an Error.
	error: unknown;
	title?: string;
	showReturnToHome?: boolean;
	children?: ReactNode;
}

const FALLBACK_ERROR_MESSAGE = 'An unexpected error occurred.';

/**
 * Whether React can render this value as visible text.
 *
 * Deliberately narrower than ReactNode: null, undefined and booleans are all
 * legal ReactNodes but render as *nothing*, which would leave the description
 * blank. They fall through to the fallback instead.
 */
function isRenderable(value: unknown): value is ReactNode {
	if (typeof value === 'string') { return value.length > 0; }
	if (typeof value === 'number') { return true; }
	if (isValidElement(value)) { return true; }
	if (Array.isArray(value)) { return value.length > 0 && value.every(isRenderable); }
	return false;
}

/**
 * Pull something renderable out of an arbitrary thrown value.
 *
 * `error` reaches us from an error boundary, so it can be literally anything —
 * including an object whose own `message` is another object. Handing that
 * straight to React throws "Objects are not valid as a React child" *inside the
 * boundary*, turning a handled error into a white screen. Everything that is
 * not verifiably renderable becomes the fallback string.
 */
function getErrorMessage(error: unknown): ReactNode {
	if (error instanceof Error) {
		return error.message.length > 0 ? error.message : FALLBACK_ERROR_MESSAGE;
	}
	if (typeof error === 'object' && error !== null && 'message' in error) {
		const message = (error as { message: unknown }).message;
		return isRenderable(message) ? message : FALLBACK_ERROR_MESSAGE;
	}
	if (isRenderable(error)) { return error; }
	return FALLBACK_ERROR_MESSAGE;
}

export function ErrorComponent({ className, error, title, showReturnToHome, children }: ErrorProps) {
	const { user, isLoading: isUserLoading } = useOverallAuth();
	const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);
	const message = getErrorMessage(error);

	return (
		<Card className={cn('text-red p-5 border border-red rounded-md m-12 mt-36', className)}>
			<CardHeader>
				<CardTitle className="text-2xl">
					<h2>{title ?? 'Component Error'}</h2>
				</CardTitle>
				<CardDescription>{message}</CardDescription>
			</CardHeader>
			<CardContent>
				{children}
				{showReturnToHome !== false && (user && !isUserLoading
					? (
						<Link to={isLocalStudio ? defaultInstanceRoute : defaultCloudRoute}>
							<Button>
								{' '}
								<ArrowLeft /> Return to Home
							</Button>
						</Link>
					)
					: (
						<Link to="/sign-in">
							<Button>
								{' '}
								<ArrowLeft /> Go to Sign In Page
							</Button>
						</Link>
					))}
			</CardContent>
		</Card>
	);
}

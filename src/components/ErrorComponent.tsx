import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { defaultInstanceRoute, isLocalStudio } from '@/config/constants';
import { useOverallAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import { errorStatus } from '@/lib/errorStatus';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { Link, useRouter } from '@tanstack/react-router';
import { AxiosError } from 'axios';
import { ArrowLeft, RotateCw } from 'lucide-react';
import { isValidElement, ReactNode, useState } from 'react';

interface ErrorProps {
	className?: string | undefined;
	// `unknown`, not `Error`, so this stays assignable to TanStack Router's
	// ErrorRouteComponent: router-core types ErrorComponentProps['error'] as
	// `unknown` by default (DefaultErrorBoundaryTypes), and under
	// strictFunctionTypes a narrower parameter type is not assignable.
	// It also matches reality — a throw can be any value, not just an Error.
	error: unknown;
	title?: string;
	description?: ReactNode;
	showReturnToHome?: boolean;
	// TanStack Router passes this only to a route error component, so its presence is what says
	// reloading the route can retry the failure. Retrying calls `router.invalidate()`, not `reset`:
	// a reset alone re-renders the match, which re-throws the error it still holds.
	reset?: () => void;
	children?: ReactNode;
}

const FALLBACK_ERROR_MESSAGE = 'An unexpected error occurred.';
const GENERIC_TITLE = 'Something Went Wrong';

interface FailureCopy {
	title: string;
	description: string;
	retryable?: boolean;
}

const FORBIDDEN_COPY: FailureCopy = {
	title: 'Access Denied',
	description:
		"Your account doesn't have permission to view this. If you think it should, ask an administrator for access.",
};

const NOT_FOUND_COPY: FailureCopy = {
	title: 'Not Found',
	description: "We couldn't find what you were looking for. It may have been deleted, or the link may be wrong.",
};

const UNREACHABLE_COPY: FailureCopy = {
	title: "Couldn't Reach the Server",
	description: "The request didn't get an answer. Check your connection, then try again.",
	retryable: true,
};

const NO_RESPONSE_CODES: ReadonlySet<unknown> = new Set([
	AxiosError.ERR_NETWORK,
	AxiosError.ECONNABORTED,
	AxiosError.ETIMEDOUT,
]);

function errorCode(error: unknown): unknown {
	try {
		return (error as { code?: unknown } | null | undefined)?.code;
	} catch {
		return undefined;
	}
}

function describeFailure(error: unknown): FailureCopy | undefined {
	const status = errorStatus(error);
	if (status === 403) { return FORBIDDEN_COPY; }
	if (status === 404) { return NOT_FOUND_COPY; }
	if (typeof status === 'number') {
		return status >= 500 && status < 600
			? {
				title: GENERIC_TITLE,
				description: `The server couldn't load this (error ${status}). Try again in a moment.`,
				retryable: true,
			}
			: undefined;
	}
	return NO_RESPONSE_CODES.has(errorCode(error)) ? UNREACHABLE_COPY : undefined;
}

function RetryButton() {
	const router = useRouter();
	const [retrying, setRetrying] = useState(false);
	return (
		<Button
			type="button"
			variant="outline"
			disabled={retrying}
			onClick={() => {
				setRetrying(true);
				void router.invalidate().finally(() => setRetrying(false));
			}}
		>
			<RotateCw /> {retrying ? 'Trying Again…' : 'Try Again'}
		</Button>
	);
}

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
 * not verifiably renderable becomes the fallback string, and so does a value
 * whose properties throw when read, which would white-screen the same way.
 */
function getErrorMessage(error: unknown): ReactNode {
	try {
		if (error instanceof Error) {
			return error.message.length > 0 ? error.message : FALLBACK_ERROR_MESSAGE;
		}
		if (typeof error === 'object' && error !== null && 'message' in error) {
			const message = (error as { message: unknown }).message;
			return isRenderable(message) ? message : FALLBACK_ERROR_MESSAGE;
		}
		if (isRenderable(error)) { return error; }
	} catch {
		return FALLBACK_ERROR_MESSAGE;
	}
	return FALLBACK_ERROR_MESSAGE;
}

export function ErrorComponent(
	{ className, error, title, description, showReturnToHome, reset, children }: ErrorProps,
) {
	const { user, isLoading: isUserLoading } = useOverallAuth();
	const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);
	const failureCopy = describeFailure(error);
	const canRetry = reset !== undefined && failureCopy?.retryable === true;

	return (
		<Card
			data-testid="error-component"
			className={cn('text-red p-5 border border-red rounded-md m-12 mt-36', className)}
		>
			<CardHeader>
				<CardTitle className="text-2xl">
					<h2>{title ?? failureCopy?.title ?? GENERIC_TITLE}</h2>
				</CardTitle>
				<CardDescription>{description ?? failureCopy?.description ?? getErrorMessage(error)}</CardDescription>
			</CardHeader>
			<CardContent>
				{children}
				{(canRetry || showReturnToHome !== false) && (
					<div className="flex flex-wrap gap-2">
						{canRetry && <RetryButton />}
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
					</div>
				)}
			</CardContent>
		</Card>
	);
}

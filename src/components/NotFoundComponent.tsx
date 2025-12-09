import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { defaultInstanceRoute, isLocalStudio } from '@/config/constants';
import { useOverallAuth } from '@/hooks/useAuth';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

export function NotFoundComponent() {
	const { user, isLoading: isUserLoading } = useOverallAuth();
	const defaultCloudRoute = getDefaultSignedInCloudRouteForUser(user);
	return (
		<div className="flex items-center justify-center h-screen px-3">
			<Card className="text-red p-5 border border-red rounded-md w-full max-w-md">
				<CardHeader>
					<CardTitle className="text-2xl">
						<h2>Sorry, Page Not Found</h2>
					</CardTitle>
				</CardHeader>
				<CardContent>
					{user && !isUserLoading
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
									<ArrowLeft /> Go Sign In Page
								</Button>
							</Link>
						)}
				</CardContent>
			</Card>
		</div>
	);
}

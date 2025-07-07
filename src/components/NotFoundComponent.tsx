import { Link } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export function NotFoundComponent() {
	const { user, isLoading: isUserLoading } = useAuth();
	return (
		<div className="flex items-center justify-center h-screen px-3">
			<Card className="text-red p-5 border border-red rounded-md w-full max-w-md">
				<CardHeader>
					<CardTitle className="text-2xl">
						<h2>Sorry, Page Not Found</h2>
					</CardTitle>
				</CardHeader>
				<CardContent>
					{user && !isUserLoading ? (
						<Link to="/orgs">
							<Button>
								{' '}
								<ArrowLeft /> See Orgs List
							</Button>
						</Link>
					) : (
						<Link to="/">
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

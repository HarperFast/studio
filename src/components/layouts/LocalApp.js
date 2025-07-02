import React, { useEffect, useState, lazy, Suspense } from 'react';
import { Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import usePersistedUser from '../../functions/state/persistedUser';
import config from '../../config';

import Loader from '../shared/Loader';
import ErrorFallback from '../shared/ErrorFallback';
import ErrorFallbackAuth from '../shared/ErrorFallbackAuth';

import init from '../../functions/app/init';
import changeFavIcon from '../../functions/app/changeFavIcon';
import useInstanceAuth from '../../functions/state/instanceAuths';

const TopNav = lazy(() => import(/* webpackChunkName: "topnav" */ '../TopNav'));
const Instance = lazy(() => import(/* webpackChunkName: "instance" */ '../instance'));
const SignIn = lazy(() => import(/* webpackChunkName: "signIn" */ '../auth/LocalSignIn'));

let controller;

function LocalApp() {
	const navigate = useNavigate();
	const location = useLocation();
	const [fetchingUser, setFetchingUser] = useState(true);
	const [persistedUser, setPersistedUser] = usePersistedUser({});
	const [instanceAuths] = useInstanceAuth({});

	useEffect(() => {
		changeFavIcon(persistedUser?.theme);
	}, [persistedUser?.theme]);

	useEffect(() => {
		init({
			currentPath: location.pathname,
			navigate,
			persistedUser,
			setPersistedUser,
			setFetchingUser,
			instanceAuths,
			controller,
		});
		// eslint-disable-next-line
	}, []);

	return (
		<div id="local-studio" className={`${persistedUser.theme}`}>
			<div className="vh-100">
				<Suspense fallback={<Loader header=" " spinner />}>
					<TopNav loggedIn={instanceAuths?.local?.valid} />
				</Suspense>
				{fetchingUser ? (
					<Loader header="Signing in" spinner />
				) : instanceAuths?.local?.valid ? (
					<div id="app-container">
						<ErrorBoundary FallbackComponent={ErrorFallback}>
							<Suspense fallback={<Loader header=" " spinner />}>
								{/* can we put instance routes in here, each in a suspense tag (since they're lazily loaded) */}
								<Routes>
									<Route element={<Instance />} path="/o/:customer_id/i/:compute_stack_id/*" />
									<Route element={<Navigate to="/" replace />} />
								</Routes>
							</Suspense>
						</ErrorBoundary>
					</div>
				) : (
					<div className="d-flex justify-content-center align-items-center h-100">
						<ErrorBoundary FallbackComponent={ErrorFallbackAuth}>
							<Suspense fallback={<Loader header=" " spinner />}>
								<Routes>
									<Route element={<SignIn />} path="/" />
								</Routes>
							</Suspense>
						</ErrorBoundary>
					</div>
				)}
			</div>
			<div id="app-bg-color" />
			<div className="version">Harper Local Studio v{config.studio_version}</div>
		</div>
	);
}

export default LocalApp;

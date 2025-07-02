import React, { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import routes from './routes';
import SubNav from '../shared/SubNav';
import Loader from '../shared/Loader';

function ProfileIndex() {
	return (
		<>
			<SubNav />
			<Suspense fallback={<Loader header=" " spinner />}>
				<Routes>
					{routes.map((route) => (
						<Route key={route.path} path={route.path} element={route.element} />
					))}
					<Route path="*" key="*" element={<Navigate to="/profile" replace />} />
				</Routes>
			</Suspense>
		</>
	);
}

export default ProfileIndex;

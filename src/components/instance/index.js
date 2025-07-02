import React, { useState, Suspense } from 'react';
import { Navigate, Route, Routes, useParams, useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';
import useAsyncEffect from 'use-async-effect';
import useInterval from 'use-interval';

import appState from '../../functions/state/appState';
import instanceState from '../../functions/state/instanceState';
import useInstanceAuth from '../../functions/state/instanceAuths';

import SubNav from './Subnav';
import routes from './routes';
import buildInstanceStructure from '../../functions/instance/browse/buildInstanceStructure';
import Loader from '../shared/Loader';
import getInstances from '../../functions/api/lms/getInstances';
import getCustomer from '../../functions/api/lms/getCustomer';
import getAlarms from '../../functions/api/lms/getAlarms';
import config from '../../config';
import userInfo from '../../functions/api/instance/userInfo';
import registrationInfo from '../../functions/api/instance/registrationInfo';

function InstanceIndex() {
	const { compute_stack_id, customer_id } = useParams();
	const alert = useAlert();
	const navigate = useNavigate();
	const [loadingInstance, setLoadingInstance] = useState(true);
	const [instanceAuths, setInstanceAuths] = useInstanceAuth({});
	const instanceAuth = instanceAuths && instanceAuths[compute_stack_id];
	const auth = useStoreState(appState, (s) => s.auth);
	const isOrgUser = useStoreState(appState, (s) =>
		s.auth?.orgs?.find((o) => o.customer_id?.toString() === customer_id)
	);
	const products = useStoreState(appState, (s) => s.products);
	const regions = useStoreState(appState, (s) => s.regions);
	const subscriptions = useStoreState(appState, (s) => s.subscriptions);
	const instances = useStoreState(appState, (s) => s.instances);
	const thisInstance = useStoreState(
		appState,
		(s) => compute_stack_id && s.instances && s.instances.find((i) => i.compute_stack_id === compute_stack_id),
		[compute_stack_id]
	);
	const url = useStoreState(instanceState, (s) => s.url);
	const restarting = useStoreState(instanceState, (s) => s.restarting);
	const registration = useStoreState(instanceState, (s) => s.registration);
	const hydratedRoutes = routes({ customer_id, super_user: instanceAuth?.super, version: registration?.version });
	const [mounted, setMounted] = useState(false);

	useAsyncEffect(() => {
		if (!config.is_local_studio && auth && customer_id) {
			getCustomer({ auth, customer_id });
		}
	}, [auth, customer_id, config.is_local_studio]);

	useAsyncEffect(() => {
		if (!config.is_local_studio && auth && customer_id) {
			getAlarms({ auth, customer_id });
		}
	}, [auth, customer_id, instances, config.is_local_studio]);

	useAsyncEffect(() => {
		if (auth && products && regions && subscriptions && customer_id && !instances?.length) {
			getInstances({ auth, customer_id, products, regions, subscriptions, instanceCount: instances?.length });
		}
	}, [auth, products, regions, customer_id, subscriptions, instances]);

	useAsyncEffect(async () => {
		if (thisInstance && instanceAuth) {
			instanceState.update(() => thisInstance);
			const { error } = await buildInstanceStructure({ auth: instanceAuth, url: thisInstance.url });
			setLoadingInstance(false);
			if (error) {
				if (config.is_local_studio) {
					setInstanceAuths({ ...instanceAuths, local: false });
					setTimeout(() => navigate(`/`), 10);
				} else {
					setTimeout(() => navigate(`/o/${customer_id}/instances`), 10);
				}
			}
		}
	}, [thisInstance]);

	useAsyncEffect(() => {
		if (mounted && url && instanceAuth?.super) {
			alert.success('Your instance user role has been upgraded to super_user');
		} else if (mounted && url) {
			alert.success('Your instance user role has been downgraded to standard');
		}
	}, [alert, instanceAuth?.super]);

	useAsyncEffect(
		() => setMounted(true),
		() => setMounted(false),
		[]
	);

	useInterval(async () => {
		if (url && !config.is_local_studio) {
			const result = await userInfo({ auth: instanceAuth, url });
			if (result.error && result.message !== 'Network request failed' && !restarting) {
				alert.error('Unable to connect to instance.');
				navigate(`/o/${customer_id}/instances`);
			} else if (!result.error && restarting) {
				instanceState.update((s) => {
					s.restarting = false;
				});
			} else if (!result.error && instanceAuth?.super !== result.role?.permission?.super_user) {
				setInstanceAuths({
					...instanceAuths,
					[compute_stack_id]: { ...instanceAuth, super: result.role?.permission?.super_user },
				});
			}
		}
	}, config.check_user_interval);

	return (
		<>
			<SubNav routes={hydratedRoutes} />
			{(config.is_local_studio || (isOrgUser && instances)) && !loadingInstance ? (
				<Suspense fallback={<Loader header=" " spinner />}>
					<Routes>
						{hydratedRoutes.map((route) => (
							<Route path={route.path} key={route.path} element={route.element} />
						))}
						<Route path="*" element={<Navigate to={hydratedRoutes[0].path} replace />} />
					</Routes>
				</Suspense>
			) : (
				<Loader header="loading instance" spinner />
			)}
		</>
	);
}

export default InstanceIndex;

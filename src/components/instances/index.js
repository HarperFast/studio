import React, { useEffect, useCallback } from 'react';
import { Row } from 'reactstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';
import useInterval from 'use-interval';

import config from '../../config';
import appState from '../../functions/state/appState';

import InstanceList from './list/InstanceList';
import NewInstanceCard from './list/NewInstanceCard';
import NoInstancesCard from './list/NoInstancesCard';
import SubNav from './SubNav';
import NewInstanceModal from './new';
import getInstances from '../../functions/api/lms/getInstances';
import Loader from '../shared/Loader';
import getCustomer from '../../functions/api/lms/getCustomer';
import getAlarms from '../../functions/api/lms/getAlarms';

function InstancesIndex() {
	const navigate = useNavigate();
	const { action, customer_id } = useParams();
	const alert = useAlert();
	const auth = useStoreState(appState, (s) => s.auth);
	const is_unpaid = useStoreState(appState, (s) => s.customer.is_unpaid || s.theme === 'akamai');
	const unlimited_local_install = useStoreState(appState, (s) => s.customer.unlimited_local_install);
	const products = useStoreState(appState, (s) => s.products);
	const regions = useStoreState(appState, (s) => s.regions);
	const subscriptions = useStoreState(appState, (s) => s.subscriptions);
	const instances = useStoreState(appState, (s) => s.instances);
	const isOrgUser = useStoreState(
		appState,
		(s) => s.auth?.orgs?.find((o) => o.customer_id?.toString() === customer_id && o.status !== 'invited'),
		[customer_id]
	);
	const isOrgOwner = isOrgUser?.status === 'owner';

	const refreshInstances = useCallback(() => {
		if (auth && customer_id && products && regions && subscriptions) {
			getInstances({ auth, customer_id, products, regions, subscriptions, instanceCount: instances?.length });
		}
	}, [auth, customer_id, products, regions, subscriptions, instances?.length]);

	useEffect(() => {
		refreshInstances();
		// eslint-disable-next-line
	}, [auth, customer_id, products, regions, subscriptions]);

	useEffect(() => {
		if (action === 'login') {
			alert.error('Please log in to that instance');
		} else if (!isOrgUser) {
			alert.error('You have been removed from this organization');
			navigate('/');
		}
	}, [action, alert, isOrgUser, navigate]);

	useEffect(() => {
		if (auth && customer_id) {
			getCustomer({ auth, customer_id });
			getAlarms({ auth, customer_id });
		}
	}, [customer_id, auth]);

	useInterval(
		() =>
			instances?.some((i) => ['CREATE_IN_PROGRESS', 'UPDATE_IN_PROGRESS', 'CONFIGURING_NETWORK'].includes(i.status)) &&
			refreshInstances(),
		config.refresh_content_interval
	);

	return (
		<div id="instances">
			<SubNav refreshInstances={refreshInstances} unlimitedLocalInstall={unlimited_local_install} unPaid={is_unpaid} />
			{isOrgUser && instances ? (
				<>
					<Row>
						{isOrgOwner ? <NewInstanceCard /> : !instances?.length ? <NoInstancesCard /> : null}
						<InstanceList />
					</Row>
					{action === 'new' && instances && <NewInstanceModal />}
				</>
			) : (
				<Loader header="loading instances" spinner />
			)}
		</div>
	);
}

export default InstancesIndex;

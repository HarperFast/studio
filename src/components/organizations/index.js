import React, { useEffect } from 'react';
import { Row } from 'reactstrap';
import { useParams, useNavigate } from 'react-router-dom';
import { useStoreState } from 'pullstate';

import appState from '../../functions/state/appState';

import SubNav from './SubNav';
import OrgList from './list/OrgList';
import Loader from '../shared/Loader';

function OrganizationsIndex() {
	const { list } = useParams();
	const navigate = useNavigate();
	const auth = useStoreState(appState, (s) => s.auth);

	useEffect(() =>
		appState.update((s) => {
			s.users = false;
			s.instances = false;
			s.hasCard = false;
			s.lastUpdate = false;
		})
	);

	useEffect(() => {
		const activeOrgs = auth?.orgs.filter((o) => ['accepted', 'owner'].includes(o.status));
		if (activeOrgs.length === 1 && (!list || list === 'sign-up')) {
			navigate(`/o/${auth.orgs[0].customer_id}/instances`);
		}
		// eslint-disable-next-line
	}, [auth, list]);

	return (
		<div id="organizations">
			<SubNav />
			{auth?.orgs ? (
				<Row>
					<OrgList />
				</Row>
			) : (
				<Loader header="loading organizations" spinner />
			)}
		</div>
	);
}

export default OrganizationsIndex;

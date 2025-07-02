import React, { useEffect, useCallback } from 'react';
import { Row, Col } from 'reactstrap';
import { useStoreState } from 'pullstate';
import useInterval from 'use-interval';
import { useParams } from 'react-router-dom';

import appState from '../../../functions/state/appState';
import DataTable from './Datatable';
import EditUser from './Edit';
import AddUserForm from './Add';
import getUsers from '../../../functions/api/lms/getUsers';
import config from '../../../config';
import getCustomer from '../../../functions/api/lms/getCustomer';

function UsersIndex() {
	const { user_id, customer_id } = useParams();
	const auth = useStoreState(appState, (s) => s.auth);
	const users = useStoreState(appState, (s) => s.users);
	const thisUser = user_id && users && users.find((u) => u.user_id === user_id);

	const refreshUsers = useCallback(() => {
		if (auth && customer_id) {
			getUsers({ auth, customer_id });
		}
	}, [auth, customer_id]);

	useEffect(
		() => {
			refreshUsers();
			getCustomer({ auth, customer_id });
		},
		// eslint-disable-next-line
		[]
	);

	useInterval(() => refreshUsers(), config.refresh_content_interval);

	return (
		<Row>
			<Col xl="3" lg="4" md="5" xs="12">
				<span className="floating-card-header">add org user</span>
				<AddUserForm
					refreshUsers={refreshUsers}
					userEmails={users && users.map((u) => u.orgs[0].status !== 'declined' && u)}
				/>
			</Col>
			<Col xl="9" lg="8" md="7" xs="12" className="pb-5">
				{thisUser ? <EditUser userEmail={thisUser.email} /> : <DataTable refreshUsers={refreshUsers} />}
			</Col>
		</Row>
	);
}

export default UsersIndex;

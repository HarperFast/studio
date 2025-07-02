import React, { lazy, Suspense, useState } from 'react';
import { Row, Col } from 'reactstrap';
import { useParams } from 'react-router-dom';

import AddUserForm from './Add';
import Loader from '../../shared/Loader';

const DataTable = lazy(() => import(/* webpackChunkName: "instance-users-datatable" */ './Datatable'));
const EditUser = lazy(() => import(/* webpackChunkName: "instance-users-edit" */ './Edit'));

function UsersIndex() {
	const { username } = useParams();
	const [lastUpdate, setLastUpdate] = useState(true);

	return (
		<Row>
			<Col xl="3" lg="4" md="5" xs="12">
				<AddUserForm setLastUpdate={setLastUpdate} />
			</Col>
			<Col xl="9" lg="8" md="7" xs="12" className="pb-5">
				<Suspense fallback={<Loader header=" " spinner />}>
					{username ? <EditUser /> : <DataTable lastUpdate={lastUpdate} setLastUpdate={setLastUpdate} />}
				</Suspense>
			</Col>
		</Row>
	);
}

export default UsersIndex;

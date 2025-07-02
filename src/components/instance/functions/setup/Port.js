import React, { useState } from 'react';
import { Row, Col, Button, Input, Card, CardBody } from 'reactstrap';
import useAsyncEffect from 'use-async-effect';
import { useStoreState } from 'pullstate';

import isNumeric from '../../../../functions/util/isNumeric';
import buildCustomFunctions from '../../../../functions/instance/functions/buildCustomFunctions';
import setCustomFunctionsPort from '../../../../functions/instance/setCustomFunctionsPort';
import instanceState from '../../../../functions/state/instanceState';

function Port() {
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const is_local = useStoreState(instanceState, (s) => s.is_local);
	const custom_functions_port = useStoreState(instanceState, (s) => s.custom_functions?.port);
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({ port: custom_functions_port || 9926 });

	useAsyncEffect(async () => {
		const { submitted } = formState;
		if (submitted) {
			const { port } = formData;
			if (!port) {
				setFormState({ error: 'All fields are required' });
			} else if (!isNumeric(port)) {
				setFormState({ error: 'port must be a valid number' });
			} else {
				const response = await setCustomFunctionsPort({ auth, url, port });
				if (!response.error) {
					buildCustomFunctions({ auth, url });
				} else {
					setFormState({ error: response.message });
				}
			}
		}
	}, [formState]);

	useAsyncEffect(() => {
		if (!formState.submitted) {
			setFormState({});
		}
	}, [formData]);

	return is_local && !custom_functions_port ? (
		<>
			<div className="text-nowrap mb-3">Custom Functions Port</div>
			<Input
				id="custom_api_port"
				onChange={(e) => setFormData({ ...formData, port: e.target.value })}
				className={`mb-3 ${formState.error && !formData.port ? 'error' : ''}`}
				type="number"
				title="custom api port"
				placeholder="9926"
				value={formData.port}
			/>
			<Button color="success" block onClick={() => setFormState({ submitted: true })}>
				Set Custom API Port
			</Button>
			{!!formState.error && (
				<Card className="mt-3 error">
					<CardBody>{formState.error}</CardBody>
				</Card>
			)}
		</>
	) : (
		<Row>
			<Col xs="10">Custom Functions Port {is_local ? custom_functions_port : 'Set'}</Col>
			<Col xs="2" className="text-end">
				<i className="fa fa-check-circle fa-lg text-success" />
			</Col>
		</Row>
	);
}

export default Port;

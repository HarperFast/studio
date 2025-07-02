import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, CardBody, Col, Row } from 'reactstrap';
import Editor from '@monaco-editor/react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';

import instanceState from '../../../../../functions/state/instanceState';
import setCustomFunction from '../../../../../functions/api/instance/setCustomFunction';
import restartService from '../../../../../functions/api/instance/restartService';
import getCustomFunction from '../../../../../functions/api/instance/getCustomFunction';

function CodeEditor() {
	const navigate = useNavigate();
	const alert = useAlert();
	const { customer_id, compute_stack_id, project, type, file } = useParams();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const [code, setCode] = useState('');
	const [originalCode, setOriginalCode] = useState('');

	const setEditorToFile = useCallback(async () => {
		if (project && type && file && file !== 'undefined') {
			const endpoint_code = await getCustomFunction({ auth, url, project, type, file });
			setCode(endpoint_code?.message);
			setOriginalCode(endpoint_code?.message);
		} else {
			setCode('');
		}
	}, [auth, url, project, type, file, setCode]);

	const handleSubmit = async () => {
		const response = await setCustomFunction({ auth, url, function_content: code, project, type, file });

		if (response.error) {
			alert.error(response.message);
		} else {
			setTimeout(() => restartService({ auth, url, service: 'custom_functions' }), 500);
			alert.success(response.message);
		}
		setEditorToFile();
	};

	useEffect(() => {
		setEditorToFile();
	}, [project, file, setEditorToFile, compute_stack_id]);

	return (
		<>
			<Row className="floating-card-header">
				<Col>
					edit &gt;&nbsp;
					<i>
						/{project}
						{file && file !== 'undefined' && `/${type}/${file}.js`}
					</i>
				</Col>
				<Col className="text-end">
					<Button onClick={setEditorToFile} color="link" className="me-2">
						<span className="me-2">reload</span>
						<i title="Reload File" className="fa fa-sync-alt" />
					</Button>
					<span className="mx-3 text">|</span>
					<Button
						onClick={() => navigate(`/o/${customer_id}/i/${compute_stack_id}/functions/deploy/${project}`)}
						color="link"
						className="me-2"
					>
						<span className="me-2">deploy</span>
						<i title="Deploy Project" className="fa fa-share" />
					</Button>
				</Col>
			</Row>
			<Card className="my-3">
				{code ? (
					<CardBody>
						<div className="code-editor-holder">
							<Editor height="100%" defaultLanguage="javascript" value={code} theme="vs-dark" onChange={setCode} />
						</div>
						<Row>
							<Col md="6" className="mt-2">
								<Button
									block
									color="grey"
									title="Revert Code to Last Saved State"
									disabled={code === originalCode}
									onClick={setEditorToFile}
									id="reset"
								>
									<i className="fa fa-undo" />
								</Button>
							</Col>
							<Col md="6" className="mt-2">
								<Button block title="Save Code to Instance" color="success" id="addEditItem" onClick={handleSubmit}>
									<i className="fa fa-save" />
								</Button>
							</Col>
						</Row>
					</CardBody>
				) : (
					<CardBody>
						<div className="empty-prompt narrow">
							<div className="mt-3 text-bold">This project does not yet have any routes or helpers</div>
							<div className="mt-3">Add some using the form fields at left.</div>
						</div>
					</CardBody>
				)}
			</Card>
		</>
	);
}

export default CodeEditor;

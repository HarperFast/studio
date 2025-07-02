import React from 'react';
import { CardBody, Card, Button } from 'reactstrap';

function EmptyPrompt({ message, loading = false, error = false, accessErrors = false, cancel = false }) {
	const tableErrors = accessErrors && accessErrors.filter((t) => t.type === 'table');
	const attributeErrors = accessErrors && accessErrors.filter((t) => t.type === 'attribute');

	return (
		<>
			<div className="floating-card-header">&nbsp;</div>
			<Card className="my-3">
				<CardBody>
					<div className="empty-prompt">
						<div className="mb-2">&nbsp;{loading && <i className="fa fa-spinner fa-spin" />}&nbsp;</div>
						{message && <div className={`mb-2 ${error ? 'text-danger' : ''}`}>&nbsp;{message}&nbsp;</div>}
						{loading && cancel && (
							<Button color="danger" size="sm" className="px-3" onClick={cancel}>
								cancel query
							</Button>
						)}
						{error && tableErrors && tableErrors.length ? (
							<>
								<hr className="my-4" />
								<ul>
									{tableErrors.map((e) => (
										<li key={`${e.schema}${e.table}${e.entity}${e.permission}`} className="mb-2">
											{e.schema} &gt; {e.type === 'attribute' && <span>{e.table} &gt;</span>} <b>{e.entity}</b>:{' '}
											{e.type} requires <b>{e.permission}</b> permissions
										</li>
									))}
								</ul>
								<hr />
							</>
						) : null}
						{error && attributeErrors && (
							<>
								<hr className="my-4" />
								<ul>
									{attributeErrors.map((e) => (
										<li key={`${e.schema}${e.table}${e.entity}${e.permission}`} className="mb-2">
											{e.schema} &gt; {e.type === 'attribute' && <span>{e.table} &gt;</span>} <b>{e.entity}</b>:{' '}
											{e.type} requires <b>{e.permission}</b> permissions
										</li>
									))}
								</ul>
							</>
						)}
					</div>
				</CardBody>
			</Card>
		</>
	);
}

export default EmptyPrompt;

import React, { useEffect, Fragment } from 'react';
import { CardBody, Card, Row, Col, Button } from 'reactstrap';
import { useParams } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import useQueryHistory from '../../../functions/state/instanceQueries';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';

function QueryHistory({ setQuery, query }) {
	const { compute_stack_id } = useParams();
	const [queries, setQueries] = useQueryHistory({});

	useEffect(() => {
		if (query.lastUpdate) {
			const newQueries =
				(queries && queries[compute_stack_id]?.filter((q) => q.query.toLowerCase() !== query.query.toLowerCase())) ||
				[];
			newQueries.unshift(query);
			setQueries({ ...queries, [compute_stack_id]: newQueries });
		}
		// eslint-disable-next-line
	}, [query]);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<div id="query-history">
				<Row className="floating-card-header">
					<Col xs="9">query history (click to load)</Col>
					<Col xs="3" className="text-end">
						<Button
							color="link"
							title="Refresh Results"
							className="me-2"
							onClick={() => setQueries({ ...queries, [compute_stack_id]: [] })}
						>
							<i className="fa fa-trash" />
						</Button>
					</Col>
				</Row>
				<Card className="my-3">
					{queries && queries[compute_stack_id]?.length ? (
						<CardBody className="query-scroller">
							{queries[compute_stack_id].map((q, i) => (
								<Fragment key={q.query}>
									<button
										id={`loadQuery${i}`}
										type="button"
										tabIndex="0"
										title={`Load query: ${q.query}`}
										className="past-query"
										onClick={() => setQuery(q.query)}
									>
										<span>{q.query}</span>
									</button>
									<hr className="my-0" />
								</Fragment>
							))}
						</CardBody>
					) : (
						<CardBody className="text-center text-grey">no queries yet</CardBody>
					)}
				</Card>
			</div>
		</ErrorBoundary>
	);
}

export default QueryHistory;

import React, { useState, useEffect } from 'react';
import { useDebounce } from 'use-debounce';
import Select from 'react-select';
import { Input } from 'reactstrap';
import { ensureRepoExists, getGithubTags } from './lib';

export default function GithubRepoSelector({ pkg, setPackageSpec }) {
	const [user, setUser] = useState(pkg?.user || '');
	const [debouncedUser] = useDebounce(user, 300);

	const [repo, setRepo] = useState(pkg?.repo || '');
	const [debouncedRepo] = useDebounce(repo, 300);

	const [tags, setTags] = useState([]);
	// eslint-disable-next-line no-unused-vars
	const [tagsFetched, setTagsFetched] = useState(false);

	const [selectedTag, setSelectedTag] = useState(pkg?.tag || '');
	const [targetRepo, setTargetRepo] = useState('');

	const [, setLoadingTags] = useState(false);
	const [found, setFound] = useState(false);

	useEffect(() => {
		setUser(pkg?.user || '');
		setRepo(pkg?.repo || '');
		setTags(pkg?.tag ? [pkg?.tag] : []);
		setSelectedTag(pkg?.tag || '');
	}, [pkg]);

	// TODO: use named hook callbacks
	useEffect(() => {
		if (debouncedUser && debouncedRepo) {
			setLoadingTags(true);
			ensureRepoExists(user, debouncedRepo)
				.then((targetRepoName) => {
					if (targetRepoName) {
						setTargetRepo(targetRepoName);
						setFound(true);

						getGithubTags(user, debouncedRepo).then((repoTags) => {
							setLoadingTags(false);
							setTagsFetched(true);
							setTags(repoTags);
						});
					} else {
						setLoadingTags(false);
						setFound(false);
						setTargetRepo('');
						setTags([]);
					}
				})
				.catch(() => {
					setLoadingTags(false);
				});
		} else {
			setFound(false);
			setLoadingTags(false);

			setTags([]);
			setSelectedTag('');
		}
	}, [debouncedUser, debouncedRepo, user]);

	// TODO: use named hook callbacks
	useEffect(() => {
		if (!(user && repo && targetRepo)) {
			setPackageSpec('');
		} else {
			const packageSpec = selectedTag ? `${user}/${repo}#semver:${selectedTag}` : `${user}/${repo}`;
			setPackageSpec(packageSpec);
		}
	}, [targetRepo, selectedTag, user, setPackageSpec, repo]);

	return (
		<>
			<Input
				title="Github Organization"
				className="mt-2 form-control"
				valid={debouncedUser.length > 0 && debouncedRepo.length > 0 && found}
				placeholder="Github Organization"
				onChange={(e) => setUser(e.target.value)}
				value={user}
			/>

			<Input
				title="Github Repo"
				className="mt-2"
				placeholder="Github Repo"
				onChange={(e) => setRepo(e.target.value)}
				value={repo}
			/>

			{tags?.length > 0 && (
				<Select
					className="react-select-container github-tag-select mt-2"
					classNamePrefix="react-select"
					isDisabled={!targetRepo}
					isSearchable
					placeholder="Choose a tag"
					onChange={(selected) => setSelectedTag(selected.value)}
					options={tags.map((t) => ({ label: t, value: t }))}
				/>
			)}
		</>
	);
}

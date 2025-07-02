import React, { useState } from 'react';
import { useStoreState } from 'pullstate';
import { useParams } from 'react-router';
import { useAlert } from 'react-alert';

import appState from '../../../../functions/state/appState';
import instanceState from '../../../../functions/state/instanceState';
import getComponentFile from '../../../../functions/api/instance/getComponentFile';
import setComponentFile from '../../../../functions/api/instance/setComponentFile';
import addComponent from '../../../../functions/api/instance/addComponent';
import packageComponent from '../../../../functions/api/instance/packageComponent';
import dropComponent from '../../../../functions/api/instance/dropComponent';
import deployComponent from '../../../../functions/api/instance/deployComponent';
import restartService from '../../../../functions/api/instance/restartService';

import useInstanceAuth from '../../../../functions/state/instanceAuths';
import useEditorCache from '../../../../functions/state/editorCache';

import ApplicationsEditor from './applicationsEditor';
import Index from './customFunctionsEditor';

/*
 * Parse the relative path, which is what the components api expects.
 *
 * note: While 'components' root is not shown in the app,
 * the full path is components/<project name>/relative/path/to/file.js
 */

function getRelativeFilepath(absolutePath) {
	// for saving to server, which requires skipping root /components dir
	// and treating /components/projects dir as project name.
	// filepath is <project>/path/to/file.js

	return absolutePath.split('/').slice(2).join('/');
}

function getDeployTargets(instanceList, instanceAuthList, thisCsId, auth) {
	return instanceList.reduce((memo, instance) => {
		const csId = instance.compute_stack_id;
		const deployTarget = instanceAuthList[csId];

		if (!deployTarget?.version) {
			return memo;
		}

		const [major, minor] = deployTarget?.version.split('.') || [];

		// exclude < 4.2

		if (parseInt(major, 10) >= 4 && parseInt(minor, 10) >= 2) {
			memo.push({
				isCurrentInstance: csId === thisCsId,
				auth,
				instance,
			});
		}

		return memo;
	}, []);
}

function ManageIndex({ refreshCustomFunctions, loading }) {
	const { compute_stack_id } = useParams();
	const registration = useStoreState(instanceState, (s) => s.registration);
	const { fileTree } = useStoreState(instanceState, (s) => s.custom_functions);
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const [majorVersion, minorVersion] = (registration?.version || '').split('.') || [];
	const supportsApplicationsAPI = parseFloat(`${majorVersion}.${minorVersion}`) >= 4.2;
	const instances = useStoreState(appState, (s) => s.instances);
	const [instanceAuths] = useInstanceAuth({});
	const [editorCache, setEditorCache] = useEditorCache({});
	const [restartingInstance, setRestartingInstance] = useState(false);
	const alert = useAlert();

	function removeFileFromLocalStorage({ path }) {
		const updatedCache = { ...editorCache };
		const fileKey = `${compute_stack_id}_${path}`;

		if (fileKey in updatedCache) {
			delete updatedCache[fileKey];
		}

		setEditorCache({
			...updatedCache,
		});
	}

	async function saveFileToLocalStorage(selectedFile) {
		const { path, content } = selectedFile;

		const fileKey = `${compute_stack_id}_${path}`;

		setEditorCache({
			...editorCache,
			[fileKey]: content,
		});
	}

	async function restartWithLoadingState({ auth: instanceAuth, url: instanceUrl }) {
		setRestartingInstance(true);

		setTimeout(async () => {
			await restartService({
				auth: instanceAuth,
				url: instanceUrl,
				service: 'http_workers',
			});
			setRestartingInstance(false);
		}, 100);
	}

	// save file to instance
	async function saveFileToInstance(selectedFile, restartRequired) {
		// handle cached situation
		// - NOTE: this 'selectedFile' is not reactive.
		// - remove cache entry for this file
		// - update selectedFile with new content
		// - set selectedFile.cached = false.
		const filepathRelativeToProjectDir = selectedFile.path.split('/').slice(2).join('/');
		const payload = {
			auth,
			url,
			project: selectedFile.project,
			file: filepathRelativeToProjectDir,
			payload: selectedFile.content,
		};

		const { error, message } = await setComponentFile(payload);

		if (error) {
			alert.error(message);
		}

		if (restartRequired) {
			await restartWithLoadingState({ auth, url });
		}

		removeFileFromLocalStorage({ path: selectedFile.path });
		selectedFile.cached = false;

		await refreshCustomFunctions();
	}

	async function renameFile(newFileName, info) {
		const { path, content, project } = info;
		const parentDir = getRelativeFilepath(path).split('/').slice(0, -1).join('/');
		const newFilenameRelativePath = parentDir ? `${parentDir}/${newFileName}` : newFileName;

		// TODO: error handling
		await dropComponent({
			auth,
			url,
			project,
			file: getRelativeFilepath(path),
		});

		await setComponentFile({
			auth,
			url,
			project,
			file: newFilenameRelativePath,
			payload: content,
		});

		refreshCustomFunctions();
	}

	async function selectNewFile(selectedFile) {
		const { path, project, name } = selectedFile;
		const newFile = getRelativeFilepath(path);
		const fileCacheKey = `${compute_stack_id}_${path}`;
		const cachedFile = editorCache[fileCacheKey];
		const isCached = fileCacheKey in editorCache;

		if (isCached) {
			return {
				cached: isCached,
				content: cachedFile,
				path,
				project,
				name,
			};
		}

		// TODO: set file content to local storage copy if it exists.
		//
		const { error, message: content } = await getComponentFile({
			auth,
			url,
			project,
			file: newFile,
		});

		if (error) {
			alert.error(content);

			return {
				content: '',
				path,
				project,
				name,
				cached: false,
			};
		}

		return {
			cached: isCached,
			content,
			path,
			project,
			name,
		};
	}

	async function deleteFile(f) {
		const { error, message } = await dropComponent({
			auth,
			url,
			project: f.project,
			file: getRelativeFilepath(f.path),
		});

		if (error) {
			alert.error(message);
		}

		await refreshCustomFunctions();
	}

	async function deletePackage({ name: project }) {
		const { error, message } = await dropComponent({
			auth,
			url,
			project,
		});

		if (error) {
			alert.error(message);
			return;
		}

		await restartService({ auth, url, service: 'http_workers' });
		await refreshCustomFunctions();
	}

	async function deleteFolder({ path, project }) {
		const targetDirpath = getRelativeFilepath(path);

		// if we're deleting a top-level directory, that's a project,
		// so don't pass a file. otherwise pass project name and file/dir
		// relative to project name as 'file'.

		if (targetDirpath.length > 0) {
			const { error, message } = await dropComponent({
				auth,
				url,
				project,
				file: targetDirpath,
			});

			if (error) {
				alert.error(message);
			}
		} else {
			const { error, message } = await dropComponent({
				auth,
				url,
				project,
			});

			if (error) {
				alert.error(message);
			}
		}

		await refreshCustomFunctions();
	}

	async function createNewProject(newProjectName) {
		const { error, message } = await addComponent({
			auth,
			url,
			project: newProjectName,
		});

		if (error) {
			alert.error(message);
		}

		await restartService({ auth, url, service: 'http_workers' });

		await refreshCustomFunctions();
	}

	async function createNewProjectFolder(newFolderName, parentFolder) {
		const { path, project } = parentFolder;
		const relativeDirpath = getRelativeFilepath(path);
		const relativeFilepath = relativeDirpath ? `${relativeDirpath}/${newFolderName}` : newFolderName;

		const { error, message } = await setComponentFile({
			auth,
			url,
			project,
			file: relativeFilepath,
		});

		if (error) {
			alert.error(message);
		}

		await refreshCustomFunctions();
	}

	async function installPackage(projectName, packageUrl, deployTargets) {
		const deployPromises = deployTargets.map(async (t) => {
			// TODO: check error here.

			const { error, message } = await deployComponent({
				auth: t.auth,
				url: t.instance.url,
				project: projectName,
				packageUrl,
			});

			if (error) {
				alert.error(message);
			}

			// TODO: what do we actually want to do about an invalid package?
			// change to restartService({ auth, url, service: 'http_workers' });
			await restartService({
				auth: t.auth,
				url: t.instance.url,
				service: 'http_workers',
			});
		});

		await Promise.all(deployPromises);
		await refreshCustomFunctions();
	}

	async function createNewFile(newFilename, parentFolder) {
		const { path, project } = parentFolder;
		const relativeDirpath = getRelativeFilepath(path);
		const relativeFilepath = relativeDirpath ? `${relativeDirpath}/${newFilename}` : newFilename;
		const payload = '';

		// NOTE: to server, path is everything after '/components/project' in /components/project/path/to/file.js
		// in IDE land, path is full, aka, 'components/project/path/to/file.js'.

		await setComponentFile({
			auth,
			url,
			project,
			file: relativeFilepath,
			payload,
		});

		await refreshCustomFunctions();

		return {
			content: payload,
			path: [parentFolder.path, newFilename].join('/'),
			project,
		};
	}

	async function deployProject({ project, deployTarget }) {
		const { auth: otherInstanceAuth, instance: otherInstance } = deployTarget;

		const { payload } = await packageComponent({
			auth,
			url,
			project: project.name,
		});

		// deploy to targetInstance
		await deployComponent({
			auth: otherInstanceAuth,
			url: otherInstance.url,
			project: project.name,
			payload,
		});

		// restart targetInstance
		await restartService({
			auth: otherInstanceAuth,
			url: otherInstance.url,
			service: 'http_workers',
		});

		// restart this instance
		await restartService({
			auth,
			url,
			service: 'http_workers',
		});

		await refreshCustomFunctions();
	}

	async function revertFileChanges(selectedFile) {
		// unset local storage version
		removeFileFromLocalStorage({ path: selectedFile.path });

		// get canonical file version
		const { error, message } = await getComponentFile({
			auth,
			url,
			project: selectedFile.project,
			file: getRelativeFilepath(selectedFile.path),
		});

		if (error) {
			return alert.error(message);
		}

		await refreshCustomFunctions();

		// return canonical file content to caller
		return message;
	}

	return supportsApplicationsAPI ? (
		<ApplicationsEditor
			fileTree={fileTree}
			deployTargets={getDeployTargets(instances, instanceAuths, compute_stack_id, auth)}
			onRevertFile={revertFileChanges}
			onFileChange={saveFileToLocalStorage}
			onFileSave={saveFileToInstance}
			onUpdate={refreshCustomFunctions}
			onAddFile={createNewFile}
			onAddProject={createNewProject}
			onAddProjectFolder={createNewProjectFolder}
			onInstallPackage={installPackage}
			onDeployProject={deployProject}
			onDeleteFile={deleteFile}
			onDeleteFolder={deleteFolder}
			onDeletePackage={deletePackage}
			onFileSelect={selectNewFile}
			onFileRename={renameFile}
			refreshingCustomFunctions={loading}
			restartInstance={async () => restartWithLoadingState({ auth, url })}
			restartingInstance={restartingInstance}
		/>
	) : (
		<Index refreshCustomFunctions={refreshCustomFunctions} loading={loading} />
	);
}

export default ManageIndex;

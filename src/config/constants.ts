const isLocalStudio = import.meta.env.VITE_LOCAL_STUDIO === 'true';
const localStudioDevUrl = import.meta.env.VITE_LOCAL_STUDIO_DEV_URL;

export { isLocalStudio, localStudioDevUrl };

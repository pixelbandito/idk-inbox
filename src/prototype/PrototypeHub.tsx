import { useEffect, useState } from 'react';
import { ProtoIndex } from './ProtoIndex';
import { ROUTES } from './routes';

/** Current hash path (without the leading '#'), defaulting to the hub index. */
function useHashPath() {
  const [path, setPath] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const onHashChange = () => setPath(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return path;
}

/** Renders the prototype matching the current hash, or the hub index at '/'. */
export function PrototypeHub() {
  const path = useHashPath();
  const route = ROUTES.find((r) => r.path === path);
  return route ? route.element : <ProtoIndex />;
}

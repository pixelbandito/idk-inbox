// One shared resolver for read paths (list fetches) that don't hang off the
// DispatchProvider's write client. Label ids are per-account, so sign-out MUST
// reset it — useGoogleAuth.signOut does.

import { createLabelIdResolver, type LabelIdResolver } from './labelIds';

let instance = createLabelIdResolver();

export function appLabelResolver(): LabelIdResolver {
  return instance;
}

export function resetAppLabelResolver(): void {
  instance = createLabelIdResolver();
}

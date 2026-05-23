export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

// Read-only Gmail scope for the de-risking slice. Later phases widen this.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

if (!GOOGLE_CLIENT_ID) {
  console.warn('VITE_GOOGLE_CLIENT_ID is not set — Google sign-in will fail.');
}

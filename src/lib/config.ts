export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

// Phase 0c onwards: gmail.modify covers read + label/state changes (archive,
// trash, snooze label add/remove, etc.). gmail.send is added when reply lands.
export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

if (!GOOGLE_CLIENT_ID) {
  console.warn('VITE_GOOGLE_CLIENT_ID is not set — Google sign-in will fail.');
}

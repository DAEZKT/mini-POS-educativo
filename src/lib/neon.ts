import { createClient, SupabaseAuthAdapter } from '@neondatabase/neon-js';

const authUrl = import.meta.env.VITE_NEON_AUTH_URL;
const dataApiUrl = import.meta.env.VITE_NEON_DATA_API_URL;

export const isNeonConfigured = Boolean(authUrl && dataApiUrl && !authUrl.includes('your-branch'));
export const neon = isNeonConfigured
  ? createClient({
      auth: { adapter: SupabaseAuthAdapter(), url: authUrl },
      dataApi: { url: dataApiUrl },
    })
  : null;

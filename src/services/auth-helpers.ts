// auth-helpers.ts — stub only, no longer used.
// HA provides auth natively via the hass object.
export const generateRandomString = (_len?: number): string => '';
export const generateCodeChallenge = async (_verifier?: string): Promise<string> => '';
export const storeAuthState = (_state: { state: string; codeVerifier: string; haUrl: string }): void => { };
export const getAuthState = (): { state: string; codeVerifier: string; haUrl: string } | null => null;
export const clearAuthState = (): void => { };

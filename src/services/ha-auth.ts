// ha-auth.ts — stub only, no longer used.
// HA provides auth natively via the hass object.
export interface TokenResponse {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    token_type: string;
    ha_url: string;
}

export const haAuth = {
    getRedirectUri: (): string => '',
    initiateLogin: async (_haUrl: string): Promise<void> => { },
    exchangeCodeForToken: async (_code: string, _verifier: string, _haUrl: string): Promise<TokenResponse> => {
        throw new Error('Not used — auth handled by Home Assistant');
    },
    saveTokens: (_tokens: TokenResponse): void => { },
    getTokens: (): TokenResponse | null => null,
    clearTokens: (): void => { },
    testConnection: async (_haUrl: string): Promise<boolean> => true,
    refreshAccessToken: async (): Promise<TokenResponse | null> => null,
};

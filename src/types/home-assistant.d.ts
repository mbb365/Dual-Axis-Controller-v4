import type * as React from 'react';

declare global {
    namespace React.JSX {
        interface IntrinsicElements {
            'ha-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
                icon?: string;
            };
        }
    }

    interface Window {
        customCards?: Array<{
            type: string;
            name: string;
            preview?: boolean;
            description?: string;
            documentationURL?: string;
        }>;
        process?: {
            env: {
                NODE_ENV: string;
            };
        };
    }
}

export {};

export type CardLayout = 'compact' | 'expanded';

/** Which pad the dashboard tile shows. */
export type TilePad = 'temperature' | 'colour';

export interface GroupedLightOption {
    entityId: string;
    icon: string;
    isOn: boolean;
    isMuted: boolean;
    name: string;
    value: string;
    previewBrightness: number;
    previewHue: number;
    previewMode: 'temperature' | 'spectrum';
    previewSaturation: number;
}

export type CardLayout = 'compact' | 'expanded';

/** What the dashboard shows: the light tile, or the tile-size controller with a Temperature or Colour pad. */
export type DashboardTile = 'light' | 'temperature' | 'colour';

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

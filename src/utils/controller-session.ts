import type { HaloVisualStyle } from '../components/Halo';
import type { ControlScope } from './control-state';
import type { FavoriteSettings } from './favorites';

export interface StoredGroupRelativeMemberLayout {
    entityId: string;
    x: number;
    brightness: number;
}

export interface StoredGroupRelativeLayout {
    mode: 'temperature' | 'spectrum';
    averageBrightness: number;
    averageX: number;
    members: StoredGroupRelativeMemberLayout[];
}

export interface StoredControllerSession {
    controlScope: ControlScope;
    controlledLightEntityId: string | null;
    padVisualStyle: HaloVisualStyle;
    uiMode: 'temperature' | 'spectrum';
    selectedColorHue: number | null;
    hasExplicitModeSelection: boolean;
    lastLitGroupRelativeLayout: StoredGroupRelativeLayout | null;
    lastLitControlSettings: Record<string, FavoriteSettings>;
}

const CONTROLLER_SESSION_KEY_PREFIX = 'dual-axis-controller:session:';

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function storageKey(entityId: string) {
    return `${CONTROLLER_SESSION_KEY_PREFIX}${entityId}`;
}

function isFavoriteSettings(value: unknown): value is FavoriteSettings {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<FavoriteSettings>;
    return (
        (candidate.mode === 'temperature' || candidate.mode === 'spectrum') &&
        typeof candidate.hue === 'number' &&
        typeof candidate.saturation === 'number' &&
        typeof candidate.brightness === 'number' &&
        typeof candidate.isOn === 'boolean' &&
        (candidate.kelvin === null || typeof candidate.kelvin === 'number') &&
        (candidate.selectedColorHue === null || typeof candidate.selectedColorHue === 'number')
    );
}

function normalizeFavoriteSettings(settings: FavoriteSettings): FavoriteSettings {
    return {
        ...settings,
        brightness: clamp(settings.brightness, 0, 100),
        hue: clamp(settings.hue, 0, 360),
        isOn: typeof settings.isOn === 'boolean' ? settings.isOn : false,
        kelvin: typeof settings.kelvin === 'number' ? settings.kelvin : null,
        saturation: clamp(settings.saturation, 0, 100),
        selectedColorHue: typeof settings.selectedColorHue === 'number' ? settings.selectedColorHue : null,
    };
}

function isStoredGroupRelativeLayout(value: unknown): value is StoredGroupRelativeLayout {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<StoredGroupRelativeLayout>;
    if (
        (candidate.mode !== 'temperature' && candidate.mode !== 'spectrum') ||
        typeof candidate.averageBrightness !== 'number' ||
        typeof candidate.averageX !== 'number' ||
        !Array.isArray(candidate.members)
    ) {
        return false;
    }

    return candidate.members.every((member) => {
        if (!member || typeof member !== 'object') return false;
        const memberCandidate = member as Partial<StoredGroupRelativeMemberLayout>;
        return (
            typeof memberCandidate.entityId === 'string' &&
            typeof memberCandidate.x === 'number' &&
            typeof memberCandidate.brightness === 'number'
        );
    });
}

function isStoredControllerSession(value: unknown): value is StoredControllerSession {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<StoredControllerSession>;
    if (
        (candidate.controlScope !== 'group' &&
            candidate.controlScope !== 'group-relative' &&
            candidate.controlScope !== 'individual') ||
        (candidate.padVisualStyle !== 'plotter' &&
            candidate.padVisualStyle !== 'matrix' &&
            candidate.padVisualStyle !== 'pixel') ||
        (candidate.uiMode !== 'temperature' && candidate.uiMode !== 'spectrum') ||
        typeof candidate.hasExplicitModeSelection !== 'boolean'
    ) {
        return false;
    }

    if (candidate.controlledLightEntityId != null && typeof candidate.controlledLightEntityId !== 'string') {
        return false;
    }

    if (candidate.selectedColorHue != null && typeof candidate.selectedColorHue !== 'number') {
        return false;
    }

    if (candidate.lastLitGroupRelativeLayout != null && !isStoredGroupRelativeLayout(candidate.lastLitGroupRelativeLayout)) {
        return false;
    }

    if (!candidate.lastLitControlSettings || typeof candidate.lastLitControlSettings !== 'object') {
        return false;
    }

    return Object.values(candidate.lastLitControlSettings).every(isFavoriteSettings);
}

function normalizeStoredGroupRelativeLayout(layout: StoredGroupRelativeLayout): StoredGroupRelativeLayout {
    return {
        ...layout,
        averageBrightness: clamp(layout.averageBrightness, 0, 100),
        averageX: clamp(layout.averageX, 0, 1),
        members: layout.members.map((member) => ({
            ...member,
            brightness: clamp(member.brightness, 0, 100),
            x: clamp(member.x, 0, 1),
        })),
    };
}

function normalizeStoredControllerSession(session: StoredControllerSession): StoredControllerSession {
    return {
        ...session,
        controlledLightEntityId: session.controlledLightEntityId ?? null,
        selectedColorHue: typeof session.selectedColorHue === 'number' ? session.selectedColorHue : null,
        lastLitGroupRelativeLayout: session.lastLitGroupRelativeLayout
            ? normalizeStoredGroupRelativeLayout(session.lastLitGroupRelativeLayout)
            : null,
        lastLitControlSettings: Object.fromEntries(
            Object.entries(session.lastLitControlSettings).map(([entityId, settings]) => [
                entityId,
                normalizeFavoriteSettings(settings),
            ])
        ),
    };
}

export function loadControllerSession(entityId: string): StoredControllerSession | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const rawValue = window.localStorage.getItem(storageKey(entityId));
        if (!rawValue) return null;

        const parsedValue = JSON.parse(rawValue);
        if (!isStoredControllerSession(parsedValue)) return null;

        return normalizeStoredControllerSession(parsedValue);
    } catch (error) {
        console.warn('[Dual Halo Controller] Failed to load controller session', { entityId, error });
        return null;
    }
}

export function saveControllerSession(entityId: string, session: StoredControllerSession) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(storageKey(entityId), JSON.stringify(normalizeStoredControllerSession(session)));
    } catch (error) {
        console.warn('[Dual Halo Controller] Failed to save controller session', { entityId, error });
    }
}

export interface FavoriteSettings {
    brightness: number;
    hue: number;
    isOn: boolean;
    kelvin: number | null;
    mode: 'temperature' | 'spectrum';
    saturation: number;
    selectedColorHue: number | null;
}

export interface FavoriteMemberPreset {
    entityId: string;
    name?: string;
    settings: FavoriteSettings;
}

interface FavoritePresetBase {
    createdAt: number;
    entityId: string;
    id: string;
    label: string;
    sceneEntityId: string;
    scope: 'group' | 'individual';
}

export interface IndividualFavoritePreset extends FavoritePresetBase {
    scope: 'individual';
    settings: FavoriteSettings;
}

export interface GroupFavoritePreset extends FavoritePresetBase {
    scope: 'group';
    members: FavoriteMemberPreset[];
    settings: FavoriteSettings;
}

export type FavoritePreset = IndividualFavoritePreset | GroupFavoritePreset;

export interface BuiltinFavoritePreset {
    displayValue: string;
    id: string;
    label: string;
    settings: FavoriteSettings;
}

interface SunTimingSource {
    state?: string;
    attributes?: {
        next_rising?: string;
        next_setting?: string;
    };
}

const FAVORITES_KEY_PREFIX = 'dual-axis-controller:favorites:';
const SHARED_SCENE_VERSION = 'f2';
export const MAX_FAVORITES = 3;
export const BUILTIN_CANDLELIGHT_FAVORITE_ID = 'builtin-candlelight';
export const BUILTIN_CIRCADIAN_FAVORITE_ID = 'builtin-circadian';

const COLOR_NAMES = [
    { hue: 0, label: 'Red' },
    { hue: 28, label: 'Orange' },
    { hue: 52, label: 'Yellow' },
    { hue: 122, label: 'Green' },
    { hue: 210, label: 'Blue' },
    { hue: 270, label: 'Violet' },
    { hue: 328, label: 'Pink' },
] as const;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function interpolate(start: number, end: number, progress: number) {
    return start + (end - start) * clamp(progress, 0, 1);
}

function storageKey(entityId: string) {
    return `${FAVORITES_KEY_PREFIX}${entityId}`;
}

function encodeAsciiHex(value: string) {
    return Array.from(value)
        .map((character) => character.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');
}

function decodeAsciiHex(value: string) {
    if (!value || value.length % 2 !== 0) return null;

    let decodedValue = '';
    for (let index = 0; index < value.length; index += 2) {
        const nextCode = Number.parseInt(value.slice(index, index + 2), 16);
        if (Number.isNaN(nextCode)) {
            return null;
        }
        decodedValue += String.fromCharCode(nextCode);
    }

    return decodedValue;
}

function sanitizeSceneToken(value: string) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function randomFavoriteId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }

    return `favorite-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function findNearestColorName(hue: number) {
    const normalizedHue = ((hue % 360) + 360) % 360;

    return COLOR_NAMES.reduce(
        (closest, candidate) => {
            const rawDistance = Math.abs(candidate.hue - normalizedHue);
            const distance = Math.min(rawDistance, 360 - rawDistance);

            if (distance < closest.distance) {
                return { distance, label: candidate.label };
            }

            return closest;
        },
        { distance: Number.POSITIVE_INFINITY, label: 'Colour' }
    ).label;
}

function normalizeFavoriteSettings(settings: FavoriteSettings): FavoriteSettings {
    return {
        ...settings,
        brightness: clamp(settings.brightness, 0, 100),
        hue: clamp(settings.hue, 0, 360),
        kelvin: typeof settings.kelvin === 'number' ? settings.kelvin : null,
        saturation: clamp(settings.saturation, 0, 100),
        selectedColorHue: typeof settings.selectedColorHue === 'number' ? settings.selectedColorHue : null,
    };
}

export function buildTemperatureFavoriteSettings(kelvin: number, brightness: number): FavoriteSettings {
    const clampedKelvin = clamp(kelvin, 1800, 6500);
    const warmthProgress = 1 - (clampedKelvin - 1800) / (6500 - 1800);

    return normalizeFavoriteSettings({
        brightness,
        hue: 38,
        isOn: brightness > 0,
        kelvin: clampedKelvin,
        mode: 'temperature',
        saturation: Math.round(interpolate(100, 0, 1 - warmthProgress)),
        selectedColorHue: null,
    });
}

function buildFixedCircadianFavoriteSettings(now = new Date()): FavoriteSettings {
    const hour = now.getHours() + now.getMinutes() / 60;
    let kelvin = 2700;
    let brightness = 40;

    if (hour < 6) {
        kelvin = 2200;
        brightness = 18;
    } else if (hour < 8) {
        const progress = (hour - 6) / 2;
        kelvin = Math.round(interpolate(2400, 3400, progress));
        brightness = Math.round(interpolate(24, 52, progress));
    } else if (hour < 12) {
        const progress = (hour - 8) / 4;
        kelvin = Math.round(interpolate(3600, 5200, progress));
        brightness = Math.round(interpolate(58, 84, progress));
    } else if (hour < 16) {
        const progress = (hour - 12) / 4;
        kelvin = Math.round(interpolate(5200, 4600, progress));
        brightness = Math.round(interpolate(84, 74, progress));
    } else if (hour < 19) {
        const progress = (hour - 16) / 3;
        kelvin = Math.round(interpolate(4400, 3200, progress));
        brightness = Math.round(interpolate(70, 56, progress));
    } else if (hour < 22) {
        const progress = (hour - 19) / 3;
        kelvin = Math.round(interpolate(3000, 2400, progress));
        brightness = Math.round(interpolate(48, 30, progress));
    } else {
        const progress = (hour - 22) / 2;
        kelvin = Math.round(interpolate(2300, 2100, progress));
        brightness = Math.round(interpolate(24, 14, progress));
    }

    return buildTemperatureFavoriteSettings(kelvin, brightness);
}

function parseSunDate(value: string | undefined) {
    if (!value) return null;
    const parsedValue = new Date(value);
    return Number.isNaN(parsedValue.getTime()) ? null : parsedValue;
}

function buildSunBasedCircadianFavoriteSettings(now: Date, sunSource: SunTimingSource): FavoriteSettings | null {
    const nextRising = parseSunDate(sunSource.attributes?.next_rising);
    const nextSetting = parseSunDate(sunSource.attributes?.next_setting);
    if (!nextRising || !nextSetting) {
        return null;
    }

    const oneDayMs = 24 * 60 * 60 * 1000;
    const isAboveHorizon = sunSource.state === 'above_horizon';
    const sunrise = isAboveHorizon ? new Date(nextRising.getTime() - oneDayMs) : nextRising;
    const sunset = isAboveHorizon ? nextSetting : new Date(nextSetting.getTime() - oneDayMs);

    if (sunrise.getTime() >= sunset.getTime()) {
        return null;
    }

    const dawnStart = new Date(sunrise.getTime() - 90 * 60 * 1000);
    const duskEnd = new Date(sunset.getTime() + 90 * 60 * 1000);
    const daylightMidpoint = new Date((sunrise.getTime() + sunset.getTime()) / 2);

    const nowTime = now.getTime();
    const dawnStartTime = dawnStart.getTime();
    const sunriseTime = sunrise.getTime();
    const daylightMidpointTime = daylightMidpoint.getTime();
    const sunsetTime = sunset.getTime();
    const duskEndTime = duskEnd.getTime();

    let kelvin = 2200;
    let brightness = 14;

    if (nowTime < dawnStartTime) {
        kelvin = 2200;
        brightness = 14;
    } else if (nowTime < sunriseTime) {
        const progress = (nowTime - dawnStartTime) / Math.max(1, sunriseTime - dawnStartTime);
        kelvin = Math.round(interpolate(2200, 3200, progress));
        brightness = Math.round(interpolate(14, 42, progress));
    } else if (nowTime < daylightMidpointTime) {
        const progress = (nowTime - sunriseTime) / Math.max(1, daylightMidpointTime - sunriseTime);
        kelvin = Math.round(interpolate(3400, 5600, progress));
        brightness = Math.round(interpolate(50, 88, progress));
    } else if (nowTime < sunsetTime) {
        const progress = (nowTime - daylightMidpointTime) / Math.max(1, sunsetTime - daylightMidpointTime);
        kelvin = Math.round(interpolate(5600, 3000, progress));
        brightness = Math.round(interpolate(88, 42, progress));
    } else if (nowTime < duskEndTime) {
        const progress = (nowTime - sunsetTime) / Math.max(1, duskEndTime - sunsetTime);
        kelvin = Math.round(interpolate(3000, 2200, progress));
        brightness = Math.round(interpolate(42, 18, progress));
    } else {
        kelvin = 2200;
        brightness = 14;
    }

    return buildTemperatureFavoriteSettings(kelvin, brightness);
}

export function buildCircadianFavoriteSettings(now = new Date(), sunSource?: SunTimingSource | null): FavoriteSettings {
    return sunSource ? buildSunBasedCircadianFavoriteSettings(now, sunSource) ?? buildFixedCircadianFavoriteSettings(now) : buildFixedCircadianFavoriteSettings(now);
}

export function buildBuiltinFavoritePresets(now = new Date(), sunSource?: SunTimingSource | null): BuiltinFavoritePreset[] {
    const candlelightSettings = buildTemperatureFavoriteSettings(2200, 60);
    const circadianSettings = buildCircadianFavoriteSettings(now, sunSource);

    return [
        {
            id: BUILTIN_CANDLELIGHT_FAVORITE_ID,
            label: 'Candlelight 2200K at 60%',
            displayValue: '2200K',
            settings: candlelightSettings,
        },
        {
            id: BUILTIN_CIRCADIAN_FAVORITE_ID,
            label: `Circadian ${Math.round(circadianSettings.kelvin ?? 0)}K at ${Math.round(circadianSettings.brightness)}%`,
            displayValue: 'Circadian',
            settings: circadianSettings,
        },
    ];
}

export function favoriteSettingsMatch(left: FavoriteSettings, right: FavoriteSettings) {
    return (
        left.mode === right.mode &&
        left.isOn === right.isOn &&
        Math.abs(left.brightness - right.brightness) <= 1 &&
        Math.abs(left.hue - right.hue) <= 2 &&
        Math.abs(left.saturation - right.saturation) <= 2 &&
        (left.selectedColorHue ?? null) === (right.selectedColorHue ?? null) &&
        ((left.kelvin == null && right.kelvin == null) ||
            (left.kelvin != null && right.kelvin != null && Math.abs(left.kelvin - right.kelvin) <= 90))
    );
}

function memberPresetsMatch(left: FavoriteMemberPreset[], right: FavoriteMemberPreset[]) {
    if (left.length !== right.length) {
        return false;
    }

    return left.every((member, index) => {
        const other = right[index];
        if (!other) return false;
        return member.entityId === other.entityId && favoriteSettingsMatch(member.settings, other.settings);
    });
}

function presetTargetsMatch(left: FavoritePreset, right: FavoritePreset) {
    if (left.scope !== right.scope) {
        return false;
    }

    if (left.entityId !== right.entityId) {
        return false;
    }

    if (left.scope === 'group' && right.scope === 'group') {
        return memberPresetsMatch(left.members, right.members);
    }

    if (left.scope === 'individual' && right.scope === 'individual') {
        return favoriteSettingsMatch(left.settings, right.settings);
    }

    return false;
}

export function buildFavoriteLabel(settings: FavoriteSettings, scope: FavoritePreset['scope']) {
    if (!settings.isOn || settings.brightness <= 0) {
        return scope === 'group' ? 'Group Off' : 'Light Off';
    }

    if (settings.mode === 'temperature') {
        const kelvin = settings.kelvin ? Math.round(settings.kelvin) : null;
        const warmthLabel = kelvin == null ? 'Temperature' : kelvin <= 3000 ? 'Warm' : kelvin >= 4800 ? 'Cool' : 'Soft';

        return kelvin == null
            ? `${warmthLabel} · ${Math.round(settings.brightness)}%`
            : `${warmthLabel} ${kelvin}K · ${Math.round(settings.brightness)}%`;
    }

    const swatchHue = settings.selectedColorHue ?? settings.hue;
    return `${findNearestColorName(swatchHue)} · ${Math.round(settings.brightness)}%`;
}

export function buildFavoriteSceneEntityId(entityId: string, favoriteId: string) {
    const entityToken = sanitizeSceneToken(entityId.replace('.', '_'));
    const favoriteToken = sanitizeSceneToken(favoriteId).slice(0, 10) || 'favorite';
    return `scene.dac_${entityToken}_${favoriteToken}`;
}

function encodeSceneMetaToken(value: number | null | undefined) {
    if (value == null || Number.isNaN(value)) return 'n';
    return Math.max(0, Math.round(value)).toString(36);
}

function decodeSceneMetaToken(value: string) {
    if (!value || value === 'n') return null;
    const parsedValue = Number.parseInt(value, 36);
    return Number.isNaN(parsedValue) ? null : parsedValue;
}

export function buildSharedFavoriteSceneEntityId(
    ownerEntityId: string,
    favoriteId: string,
    createdAt: number,
    scope: FavoritePreset['scope'],
    settings: FavoriteSettings,
    targetEntityId: string = ownerEntityId
) {
    const entityToken = sanitizeSceneToken(ownerEntityId.replace('.', '_'));
    const favoriteToken = sanitizeSceneToken(favoriteId).slice(0, 10) || 'favorite';
    const normalizedSettings = normalizeFavoriteSettings(settings);
    const scopeToken = scope === 'group' ? 'g' : 'i';
    const modeToken = normalizedSettings.mode === 'temperature' ? 't' : 's';
    const onToken = normalizedSettings.isOn && normalizedSettings.brightness > 0 ? '1' : '0';
    const brightnessToken = encodeSceneMetaToken(normalizedSettings.brightness);
    const hueToken = encodeSceneMetaToken(normalizedSettings.hue);
    const saturationToken = encodeSceneMetaToken(normalizedSettings.saturation);
    const kelvinToken = encodeSceneMetaToken(normalizedSettings.kelvin);
    const selectedColorHueToken = encodeSceneMetaToken(normalizedSettings.selectedColorHue);
    const createdAtToken = encodeSceneMetaToken(createdAt);
    const targetEntityToken = encodeAsciiHex(targetEntityId);

    return `scene.dac_${entityToken}_${SHARED_SCENE_VERSION}_${scopeToken}_${modeToken}_${onToken}_${brightnessToken}_${hueToken}_${saturationToken}_${kelvinToken}_${selectedColorHueToken}_${createdAtToken}_${favoriteToken}_${targetEntityToken}`;
}

function scenePrefix(entityId: string) {
    return `scene.dac_${sanitizeSceneToken(entityId.replace('.', '_'))}_`;
}

export function isSharedFavoriteSceneEntityId(sceneEntityId: string, entityId: string) {
    return sceneEntityId.startsWith(`${scenePrefix(entityId)}${SHARED_SCENE_VERSION}_`);
}

export function buildFavoriteSceneEntities(favorite: FavoritePreset) {
    const buildLightSceneState = (settings: FavoriteSettings) => {
        const normalizedSettings = normalizeFavoriteSettings(settings);

        if (!normalizedSettings.isOn || normalizedSettings.brightness <= 0) {
            return 'off';
        }

        const brightness255 = Math.round((normalizedSettings.brightness / 100) * 255);
        if (normalizedSettings.mode === 'temperature') {
            return {
                state: 'on',
                brightness: brightness255,
                color_mode: 'color_temp',
                ...(normalizedSettings.kelvin != null ? { color_temp_kelvin: Math.round(normalizedSettings.kelvin) } : {}),
            };
        }

        return {
            state: 'on',
            brightness: brightness255,
            color_mode: 'hs',
            hs_color: [
                Math.round(normalizedSettings.selectedColorHue ?? normalizedSettings.hue),
                Math.round(normalizedSettings.saturation),
            ] as [number, number],
        };
    };

    if (favorite.scope === 'individual') {
        return {
            [favorite.entityId]: buildLightSceneState(favorite.settings),
        };
    }

    return Object.fromEntries(
        favorite.members.map((member) => [member.entityId, buildLightSceneState(member.settings)])
    );
}

export function parseSharedFavoritePresetFromSceneState(
    entityId: string,
    sceneEntityId: string
): FavoritePreset | null {
    const prefix = `${scenePrefix(entityId)}${SHARED_SCENE_VERSION}_`;
    if (!sceneEntityId.startsWith(prefix)) {
        return null;
    }

    const encodedValue = sceneEntityId.slice(prefix.length);
    const [
        scopeToken,
        modeToken,
        onToken,
        brightnessToken,
        hueToken,
        saturationToken,
        kelvinToken,
        selectedColorHueToken,
        createdAtToken,
        favoriteToken,
        targetEntityToken,
    ] = encodedValue.split('_');

    if (!scopeToken || !modeToken || !onToken || !brightnessToken || !hueToken || !saturationToken || !createdAtToken) {
        return null;
    }

    const scope = scopeToken === 'g' ? 'group' : scopeToken === 'i' ? 'individual' : null;
    const mode = modeToken === 't' ? 'temperature' : modeToken === 's' ? 'spectrum' : null;
    const brightness = decodeSceneMetaToken(brightnessToken);
    const hue = decodeSceneMetaToken(hueToken);
    const saturation = decodeSceneMetaToken(saturationToken);
    const createdAt = decodeSceneMetaToken(createdAtToken);

    if (!scope || !mode || brightness == null || hue == null || saturation == null || createdAt == null) {
        return null;
    }

    const settings = normalizeFavoriteSettings({
        brightness,
        hue,
        isOn: onToken === '1',
        kelvin: decodeSceneMetaToken(kelvinToken),
        mode,
        saturation,
        selectedColorHue: decodeSceneMetaToken(selectedColorHueToken),
    });
    const id = favoriteToken ? `shared-${favoriteToken}-${createdAtToken}` : `shared-${createdAtToken}`;
    const targetEntityId = decodeAsciiHex(targetEntityToken ?? '') ?? entityId;

    if (scope === 'individual') {
        return {
            createdAt,
            entityId: targetEntityId,
            id,
            label: buildFavoriteLabel(settings, scope),
            sceneEntityId,
            scope,
            settings,
        };
    }

    return {
        createdAt,
        entityId,
        id,
        label: buildFavoriteLabel(settings, scope),
        members: [],
        sceneEntityId,
        scope,
        settings,
    };
}

export function loadSharedFavoritePresets(hass: any, entityId: string) {
    if (!hass?.states) {
        return [] as FavoritePreset[];
    }

    return Object.keys(hass.states)
        .filter((stateEntityId) => isSharedFavoriteSceneEntityId(stateEntityId, entityId))
        .map((sceneEntityId) => parseSharedFavoritePresetFromSceneState(entityId, sceneEntityId))
        .filter((favorite): favorite is FavoritePreset => favorite != null)
        .sort((left, right) => left.createdAt - right.createdAt)
        .slice(-MAX_FAVORITES);
}

export function createIndividualFavoritePreset(entityId: string, settings: FavoriteSettings): IndividualFavoritePreset {
    const normalizedSettings = normalizeFavoriteSettings(settings);
    const id = randomFavoriteId();
    const createdAt = Date.now();

    return {
        createdAt,
        entityId,
        id,
        label: buildFavoriteLabel(normalizedSettings, 'individual'),
        sceneEntityId: buildSharedFavoriteSceneEntityId(entityId, id, createdAt, 'individual', normalizedSettings),
        scope: 'individual',
        settings: normalizedSettings,
    };
}

export function createOwnedIndividualFavoritePreset(
    ownerEntityId: string,
    targetEntityId: string,
    settings: FavoriteSettings
): IndividualFavoritePreset {
    const normalizedSettings = normalizeFavoriteSettings(settings);
    const id = randomFavoriteId();
    const createdAt = Date.now();

    return {
        createdAt,
        entityId: targetEntityId,
        id,
        label: buildFavoriteLabel(normalizedSettings, 'individual'),
        sceneEntityId: buildSharedFavoriteSceneEntityId(
            ownerEntityId,
            id,
            createdAt,
            'individual',
            normalizedSettings,
            targetEntityId
        ),
        scope: 'individual',
        settings: normalizedSettings,
    };
}

export function createGroupFavoritePreset(
    entityId: string,
    settings: FavoriteSettings,
    members: FavoriteMemberPreset[]
): GroupFavoritePreset {
    const normalizedMembers = members.map((member) => ({
        ...member,
        settings: normalizeFavoriteSettings(member.settings),
    }));
    const normalizedSettings = normalizeFavoriteSettings(settings);
    const id = randomFavoriteId();
    const createdAt = Date.now();

    return {
        createdAt,
        entityId,
        id,
        label: buildFavoriteLabel(normalizedSettings, 'group'),
        members: normalizedMembers,
        sceneEntityId: buildSharedFavoriteSceneEntityId(entityId, id, createdAt, 'group', normalizedSettings),
        scope: 'group',
        settings: normalizedSettings,
    };
}

export function appendFavoritePreset(favorites: FavoritePreset[], nextFavorite: FavoritePreset) {
    const dedupedFavorites = favorites.filter((favorite) => !presetTargetsMatch(favorite, nextFavorite));
    return [...dedupedFavorites, nextFavorite].slice(-MAX_FAVORITES);
}

function isFavoriteSettings(value: unknown): value is FavoriteSettings {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<FavoriteSettings>;
    return (
        (candidate.mode === 'temperature' || candidate.mode === 'spectrum') &&
        typeof candidate.hue === 'number' &&
        typeof candidate.saturation === 'number' &&
        typeof candidate.brightness === 'number' &&
        typeof candidate.isOn === 'boolean'
    );
}

function isFavoriteMemberPreset(value: unknown): value is FavoriteMemberPreset {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<FavoriteMemberPreset>;
    return typeof candidate.entityId === 'string' && isFavoriteSettings(candidate.settings);
}

function isFavoritePreset(value: unknown): value is FavoritePreset {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<FavoritePreset>;
    if (
        typeof candidate.id !== 'string' ||
        typeof candidate.entityId !== 'string' ||
        typeof candidate.label !== 'string' ||
        typeof candidate.sceneEntityId !== 'string' ||
        typeof candidate.createdAt !== 'number' ||
        (candidate.scope !== 'group' && candidate.scope !== 'individual')
    ) {
        return false;
    }

    if (!isFavoriteSettings(candidate.settings)) {
        return false;
    }

    if (candidate.scope === 'individual') {
        return true;
    }

    const groupCandidate = candidate as Partial<GroupFavoritePreset>;
    return Array.isArray(groupCandidate.members) && groupCandidate.members.every(isFavoriteMemberPreset);
}

function normalizeFavoritePreset(favorite: FavoritePreset): FavoritePreset {
    if (favorite.scope === 'individual') {
        return {
            ...favorite,
            settings: normalizeFavoriteSettings(favorite.settings),
        };
    }

    return {
        ...favorite,
        members: favorite.members.map((member) => ({
            ...member,
            settings: normalizeFavoriteSettings(member.settings),
        })),
        settings: normalizeFavoriteSettings(favorite.settings),
    };
}

export function loadFavoritePresets(entityId: string) {
    if (typeof window === 'undefined') {
        return [] as FavoritePreset[];
    }

    try {
        const rawValue = window.localStorage.getItem(storageKey(entityId));
        if (!rawValue) return [] as FavoritePreset[];

        const parsedValue = JSON.parse(rawValue);
        if (!Array.isArray(parsedValue)) return [] as FavoritePreset[];

        return parsedValue.filter(isFavoritePreset).map(normalizeFavoritePreset);
    } catch (error) {
        console.warn('[Dual Halo Controller] Failed to load favourites', { entityId, error });
        return [] as FavoritePreset[];
    }
}

export function saveFavoritePresets(entityId: string, favorites: FavoritePreset[]) {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.setItem(storageKey(entityId), JSON.stringify(favorites));
    } catch (error) {
        console.warn('[Dual Halo Controller] Failed to save favourites', { entityId, error });
    }
}

// ha-connection.ts
// Simple adapter wrapping the native `hass` object provided by Home Assistant.
// No WebSocket management needed — HA handles that natively.

export interface LightState {
    entity_id: string;
    state: string;
    attributes: {
        friendly_name?: string;
        entity_id?: string[] | string;
        lights?: string[] | string;
        brightness?: number;
        available?: boolean;
        reachable?: boolean;
        effect?: string | null;
        hs_color?: [number, number];
        rgb_color?: [number, number, number] | null;
        xy_color?: [number, number] | null;
        color_temp?: number;
        color_temp_kelvin?: number;
        color_mode?: string;
        supported_color_modes?: string[];
        min_mireds?: number;
        max_mireds?: number;
    };
}

type LightAvailabilityLike = {
    state?: string;
    attributes?: Record<string, unknown>;
};

function hasOwnAttribute(attributes: Record<string, unknown>, key: string) {
    return Object.prototype.hasOwnProperty.call(attributes, key);
}

function hasExplicitNullAttribute(attributes: Record<string, unknown>, key: string) {
    return hasOwnAttribute(attributes, key) && attributes[key] == null;
}

/** Returns the current state of a light entity from the hass object. */
export function getLightState(hass: any, entityId: string): LightState | null {
    if (!hass || !entityId) return null;
    return hass.states[entityId] || null;
}

export function isLightAvailable(light: LightAvailabilityLike | null | undefined) {
    if (!light) return false;
    if (light.state === 'unavailable' || light.state === 'unknown') return false;
    if (light.attributes?.available === false) return false;
    if (light.attributes?.reachable === false) return false;
    return true;
}

function hasStaleOnState(light: LightAvailabilityLike | null | undefined) {
    if (!light || light.state !== 'on') return false;

    const attributes = light.attributes ?? {};
    const explicitlyNullLiveOutput =
        hasExplicitNullAttribute(attributes, 'color_mode') &&
        [
            'brightness',
            'color_temp',
            'color_temp_kelvin',
            'hs_color',
            'rgb_color',
            'xy_color',
            'effect',
        ].some((key) => hasExplicitNullAttribute(attributes, key));

    if (explicitlyNullLiveOutput) {
        return true;
    }

    const supportedColorModes = Array.isArray(attributes.supported_color_modes)
        ? attributes.supported_color_modes.filter((mode): mode is string => typeof mode === 'string')
        : [];
    const expectsLiveOutputState =
        supportedColorModes.length === 0 ||
        supportedColorModes.some((mode) => mode !== 'onoff');

    if (!expectsLiveOutputState) {
        return false;
    }

    return (
        attributes.brightness == null &&
        attributes.color_mode == null &&
        attributes.color_temp == null &&
        attributes.color_temp_kelvin == null &&
        attributes.hs_color == null &&
        attributes.rgb_color == null &&
        attributes.xy_color == null &&
        attributes.effect == null
    );
}

export function isLightOn(light: LightAvailabilityLike | null | undefined) {
    return Boolean(light && isLightAvailable(light) && light.state === 'on' && !hasStaleOnState(light));
}

/** Calls light.turn_on or light.turn_off via the hass API. */
export async function callLightService(
    hass: any,
    entityId: string,
    on: boolean,
    params: {
        brightness?: number; // 0–100 scale, converted to 0–255 internally
        hs_color?: [number, number];
        color_temp?: number;
        color_temp_kelvin?: number;
    } = {}
) {
    if (!hass) return;

    if (!on) {
        await hass.callService('light', 'turn_off', { entity_id: entityId });
        return;
    }

    const buildServiceData = (
        overrides: Partial<{
            brightness: number;
            hs_color: [number, number];
            color_temp: number;
            color_temp_kelvin: number;
        }> = {}
    ) => {
        const mergedParams = { ...params, ...overrides };
        const serviceData: Record<string, any> = { entity_id: entityId };

        if (mergedParams.brightness !== undefined) {
            serviceData.brightness = Math.round((mergedParams.brightness / 100) * 255);
        }
        if (mergedParams.hs_color !== undefined) {
            serviceData.hs_color = mergedParams.hs_color;
        }
        if (mergedParams.color_temp !== undefined) {
            serviceData.color_temp = mergedParams.color_temp;
        }
        if (mergedParams.color_temp_kelvin !== undefined) {
            serviceData.color_temp_kelvin = mergedParams.color_temp_kelvin;
        }

        return serviceData;
    };

    try {
        await hass.callService('light', 'turn_on', buildServiceData());
    } catch (error) {
        // Some Tuya-backed lights reject richer payloads intermittently. Retry with a
        // simpler, more broadly supported payload before surfacing the failure.
        try {
            if (params.color_temp_kelvin !== undefined) {
                await hass.callService(
                    'light',
                    'turn_on',
                    buildServiceData({
                        color_temp: Math.round(1000000 / params.color_temp_kelvin),
                        color_temp_kelvin: undefined,
                    })
                );
                return;
            }

            if (params.hs_color !== undefined && params.brightness !== undefined) {
                await hass.callService(
                    'light',
                    'turn_on',
                    buildServiceData({
                        brightness: undefined,
                    })
                );
                await hass.callService(
                    'light',
                    'turn_on',
                    buildServiceData({
                        hs_color: undefined,
                    })
                );
                return;
            }
        } catch {
            // Fall through to the original error below.
        }

        throw error;
    }
}

function sceneIdFromEntityId(sceneEntityId: string) {
    return sceneEntityId.replace(/^scene\./, '');
}

export async function createSceneDefinition(
    hass: any,
    sceneEntityId: string,
    entities: Record<string, Record<string, any> | string>
) {
    if (!hass || !entities || !Object.keys(entities).length) return;

    await hass.callService('scene', 'create', {
        scene_id: sceneIdFromEntityId(sceneEntityId),
        entities,
    });
}

export async function createSceneSnapshot(hass: any, sceneEntityId: string, snapshotEntities: string[]) {
    if (!hass || !snapshotEntities.length) return;

    await hass.callService('scene', 'create', {
        scene_id: sceneIdFromEntityId(sceneEntityId),
        snapshot_entities: snapshotEntities,
    });
}

export async function activateScene(hass: any, sceneEntityId: string) {
    if (!hass) return;

    await hass.callService('scene', 'turn_on', {
        entity_id: sceneEntityId,
    });
}

export async function deleteScene(hass: any, sceneEntityId: string) {
    if (!hass) return;
    if (!sceneEntityId.startsWith('scene.')) return;
    if (!hass.states?.[sceneEntityId]) {
        return;
    }

    await hass.callService('scene', 'delete', {
        entity_id: sceneEntityId,
    });
}

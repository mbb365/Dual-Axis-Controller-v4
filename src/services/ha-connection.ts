// ha-connection.ts
// Simple adapter wrapping the native `hass` object provided by Home Assistant.
// No WebSocket management needed — HA handles that natively.

export interface LightState {
    entity_id: string;
    state: string;
    attributes: {
        friendly_name?: string;
        entity_id?: string[];
        lights?: string[];
        brightness?: number;
        hs_color?: [number, number];
        color_temp?: number;
        color_temp_kelvin?: number;
        color_mode?: string;
        supported_color_modes?: string[];
        min_mireds?: number;
        max_mireds?: number;
    };
}

/** Returns the current state of a light entity from the hass object. */
export function getLightState(hass: any, entityId: string): LightState | null {
    if (!hass || !entityId) return null;
    return hass.states[entityId] || null;
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

    await hass.callService('scene', 'delete', {
        entity_id: sceneEntityId,
    });
}

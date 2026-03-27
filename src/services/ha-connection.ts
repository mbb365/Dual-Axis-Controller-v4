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

    const serviceData: Record<string, any> = { entity_id: entityId };
    if (params.brightness !== undefined) {
        serviceData.brightness = Math.round((params.brightness / 100) * 255);
    }
    if (params.hs_color !== undefined) {
        serviceData.hs_color = params.hs_color;
    }
    if (params.color_temp !== undefined) {
        serviceData.color_temp = params.color_temp;
    }
    if (params.color_temp_kelvin !== undefined) {
        serviceData.color_temp_kelvin = params.color_temp_kelvin;
    }
    await hass.callService('light', 'turn_on', serviceData);
}

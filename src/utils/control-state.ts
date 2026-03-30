import type { HaloMarker } from '../components/Halo';
import { getLightState } from '../services/ha-connection';
import {
    TEMPERATURE_WARM_HUE,
    temperatureValuesToXFraction,
    xFractionToTemperatureValues,
} from './temperature-mapping';

type LightState = ReturnType<typeof getLightState>;

export interface QueuedControlCommand {
    entityId: string;
    turnOn: boolean;
    brightness: number;
    hue: number;
    saturation: number;
    uiMode: 'temperature' | 'spectrum';
    colorTempKelvin?: number;
    hsColor?: [number, number];
}

export type ControlScope = 'group' | 'group-relative' | 'individual';

export interface GroupRelativeMemberSnapshot {
    entityId: string;
    light: NonNullable<LightState>;
    x: number;
    brightness: number;
}

export interface GroupRelativeSnapshot {
    mode: 'temperature' | 'spectrum';
    averageBrightness: number;
    averageX: number;
    members: GroupRelativeMemberSnapshot[];
}

export function getGroupedLightIds(light: LightState) {
    if (!light) return [];

    const memberIds = [...(light.attributes.entity_id ?? []), ...(light.attributes.lights ?? [])];
    return Array.from(new Set(memberIds.filter((memberId) => memberId.startsWith('light.') && memberId !== light.entity_id)));
}

export function formatGroupedLightValue(
    state: {
        state?: string;
        attributes?: {
            brightness?: number;
        };
    } | undefined
) {
    if (!state || state.state !== 'on') return 'Off';
    if (state.attributes?.brightness == null) return 'On';
    return `${Math.round((state.attributes.brightness / 255) * 100)}%`;
}

export function getBrightnessPercent(
    state: {
        state?: string;
        attributes?: {
            brightness?: number;
        };
    } | null | undefined
) {
    if (!state || state.state !== 'on') return 0;
    if (state.attributes?.brightness == null) return 100;
    return Math.round((state.attributes.brightness / 255) * 100);
}

export function getMarkerControlValues(
    state: LightState,
    mode: 'temperature' | 'spectrum'
): Pick<HaloMarker, 'brightness' | 'hue' | 'saturation'> {
    const brightness = getBrightnessPercent(state);
    if (!state || state.state !== 'on') {
        return {
            brightness,
            hue: mode === 'temperature' ? TEMPERATURE_WARM_HUE : 0,
            saturation: 0,
        };
    }

    if (mode === 'temperature') {
        if (state.attributes.color_temp_kelvin != null || state.attributes.color_temp != null) {
            const nextKelvin =
                state.attributes.color_temp_kelvin ||
                Math.round(1000000 / state.attributes.color_temp!);
            const minMireds = state.attributes.min_mireds || 153;
            const maxMireds = state.attributes.max_mireds || 500;
            const mireds = state.attributes.color_temp || 1000000 / nextKelvin;
            const x = Math.max(0, Math.min(1, (mireds - minMireds) / (maxMireds - minMireds)));
            return {
                brightness,
                ...xFractionToTemperatureValues(x),
            };
        }

        if (state.attributes.hs_color) {
            const [hue, saturation] = state.attributes.hs_color;
            return { brightness, hue, saturation };
        }

        return { brightness, hue: TEMPERATURE_WARM_HUE, saturation: 0 };
    }

    const isCurrentlyTemperatureMode = state.attributes.color_mode === 'color_temp';

    if (isCurrentlyTemperatureMode && (state.attributes.color_temp_kelvin != null || state.attributes.color_temp != null)) {
        const nextKelvin =
            state.attributes.color_temp_kelvin ||
            Math.round(1000000 / state.attributes.color_temp!);
        const minMireds = state.attributes.min_mireds || 153;
        const maxMireds = state.attributes.max_mireds || 500;
        const mireds = state.attributes.color_temp || 1000000 / nextKelvin;
        const x = Math.max(0, Math.min(1, (mireds - minMireds) / (maxMireds - minMireds)));
        return {
            brightness,
            ...xFractionToTemperatureValues(x),
        };
    }

    if (state.attributes.hs_color) {
        const [hue, saturation] = state.attributes.hs_color;
        return { brightness, hue, saturation };
    }

    if (state.attributes.color_temp_kelvin != null || state.attributes.color_temp != null) {
        const nextKelvin =
            state.attributes.color_temp_kelvin ||
            Math.round(1000000 / state.attributes.color_temp!);
        const minMireds = state.attributes.min_mireds || 153;
        const maxMireds = state.attributes.max_mireds || 500;
        const mireds = state.attributes.color_temp || 1000000 / nextKelvin;
        const x = Math.max(0, Math.min(1, (mireds - minMireds) / (maxMireds - minMireds)));
        return {
            brightness,
            ...xFractionToTemperatureValues(x),
        };
    }

    return { brightness, hue: 0, saturation: 0 };
}

export function xFractionFromHueSat(hue: number, saturation: number, mode: 'temperature' | 'spectrum') {
    if (mode === 'spectrum') {
        return Math.max(0, Math.min(1, hue / 360));
    }

    return temperatureValuesToXFraction(hue, saturation);
}

export function controlValuesFromPosition(
    x: number,
    brightness: number,
    mode: 'temperature' | 'spectrum'
): Pick<HaloMarker, 'brightness' | 'hue' | 'saturation'> {
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedBrightness = Math.max(0, Math.min(100, brightness));

    if (mode === 'spectrum') {
        return {
            brightness: clampedBrightness,
            hue: Math.round(clampedX * 360),
            saturation: 100,
        };
    }

    return {
        brightness: clampedBrightness,
        ...xFractionToTemperatureValues(clampedX),
    };
}

export function supportsTemperatureForLight(light: LightState) {
    const supportedColorModes = light?.attributes.supported_color_modes || [];
    return (
        supportedColorModes.includes('color_temp') ||
        light?.attributes.color_mode === 'color_temp' ||
        light?.attributes.min_mireds != null ||
        light?.attributes.max_mireds != null
    );
}

export function supportsSpectrumForLight(light: LightState) {
    const supportedColorModes = light?.attributes.supported_color_modes || [];
    return (
        supportedColorModes.some((mode) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(mode)) ||
        (light?.attributes.hs_color != null && light?.attributes.color_mode !== 'color_temp')
    );
}

export function kelvinFromXPosition(x: number, light: LightState) {
    const minMireds = light?.attributes.min_mireds || 153;
    const maxMireds = light?.attributes.max_mireds || 500;
    const mireds = Math.round(minMireds + Math.max(0, Math.min(1, x)) * (maxMireds - minMireds));
    return Math.round(1000000 / mireds);
}

export function buildQueuedControlCommand(
    entityId: string,
    targetLight: LightState,
    values: Pick<HaloMarker, 'brightness' | 'hue' | 'saturation'>,
    mode: 'temperature' | 'spectrum'
): QueuedControlCommand {
    const command: QueuedControlCommand = {
        entityId,
        turnOn: values.brightness > 0,
        brightness: values.brightness,
        hue: values.hue,
        saturation: values.saturation,
        uiMode: mode,
    };

    if (!command.turnOn) {
        return command;
    }

    if (mode === 'temperature') {
        const x = xFractionFromHueSat(values.hue, values.saturation, 'temperature');
        const nextKelvin = kelvinFromXPosition(x, targetLight);

        if (supportsTemperatureForLight(targetLight)) {
            command.colorTempKelvin = nextKelvin;
        } else if (supportsSpectrumForLight(targetLight)) {
            command.hsColor = [values.hue, values.saturation];
        }

        return command;
    }

    if (supportsSpectrumForLight(targetLight)) {
        command.hsColor = [values.hue, values.saturation];
        return command;
    }

    if (supportsTemperatureForLight(targetLight)) {
        const fallbackX = xFractionFromHueSat(values.hue, values.saturation, 'temperature');
        command.colorTempKelvin = kelvinFromXPosition(fallbackX, targetLight);
    }

    return command;
}

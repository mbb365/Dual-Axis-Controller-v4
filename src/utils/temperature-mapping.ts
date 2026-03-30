export const TEMPERATURE_WHITE_POINT = 0.3;
export const TEMPERATURE_WARM_HUE = 38;
export const TEMPERATURE_COOL_HUE = 205;

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

export function xFractionToTemperatureValues(xFraction: number) {
    const x = clamp01(xFraction);

    if (x <= TEMPERATURE_WHITE_POINT) {
        const coolProgress = 1 - x / TEMPERATURE_WHITE_POINT;
        return {
            hue: TEMPERATURE_COOL_HUE,
            saturation: Math.round(coolProgress * 100),
        };
    }

    const warmProgress = (x - TEMPERATURE_WHITE_POINT) / (1 - TEMPERATURE_WHITE_POINT);
    return {
        hue: TEMPERATURE_WARM_HUE,
        saturation: Math.round(warmProgress * 100),
    };
}

export function temperatureValuesToXFraction(hue: number, saturation: number) {
    const clampedSaturation = clamp01(saturation / 100);
    const coolDistance = Math.abs(hue - TEMPERATURE_COOL_HUE);
    const warmDistance = Math.abs(hue - TEMPERATURE_WARM_HUE);

    if (coolDistance < warmDistance) {
        return clamp01(TEMPERATURE_WHITE_POINT * (1 - clampedSaturation));
    }

    return clamp01(TEMPERATURE_WHITE_POINT + clampedSaturation * (1 - TEMPERATURE_WHITE_POINT));
}


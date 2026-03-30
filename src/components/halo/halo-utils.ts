import {
    TEMPERATURE_COOL_HUE,
    TEMPERATURE_WARM_HUE,
    temperatureValuesToXFraction,
    xFractionToTemperatureValues,
} from '../../utils/temperature-mapping';

export interface HaloSelection {
    brightness: number;
    hue: number;
    saturation: number;
    xPercent: number;
    yPercent: number;
}

export type HaloMode = 'temperature' | 'spectrum';

function buildLockedSpectrumColor(hue: number) {
    return `hsl(${hue}, 86%, 66%)`;
}

export function xPosFromHueSat(hue: number, sat: number, mode: HaloMode, lockedSpectrumHue?: number | null) {
    if (mode === 'spectrum') {
        if (lockedSpectrumHue != null) {
            return Math.max(0, Math.min(100, sat));
        }
        return (hue / 360) * 100;
    }

    return temperatureValuesToXFraction(hue, sat) * 100;
}

function isWarmTemperatureHue(hue: number) {
    const normalizedHue = ((hue % 360) + 360) % 360;
    return Math.abs(normalizedHue - TEMPERATURE_WARM_HUE) <= Math.abs(normalizedHue - TEMPERATURE_COOL_HUE);
}

export function buildTemperatureIndicatorColor(hue: number, saturation: number, brightness: number) {
    const normalizedSaturation = Math.max(0, Math.min(1, saturation / 100));
    const normalizedBrightness = Math.max(0, Math.min(1, brightness / 100));

    if (normalizedSaturation < 0.12) {
        const whiteLightness = 97 + normalizedBrightness * 2;
        return `hsl(0, 0%, ${Math.min(99, whiteLightness)}%)`;
    }

    if (isWarmTemperatureHue(hue)) {
        const colorSaturation = 26 + normalizedSaturation * 68;
        const colorLightness = 88 - normalizedSaturation * 10 + normalizedBrightness * 4;
        return `hsl(31, ${colorSaturation}%, ${Math.min(94, colorLightness)}%)`;
    }

    const colorSaturation = 10 + normalizedSaturation * 18;
    const colorLightness = 94 - normalizedSaturation * 5 + normalizedBrightness * 3;
    return `hsl(204, ${colorSaturation}%, ${Math.min(97, colorLightness)}%)`;
}

export function buildIndicatorShadow(hue: number, saturation: number, brightness: number, mode: HaloMode) {
    if (mode === 'spectrum') {
        return `0 0 0 1px rgba(255, 255, 255, 0.28), 0 10px 22px hsla(${hue}, 100%, 52%, 0.34), 0 4px 14px rgba(15, 23, 42, 0.22)`;
    }

    if (saturation < 12) {
        return brightness > 55
            ? '0 0 0 1px rgba(15, 23, 42, 0.08), 0 10px 22px rgba(255, 255, 255, 0.38), 0 4px 14px rgba(15, 23, 42, 0.22)'
            : '0 0 0 1px rgba(15, 23, 42, 0.12), 0 8px 18px rgba(255, 255, 255, 0.2), 0 4px 14px rgba(15, 23, 42, 0.24)';
    }

    return `0 0 0 1px rgba(255, 255, 255, 0.3), 0 10px 22px hsla(${hue}, ${18 + saturation * 0.5}%, ${
        72 - saturation * 0.08
    }%, 0.28), 0 4px 14px rgba(15, 23, 42, 0.22)`;
}

export function selectionFromClientPosition(
    rect: DOMRect,
    clientX: number,
    clientY: number,
    mode: HaloMode,
    lockedSpectrumHue?: number | null
): HaloSelection {
    let xPercent = (clientX - rect.left) / rect.width;
    let yPercent = (clientY - rect.top) / rect.height;

    xPercent = Math.max(0, Math.min(1, xPercent));
    yPercent = Math.max(0, Math.min(1, yPercent));

    let nextHue: number;
    let nextSaturation: number;

    if (mode === 'spectrum') {
        if (lockedSpectrumHue != null) {
            nextHue = lockedSpectrumHue;
            nextSaturation = Math.round(xPercent * 100);
        } else {
            nextHue = Math.round(xPercent * 360);
            nextSaturation = 100;
        }
    } else {
        const temperatureValues = xFractionToTemperatureValues(xPercent);
        nextHue = temperatureValues.hue;
        nextSaturation = temperatureValues.saturation;
    }

    return {
        brightness: Math.round((1 - yPercent) * 100),
        hue: nextHue,
        saturation: nextSaturation,
        xPercent: xPercent * 100,
        yPercent: yPercent * 100,
    };
}

export function buildPadBackground(isOn: boolean, mode: HaloMode, lockedSpectrumHue?: number | null) {
    if (!isOn) {
        return 'radial-gradient(circle at 50% 50%, rgba(196, 181, 253, 0.34) 0%, rgba(196, 181, 253, 0.14) 26%, rgba(217, 222, 230, 0.08) 48%, rgba(216, 220, 228, 0) 72%), linear-gradient(145deg, rgba(239, 241, 245, 0.98) 0%, rgba(223, 227, 234, 0.96) 54%, rgba(210, 214, 222, 0.98) 100%)';
    }

    if (mode === 'spectrum') {
        if (lockedSpectrumHue != null) {
            const lockedColor = buildLockedSpectrumColor(lockedSpectrumHue);
            return `radial-gradient(circle at 14% 18%, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.08) 14%, rgba(255, 255, 255, 0) 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.82) 100%), linear-gradient(90deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.92) 18%, ${lockedColor} 100%)`;
        }
        return 'radial-gradient(circle at 14% 18%, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 14%, rgba(255, 255, 255, 0) 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.82) 100%), linear-gradient(90deg, rgba(255, 107, 107, 0.96) 0%, rgba(255, 209, 102, 0.86) 18%, rgba(149, 209, 111, 0.84) 36%, rgba(86, 207, 225, 0.82) 54%, rgba(123, 109, 255, 0.84) 74%, rgba(255, 119, 200, 0.92) 100%)';
    }

    return 'radial-gradient(circle at 18% 22%, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.16) 15%, rgba(255, 255, 255, 0) 38%), linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.84) 100%), linear-gradient(90deg, rgba(214, 226, 236, 0.74) 0%, rgba(245, 247, 249, 0.78) 30%, rgba(252, 243, 212, 0.84) 48%, rgba(255, 226, 144, 0.9) 72%, rgba(255, 203, 112, 0.96) 100%)';
}

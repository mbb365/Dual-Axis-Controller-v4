import {
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
export type HaloVisualStyle = 'pixel' | 'matrix' | 'plotter';

const STYLE_RESOLUTION: Record<HaloVisualStyle, { x: number; y: number }> = {
    pixel: { x: 10, y: 10 },
    matrix: { x: 32, y: 32 },
    plotter: { x: 1, y: 1 },
};

function clamp01(value: number) {
    return Math.max(0, Math.min(1, value));
}

function quantizeFraction(value: number, steps: number) {
    if (steps <= 1) return clamp01(value);
    return clamp01(Math.round(value * (steps - 1)) / (steps - 1));
}

function quantizeFractionToCellCenter(value: number, steps: number) {
    if (steps <= 1) return 0.5;
    const clampedValue = clamp01(value);
    const index = Math.max(0, Math.min(steps - 1, Math.floor(clampedValue * steps)));
    return (index + 0.5) / steps;
}

function quantizeFractionForStyle(value: number, style: HaloVisualStyle, axis: 'x' | 'y') {
    if (style === 'pixel') {
        return quantizeFractionToCellCenter(value, STYLE_RESOLUTION[style][axis]);
    }
    if (style === 'matrix') {
        return quantizeFraction(value, STYLE_RESOLUTION[style][axis]);
    }
    return clamp01(value);
}

export function yPosFromBrightness(brightness: number, visualStyle: HaloVisualStyle = 'plotter') {
    const yFraction = 1 - clamp01(brightness / 100);
    return quantizeFractionForStyle(yFraction, visualStyle, 'y') * 100;
}

function buildLockedSpectrumColor(hue: number) {
    return `hsl(${hue}, 86%, 66%)`;
}

function interpolateChannel(start: number, end: number, t: number) {
    return Math.round(start + (end - start) * t);
}

function interpolateRgb(
    start: { r: number; g: number; b: number },
    end: { r: number; g: number; b: number },
    t: number
) {
    return {
        r: interpolateChannel(start.r, end.r, t),
        g: interpolateChannel(start.g, end.g, t),
        b: interpolateChannel(start.b, end.b, t),
    };
}

function buildLuminousTemperatureColor(hue: number, saturation: number, brightness: number) {
    const xFraction = temperatureValuesToXFraction(hue, saturation);
    const normalizedBrightness = Math.max(0, Math.min(1, brightness / 100));
    const cool = { r: 174, g: 231, b: 255 };
    const neutral = { r: 255, g: 255, b: 255 };
    const warm = { r: 255, g: 181, b: 61 };

    const mixed =
        xFraction <= 0.3
            ? interpolateRgb(cool, neutral, xFraction / 0.3)
            : interpolateRgb(neutral, warm, (xFraction - 0.3) / 0.7);

    const glowLift = 0.1 + normalizedBrightness * 0.16;

    return `rgb(${Math.min(255, Math.round(mixed.r + (255 - mixed.r) * glowLift))} ${Math.min(
        255,
        Math.round(mixed.g + (255 - mixed.g) * glowLift)
    )} ${Math.min(255, Math.round(mixed.b + (255 - mixed.b) * glowLift))})`;
}

export function selectionFromFractions(
    xFraction: number,
    yFraction: number,
    mode: HaloMode,
    lockedSpectrumHue?: number | null
): HaloSelection {
    const clampedX = clamp01(xFraction);
    const clampedY = clamp01(yFraction);

    let nextHue: number;
    let nextSaturation: number;

    if (mode === 'spectrum') {
        if (lockedSpectrumHue != null) {
            nextHue = lockedSpectrumHue;
            nextSaturation = Math.round(clampedX * 100);
        } else {
            nextHue = Math.round(clampedX * 360);
            nextSaturation = 100;
        }
    } else {
        const temperatureValues = xFractionToTemperatureValues(clampedX);
        nextHue = temperatureValues.hue;
        nextSaturation = temperatureValues.saturation;
    }

    return {
        brightness: Math.round((1 - clampedY) * 100),
        hue: nextHue,
        saturation: nextSaturation,
        xPercent: clampedX * 100,
        yPercent: clampedY * 100,
    };
}

export function xPosFromHueSat(
    hue: number,
    sat: number,
    mode: HaloMode,
    lockedSpectrumHue?: number | null,
    visualStyle: HaloVisualStyle = 'plotter'
) {
    let xFraction: number;
    if (mode === 'spectrum') {
        if (lockedSpectrumHue != null) {
            xFraction = clamp01(sat / 100);
        } else {
            xFraction = hue / 360;
        }
    } else {
        xFraction = temperatureValuesToXFraction(hue, sat);
    }

    return quantizeFractionForStyle(xFraction, visualStyle, 'x') * 100;
}

export function buildTemperatureIndicatorColor(hue: number, saturation: number, brightness: number) {
    return buildLuminousTemperatureColor(hue, saturation, brightness);
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
    lockedSpectrumHue?: number | null,
    visualStyle: HaloVisualStyle = 'plotter'
): HaloSelection {
    let xPercent = (clientX - rect.left) / rect.width;
    let yPercent = (clientY - rect.top) / rect.height;

    xPercent = quantizeFractionForStyle(clamp01(xPercent), visualStyle, 'x');
    yPercent = quantizeFractionForStyle(clamp01(yPercent), visualStyle, 'y');

    return selectionFromFractions(xPercent, yPercent, mode, lockedSpectrumHue);
}

export function buildSurfaceNodeColor(
    mode: HaloMode,
    selection: Pick<HaloSelection, 'hue' | 'saturation' | 'brightness'>,
    lockedSpectrumHue?: number | null,
    visualStyle: HaloVisualStyle = 'plotter'
) {
    if (mode === 'temperature') {
        return buildLuminousTemperatureColor(selection.hue, selection.saturation, selection.brightness);
    }

    if (selection.saturation < 10) {
        return visualStyle === 'pixel'
            ? `hsl(0, 0%, ${Math.min(99, 94 + selection.brightness * 0.05)}%)`
            : `hsl(0, 0%, ${Math.min(98, 88 + selection.brightness * 0.08)}%)`;
    }

    const hue = lockedSpectrumHue ?? selection.hue;
    const saturation = lockedSpectrumHue != null ? Math.max(18, selection.saturation) : Math.max(72, selection.saturation);
    const lightness = 24 + selection.brightness * 0.58;
    return `hsl(${hue}, ${Math.min(100, saturation)}%, ${Math.min(84, lightness)}%)`;
}

export function buildPadBackground(
    isOn: boolean,
    mode: HaloMode,
    lockedSpectrumHue?: number | null,
    visualStyle: HaloVisualStyle = 'plotter'
) {
    if (visualStyle === 'pixel') {
        return 'transparent';
    }

    if (!isOn) {
        return 'radial-gradient(circle at 50% 50%, rgba(196, 181, 253, 0.34) 0%, rgba(196, 181, 253, 0.14) 26%, rgba(217, 222, 230, 0.08) 48%, rgba(216, 220, 228, 0) 72%), linear-gradient(145deg, rgba(239, 241, 245, 0.98) 0%, rgba(223, 227, 234, 0.96) 54%, rgba(210, 214, 222, 0.98) 100%)';
    }

    if (mode === 'spectrum') {
        if (lockedSpectrumHue != null) {
            const lockedColor = buildLockedSpectrumColor(lockedSpectrumHue);
            if (visualStyle === 'matrix') {
                return 'transparent';
            }
            return `radial-gradient(circle at 14% 18%, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0.1) 14%, rgba(255, 255, 255, 0) 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.84) 100%), linear-gradient(90deg, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0.94) 18%, ${lockedColor} 100%)`;
        }
        if (visualStyle === 'matrix') {
            return 'transparent';
        }
        return 'radial-gradient(circle at 14% 18%, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.08) 14%, rgba(255, 255, 255, 0) 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.84) 100%), linear-gradient(90deg, rgba(255, 96, 96, 1) 0%, rgba(255, 210, 94, 0.92) 18%, rgba(128, 232, 106, 0.92) 36%, rgba(72, 221, 244, 0.9) 54%, rgba(110, 115, 255, 0.9) 74%, rgba(255, 98, 198, 0.96) 100%)';
    }

    if (visualStyle === 'matrix') {
        return 'transparent';
    }
    return 'radial-gradient(circle at 18% 22%, rgba(255, 255, 255, 0.34) 0%, rgba(255, 255, 255, 0.18) 15%, rgba(255, 255, 255, 0) 38%), linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.84) 100%), linear-gradient(90deg, rgba(174, 231, 255, 0.96) 0%, rgba(255, 255, 255, 0.92) 30%, rgba(255, 181, 61, 1) 100%)';
}

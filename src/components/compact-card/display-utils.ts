import type { GroupedLightOption } from '../CompactCard';

export function formatStatus(
    isOn: boolean,
    brightness: number,
    kelvin: number | null,
    uiMode: 'temperature' | 'spectrum'
) {
    if (!isOn) return 'Off';

    const brightnessText = `${Math.round(brightness)}%`;
    if (uiMode === 'temperature' && kelvin) {
        return `${brightnessText} at ${kelvin.toLocaleString()}K`;
    }

    return `${brightnessText} at color`;
}

export function getRgbText(hue: number, saturation: number, brightness: number) {
    const s = saturation / 100;
    const v = brightness / 100;
    const c = v * s;
    const normalizedHue = ((hue % 360) + 360) % 360;
    const x = c * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
    const m = v - c;

    let r = 0;
    let g = 0;
    let b = 0;

    if (normalizedHue < 60) {
        r = c;
        g = x;
    } else if (normalizedHue < 120) {
        r = x;
        g = c;
    } else if (normalizedHue < 180) {
        g = c;
        b = x;
    } else if (normalizedHue < 240) {
        g = x;
        b = c;
    } else if (normalizedHue < 300) {
        r = x;
        b = c;
    } else {
        r = c;
        b = x;
    }

    const red = Math.round((r + m) * 255);
    const green = Math.round((g + m) * 255);
    const blue = Math.round((b + m) * 255);

    return `R${red} G${green} B${blue}`;
}

function isWarmTemperatureHue(hue: number) {
    const normalizedHue = ((hue % 360) + 360) % 360;
    return Math.abs(normalizedHue - 38) <= Math.abs(normalizedHue - 210);
}

function buildReflectionColor(
    isOn: boolean,
    hue: number,
    saturation: number,
    brightness: number,
    uiMode: 'temperature' | 'spectrum',
    alpha = 1
) {
    if (!isOn) {
        return `rgba(140, 149, 159, ${0.18 * alpha})`;
    }

    const normalizedSaturation = Math.max(0, Math.min(1, saturation / 100));
    const normalizedBrightness = Math.max(0, Math.min(1, brightness / 100));

    if (uiMode === 'temperature') {
        const isWarm = isWarmTemperatureHue(hue);

        if (normalizedSaturation < 0.12) {
            if (isWarm) {
                const lightness = 92 + normalizedBrightness * 5;
                return `hsla(34, ${36 + normalizedBrightness * 10}%, ${Math.min(98, lightness)}%, ${alpha})`;
            }

            const lightness = 92 + normalizedBrightness * 5;
            return `hsla(206, ${30 + normalizedBrightness * 12}%, ${Math.min(98, lightness)}%, ${alpha})`;
        }

        if (isWarm) {
            const lightness = 70 + normalizedBrightness * 11 - normalizedSaturation * 3;
            const colorSaturation = 74 + normalizedSaturation * 24;
            return `hsla(28, ${Math.min(100, colorSaturation)}%, ${Math.min(84, lightness)}%, ${alpha})`;
        }

        const lightness = 72 + normalizedBrightness * 10 - normalizedSaturation * 2;
        const colorSaturation = 64 + normalizedSaturation * 24;
        return `hsla(204, ${Math.min(96, colorSaturation)}%, ${Math.min(86, lightness)}%, ${alpha})`;
    }

    const displaySaturation = Math.max(78, Math.min(100, saturation * 1.32));
    const displayLightness = 60 + normalizedBrightness * 12;
    return `hsla(${hue}, ${displaySaturation}%, ${Math.min(74, displayLightness)}%, ${alpha})`;
}

export function buildCompactBackground(
    isOn: boolean,
    hue: number,
    saturation: number,
    brightness: number,
    uiMode: 'temperature' | 'spectrum'
) {
    if (!isOn) {
        return 'linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)';
    }

    if (uiMode === 'temperature') {
        const normalizedSaturation = Math.max(0, Math.min(1, saturation / 100));
        const isWarm = isWarmTemperatureHue(hue) && normalizedSaturation >= 0.08;
        const startTone = isWarm ? 'hsla(34, 100%, 97%, 1)' : 'hsla(205, 95%, 97%, 1)';
        const endTone = buildReflectionColor(true, hue, saturation, brightness, uiMode, isWarm ? 0.48 : 0.42);
        return `linear-gradient(135deg, ${startTone} 0%, ${endTone} 100%)`;
    }

    const startTone = `hsla(${hue}, ${Math.max(18, saturation * 0.22)}%, 97%, 1)`;
    const endTone = buildReflectionColor(true, hue, saturation, brightness, uiMode, 0.44);
    return `linear-gradient(135deg, ${startTone} 0%, ${endTone} 100%)`;
}

export function buildGroupedCompactBackground(groupedLights: GroupedLightOption[]) {
    const activeLights = groupedLights
        .filter((light) => light.isOn && light.previewBrightness > 0)
        .sort((left, right) => right.previewBrightness - left.previewBrightness)
        .slice(0, 4);

    if (activeLights.length < 2) {
        return null;
    }

    const gradientStops = activeLights.map((light, index) => {
        const position = activeLights.length === 1 ? 100 : Math.round((index / (activeLights.length - 1)) * 100);
        return `${buildReflectionColor(
            true,
            light.previewHue,
            light.previewSaturation,
            light.previewBrightness,
            light.previewMode,
            0.42
        )} ${position}%`;
    });

    return `linear-gradient(135deg, rgba(248, 250, 252, 0.96) 0%, ${gradientStops.join(', ')})`;
}

export function buildIconBackground(
    isOn: boolean,
    hue: number,
    saturation: number,
    brightness: number,
    uiMode: 'temperature' | 'spectrum'
) {
    if (!isOn) {
        return 'rgba(140, 149, 159, 0.18)';
    }

    const normalizedSaturation = Math.max(0, Math.min(1, saturation / 100));
    const normalizedBrightness = Math.max(0, Math.min(1, brightness / 100));

    if (uiMode === 'temperature') {
        if (normalizedSaturation < 0.12) {
            if (isWarmTemperatureHue(hue)) {
                return `hsla(33, ${48 + normalizedBrightness * 14}%, ${93 + normalizedBrightness * 3}%, 0.98)`;
            }

            return `hsla(205, ${42 + normalizedBrightness * 14}%, ${93 + normalizedBrightness * 3}%, 0.98)`;
        }

        if (isWarmTemperatureHue(hue)) {
            return `hsla(28, ${86 + normalizedSaturation * 12}%, ${72 + normalizedBrightness * 10}%, 0.98)`;
        }

        return `hsla(204, ${76 + normalizedSaturation * 18}%, ${74 + normalizedBrightness * 9}%, 0.98)`;
    }

    return `hsla(${hue}, ${Math.max(84, saturation * 1.26)}%, ${62 + normalizedBrightness * 10}%, 0.98)`;
}

export function buildIconForeground(
    isOn: boolean,
    saturation: number,
    brightness: number,
    uiMode: 'temperature' | 'spectrum'
) {
    if (!isOn) {
        return 'rgba(90, 99, 109, 0.72)';
    }

    if (uiMode === 'temperature' && saturation < 12) {
        return brightness > 55 ? 'rgba(71, 85, 105, 0.9)' : 'rgba(55, 65, 81, 0.86)';
    }

    return '#ffffff';
}

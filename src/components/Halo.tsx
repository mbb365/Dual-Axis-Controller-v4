import { useRef, useState } from 'react';
import classNames from 'classnames';

interface HaloProps {
    hue: number;
    saturation: number;
    brightness: number;
    isOn: boolean;
    onChange: (h: number, s: number, b: number) => void;
    onToggle: () => void;
    mode: 'temperature' | 'spectrum';
}

const HALO_CSS = `
.halo {
    container-type: inline-size;
}

.halo__pad-shell {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
}

.halo__pad {
    position: absolute;
    inset: 0;
    border-radius: 18px;
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
    border: 1px solid rgba(15, 23, 42, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 3px 8px rgba(15, 23, 42, 0.08);
}

.halo__pad.is-off {
    cursor: pointer;
    border-color: rgba(124, 58, 237, 0.12);
    box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.58),
        inset 0 0 0 1px rgba(255, 255, 255, 0.08),
        inset 0 0 80px rgba(168, 85, 247, 0.18),
        0 3px 8px rgba(15, 23, 42, 0.08);
}

.halo__indicator {
    position: absolute;
    width: 36px;
    height: 36px;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    border: 4px solid rgba(255, 255, 255, 0.98);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.2);
    pointer-events: none;
}

@container (max-width: 420px) {
    .halo__indicator {
        width: 30px;
        height: 30px;
        border-width: 3px;
    }
}
`;

function xPosFromHueSat(hue: number, sat: number, mode: 'temperature' | 'spectrum') {
    if (mode === 'spectrum') {
        return (hue / 360) * 100;
    }

    const leftHue = 210;
    const rightHue = 38;
    const coolDist = Math.abs(hue - leftHue);
    const warmDist = Math.abs(hue - rightHue);

    if (coolDist < warmDist) {
        return (0.5 - sat / 200) * 100;
    }

    return (0.5 + sat / 200) * 100;
}

function buildTemperatureIndicatorColor(hue: number, saturation: number, brightness: number) {
    const normalizedSaturation = Math.max(0, Math.min(1, saturation / 100));
    const normalizedBrightness = Math.max(0, Math.min(1, brightness / 100));

    if (normalizedSaturation < 0.12) {
        const whiteLightness = 97 + normalizedBrightness * 2;
        return `hsl(0, 0%, ${Math.min(99, whiteLightness)}%)`;
    }

    const colorSaturation = 14 + normalizedSaturation * 58;
    const colorLightness = 94 - normalizedSaturation * 12 + normalizedBrightness * 4;
    return `hsl(${hue}, ${colorSaturation}%, ${Math.min(97, colorLightness)}%)`;
}

function buildIndicatorShadow(hue: number, saturation: number, brightness: number, mode: 'temperature' | 'spectrum') {
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

export function Halo({
    hue,
    saturation,
    brightness,
    isOn,
    onChange,
    onToggle,
    mode,
}: HaloProps) {
    const trackpadRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const updateFromPosition = (event: React.PointerEvent) => {
        if (!trackpadRef.current) return;

        const rect = trackpadRef.current.getBoundingClientRect();
        let xPercent = (event.clientX - rect.left) / rect.width;
        let yPercent = (event.clientY - rect.top) / rect.height;

        xPercent = Math.max(0, Math.min(1, xPercent));
        yPercent = Math.max(0, Math.min(1, yPercent));

        let nextHue: number;
        let nextSaturation: number;

        if (mode === 'spectrum') {
            nextHue = Math.round(xPercent * 360);
            nextSaturation = 100;
        } else if (xPercent < 0.5) {
            nextHue = 210;
            nextSaturation = Math.round((0.5 - xPercent) * 200);
        } else {
            nextHue = 38;
            nextSaturation = Math.round((xPercent - 0.5) * 200);
        }

        const nextBrightness = Math.round((1 - yPercent) * 100);
        onChange(nextHue, nextSaturation, nextBrightness);
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isOn) {
            onToggle();
            return;
        }

        setIsDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPosition(event);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging || !isOn) return;
        updateFromPosition(event);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (isDragging) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setIsDragging(false);
    };

    const padBackground =
        !isOn
            ? 'radial-gradient(circle at 50% 50%, rgba(196, 181, 253, 0.34) 0%, rgba(196, 181, 253, 0.14) 26%, rgba(217, 222, 230, 0.08) 48%, rgba(216, 220, 228, 0) 72%), linear-gradient(145deg, rgba(239, 241, 245, 0.98) 0%, rgba(223, 227, 234, 0.96) 54%, rgba(210, 214, 222, 0.98) 100%)'
            : mode === 'spectrum'
            ? 'linear-gradient(90deg, #ff6b6b 0%, #ffd166 18%, #95d16f 36%, #56cfe1 54%, #7b6dff 74%, #ff77c8 100%)'
            : 'linear-gradient(90deg, rgba(191, 227, 255, 0.96) 0%, rgba(255, 255, 255, 0.98) 46%, rgba(245, 197, 86, 0.96) 100%)';

    const indicatorColor =
        mode === 'spectrum'
            ? `hsl(${hue}, 100%, 50%)`
            : buildTemperatureIndicatorColor(hue, saturation, brightness);

    return (
        <div className="halo">
            <style>{HALO_CSS}</style>
            <div className="halo__pad-shell">
                <div
                    ref={trackpadRef}
                    className={classNames('halo__pad', { 'is-off': !isOn })}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    style={{
                        background: isOn
                            ? `linear-gradient(180deg, rgba(255, 255, 255, 0.08) 0%, rgba(255,255,255,0) 100%), ${padBackground}`
                            : padBackground,
                    }}
                >
                    {isOn ? (
                        <div
                            className="halo__indicator"
                            style={{
                                left: `${xPosFromHueSat(hue, saturation, mode)}%`,
                                top: `${100 - brightness}%`,
                                background: indicatorColor,
                                boxShadow: buildIndicatorShadow(hue, saturation, brightness, mode),
                            }}
                        />
                    ) : null}
                </div>
            </div>
        </div>
    );
}

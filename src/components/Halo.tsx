import { useRef, useState } from 'react';
import classNames from 'classnames';

interface HaloProps {
    hue: number;
    saturation: number;
    brightness: number;
    isOn: boolean;
    onChange: (h: number, s: number, b: number) => void;
    onInteractionStart?: () => void;
    onInteractionEnd?: () => void;
    onToggle: () => void;
    mode: 'temperature' | 'spectrum';
}

interface HaloSelection {
    brightness: number;
    hue: number;
    saturation: number;
    xPercent: number;
    yPercent: number;
}

interface HaloPulse {
    color: string;
    id: number;
    xPercent: number;
    yPercent: number;
}

const HALO_CSS = `
.halo {
    container-type: inline-size;
}

.halo__pad-shell {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: visible;
}

.halo__pad {
    position: absolute;
    inset: 0;
    border-radius: 18px;
    overflow: hidden;
    background-color: rgba(245, 247, 250, 0.96);
    cursor: crosshair;
    touch-action: none;
    border: 1px solid rgba(15, 23, 42, 0.08);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 3px 8px rgba(15, 23, 42, 0.08);
    transition:
        border-radius 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        transform 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        box-shadow 340ms cubic-bezier(0.22, 0.68, 0.2, 1);
}

.halo__pad::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(99, 115, 148, 0.3) 1px, transparent 1px),
        linear-gradient(90deg, rgba(99, 115, 148, 0.3) 1px, transparent 1px);
    background-size: 24px 24px;
    background-position: center center;
    opacity: 0.9;
    -webkit-mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.38) 26%, rgba(0, 0, 0, 0.94) 60%, rgba(0, 0, 0, 1) 100%);
    mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.38) 26%, rgba(0, 0, 0, 0.94) 60%, rgba(0, 0, 0, 1) 100%);
    pointer-events: none;
    transition:
        opacity 280ms ease,
        -webkit-mask-image 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        mask-image 340ms cubic-bezier(0.22, 0.68, 0.2, 1);
}

.halo__pad::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.1) 0%, rgba(240, 244, 249, 0.06) 100%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
    pointer-events: none;
}

.halo__pulse {
    position: absolute;
    left: 0;
    top: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 1;
}

.halo__pulse::before,
.halo__pulse::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 50%;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    pointer-events: none;
}

.halo__pulse::before {
    width: 96px;
    height: 96px;
    background:
        radial-gradient(circle, color-mix(in srgb, var(--halo-pulse-color) 36%, white 64%) 0%, color-mix(in srgb, var(--halo-pulse-color) 21%, white 79%) 24%, rgba(255, 255, 255, 0.09) 52%, rgba(255, 255, 255, 0) 100%);
    opacity: 0;
    filter: blur(13px);
    animation: halo-bloom 820ms cubic-bezier(0.16, 0.72, 0.2, 1) forwards;
}

.halo__pulse::after {
    width: 24px;
    height: 24px;
    border: 1.5px solid color-mix(in srgb, var(--halo-pulse-color) 44%, white 56%);
    box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.28),
        0 0 20px color-mix(in srgb, var(--halo-pulse-color) 24%, transparent 76%);
    opacity: 0;
    animation: halo-ripple 980ms cubic-bezier(0.18, 0.72, 0.2, 1) forwards;
}

@keyframes halo-bloom {
    0% {
        opacity: 0.68;
        transform: translate(-50%, -50%) scale(0.32);
    }

    38% {
        opacity: 0.4;
        transform: translate(-50%, -50%) scale(0.88);
    }

    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(1.16);
    }
}

@keyframes halo-ripple {
    0% {
        opacity: 0.44;
        transform: translate(-50%, -50%) scale(0.56);
    }

    46% {
        opacity: 0.22;
        transform: translate(-50%, -50%) scale(1.74);
    }

    100% {
        opacity: 0;
        transform: translate(-50%, -50%) scale(2.84);
    }
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
    z-index: 3;
    transition:
        left 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        top 340ms cubic-bezier(0.22, 0.68, 0.2, 1),
        box-shadow 220ms ease;
}

@container (max-width: 420px) {
    .halo__indicator {
        width: 30px;
        height: 30px;
        border-width: 3px;
    }
}

@media (prefers-color-scheme: dark) {
    .halo__pad {
        background-color: rgba(26, 31, 38, 0.96);
        border-color: rgba(255, 255, 255, 0.08);
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.08),
            0 3px 8px rgba(0, 0, 0, 0.18);
    }

    .halo__pad::before {
        opacity: 0.18;
    }

    .halo__pad::after {
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.02) 0%, rgba(240, 244, 249, 0.012) 100%);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }

    .halo__pad.is-off {
        border-color: rgba(124, 58, 237, 0.08);
        box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.07),
            inset 0 0 42px rgba(168, 85, 247, 0.08),
            0 3px 8px rgba(0, 0, 0, 0.18);
    }

    .halo__pulse::before {
        opacity: 0;
        filter: blur(9px);
    }

    .halo__pulse::after {
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.12),
            0 0 12px color-mix(in srgb, var(--halo-pulse-color) 12%, transparent 88%);
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
    onInteractionStart,
    onInteractionEnd,
    onToggle,
    mode,
}: HaloProps) {
    const trackpadRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [pulse, setPulse] = useState<HaloPulse | null>(null);
    const pulseIdRef = useRef(0);

    const selectionFromPosition = (event: React.PointerEvent): HaloSelection | null => {
        if (!trackpadRef.current) return null;

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

        return {
            brightness: Math.round((1 - yPercent) * 100),
            hue: nextHue,
            saturation: nextSaturation,
            xPercent: xPercent * 100,
            yPercent: yPercent * 100,
        };
    };

    const triggerPulse = ({ xPercent, yPercent, hue: nextHue, saturation: nextSaturation, brightness: nextBrightness }: HaloSelection) => {
        pulseIdRef.current += 1;
        const color =
            mode === 'spectrum'
                ? `hsl(${nextHue}, 100%, 50%)`
                : buildTemperatureIndicatorColor(nextHue, nextSaturation, nextBrightness);

        setPulse({
            color,
            id: pulseIdRef.current,
            xPercent,
            yPercent,
        });
    };

    const updateFromPosition = (event: React.PointerEvent) => {
        const selection = selectionFromPosition(event);
        if (!selection) return;

        onChange(selection.hue, selection.saturation, selection.brightness);
        return selection;
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isOn) {
            onToggle();
            return;
        }

        setIsDragging(true);
        onInteractionStart?.();
        event.currentTarget.setPointerCapture(event.pointerId);
        const selection = updateFromPosition(event);
        if (selection) {
            triggerPulse(selection);
        }
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging || !isOn) return;
        updateFromPosition(event);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (isDragging) {
            event.currentTarget.releasePointerCapture(event.pointerId);
            onInteractionEnd?.();
        }
        setIsDragging(false);
    };

    const padBackground =
        !isOn
            ? 'radial-gradient(circle at 50% 50%, rgba(196, 181, 253, 0.34) 0%, rgba(196, 181, 253, 0.14) 26%, rgba(217, 222, 230, 0.08) 48%, rgba(216, 220, 228, 0) 72%), linear-gradient(145deg, rgba(239, 241, 245, 0.98) 0%, rgba(223, 227, 234, 0.96) 54%, rgba(210, 214, 222, 0.98) 100%)'
            : mode === 'spectrum'
            ? 'radial-gradient(circle at 14% 18%, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 14%, rgba(255, 255, 255, 0) 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.82) 100%), linear-gradient(90deg, rgba(255, 107, 107, 0.96) 0%, rgba(255, 209, 102, 0.86) 18%, rgba(149, 209, 111, 0.84) 36%, rgba(86, 207, 225, 0.82) 54%, rgba(123, 109, 255, 0.84) 74%, rgba(255, 119, 200, 0.92) 100%)'
            : 'radial-gradient(circle at 18% 22%, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.16) 15%, rgba(255, 255, 255, 0) 38%), linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.84) 100%), linear-gradient(90deg, rgba(101, 175, 239, 0.94) 0%, rgba(222, 236, 247, 0.7) 48%, rgba(255, 214, 84, 0.92) 100%)';

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
                        background: padBackground,
                        ['--halo-active-color' as string]: indicatorColor,
                    }}
                >
                </div>
                {pulse ? (
                    <div
                        key={pulse.id}
                        className="halo__pulse"
                        onAnimationEnd={() => {
                            setPulse((currentPulse) => (currentPulse?.id === pulse.id ? null : currentPulse));
                        }}
                        style={{
                            left: `${pulse.xPercent}%`,
                            top: `${pulse.yPercent}%`,
                            ['--halo-pulse-color' as string]: pulse.color,
                        }}
                    />
                ) : null}
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
    );
}

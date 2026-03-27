import { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

interface HaloProps {
    hue: number;
    saturation: number;
    brightness: number;
    isOn: boolean;
    markers?: HaloMarker[];
    onChange: (h: number, s: number, b: number) => void;
    onInteractionStart?: () => void;
    onInteractionEnd?: () => void;
    isDiscoMode?: boolean;
    onDiscoModeTrigger?: () => void;
    onDiscoModeExit?: () => void;
    onMarkerSelect?: (entityId: string) => void;
    onToggle: () => void;
    mode: 'temperature' | 'spectrum';
}

export interface HaloMarker {
    entityId: string;
    hue: number;
    saturation: number;
    brightness: number;
    isOn: boolean;
    isActive?: boolean;
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

const SAFE_CONTROL_UPDATE_INTERVAL_MS = 120;
const DISCO_OVERSPEED_THRESHOLD = 140;
const DISCO_OVERSPEED_STREAK_MS = 650;

interface HaloVelocitySample {
    at: number;
    selection: HaloSelection;
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

.halo__pad.is-disco {
    cursor: pointer;
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

.halo__indicator.is-live {
    transition: box-shadow 220ms ease;
}

.halo__group-indicator {
    appearance: none;
    -webkit-appearance: none;
    padding: 0;
    position: absolute;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    border: 2px solid rgba(255, 255, 255, 0.84);
    box-shadow:
        0 0 0 1px rgba(15, 23, 42, 0.08),
        0 8px 16px rgba(15, 23, 42, 0.12);
    pointer-events: auto;
    z-index: 2;
    opacity: 0.88;
    cursor: grab;
    background: transparent;
    transition:
        left 280ms cubic-bezier(0.22, 0.68, 0.2, 1),
        top 280ms cubic-bezier(0.22, 0.68, 0.2, 1),
        transform 220ms ease,
        opacity 220ms ease,
        box-shadow 220ms ease;
}

.halo__group-indicator:focus-visible {
    outline: 2px solid rgba(59, 130, 246, 0.9);
    outline-offset: 2px;
}

.halo__group-indicator.is-active {
    width: 22px;
    height: 22px;
    opacity: 0.96;
    border-color: rgba(255, 255, 255, 0.94);
    box-shadow:
        0 0 0 1px rgba(15, 23, 42, 0.1),
        0 10px 18px rgba(15, 23, 42, 0.16);
}

.halo__group-indicator.is-off {
    background: rgba(203, 213, 225, 0.42) !important;
    border-color: rgba(255, 255, 255, 0.72);
    opacity: 0.68;
    box-shadow:
        0 0 0 1px rgba(15, 23, 42, 0.05),
        0 6px 12px rgba(15, 23, 42, 0.08);
}

.halo__disco-overlay {
    position: absolute;
    inset: 0;
    z-index: 4;
    border-radius: 18px;
    overflow: hidden;
    display: grid;
    place-items: center;
    padding: 22px;
    pointer-events: none;
}

.halo__disco-overlay::before,
.halo__disco-overlay::after {
    content: '';
    position: absolute;
    inset: -18%;
    pointer-events: none;
}

.halo__disco-overlay::before {
    background:
        conic-gradient(from 0deg, rgba(255, 82, 82, 0.82), rgba(255, 193, 7, 0.8), rgba(94, 234, 212, 0.78), rgba(96, 165, 250, 0.82), rgba(244, 114, 182, 0.82), rgba(255, 82, 82, 0.82));
    filter: blur(28px) saturate(130%);
    opacity: 0.88;
    animation: halo-disco-spin 8s linear infinite, halo-disco-breathe 2.2s ease-in-out infinite alternate;
}

.halo__disco-overlay::after {
    inset: 0;
    background:
        radial-gradient(circle at 50% 24%, rgba(255, 255, 255, 0.22) 0%, rgba(255, 255, 255, 0.08) 18%, rgba(255, 255, 255, 0) 48%),
        linear-gradient(180deg, rgba(11, 18, 32, 0.18) 0%, rgba(11, 18, 32, 0.3) 100%);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
}

.halo__disco-message {
    position: relative;
    z-index: 1;
    max-width: 84%;
    padding: 18px 20px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.22);
    box-shadow:
        0 12px 34px rgba(15, 23, 42, 0.16),
        inset 0 1px 0 rgba(255, 255, 255, 0.22);
    color: #f8fafc;
    text-align: center;
}

.halo__disco-title {
    display: block;
    margin-bottom: 8px;
    font-size: 0.98rem;
    font-weight: 700;
    letter-spacing: 0.08em;
}

.halo__disco-copy {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.45;
    font-weight: 500;
    color: rgba(248, 250, 252, 0.96);
}

@keyframes halo-disco-spin {
    from {
        transform: rotate(0deg) scale(1);
    }

    to {
        transform: rotate(360deg) scale(1.06);
    }
}

@keyframes halo-disco-breathe {
    from {
        opacity: 0.72;
        filter: blur(24px) saturate(120%);
    }

    to {
        opacity: 0.96;
        filter: blur(34px) saturate(138%);
    }
}

@container (max-width: 420px) {
    .halo__indicator {
        width: 30px;
        height: 30px;
        border-width: 3px;
    }

    .halo__group-indicator {
        width: 16px;
        height: 16px;
    }

    .halo__group-indicator.is-active {
        width: 20px;
        height: 20px;
    }

    .halo__disco-message {
        max-width: 90%;
        padding: 16px 16px;
    }

    .halo__disco-title {
        font-size: 0.9rem;
    }

    .halo__disco-copy {
        font-size: 0.8rem;
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

    .halo__group-indicator {
        border-color: rgba(255, 255, 255, 0.58);
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.06),
            0 8px 16px rgba(0, 0, 0, 0.18);
    }

    .halo__group-indicator.is-active {
        border-color: rgba(255, 255, 255, 0.74);
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.08),
            0 10px 20px rgba(0, 0, 0, 0.22);
    }

    .halo__group-indicator.is-off {
        background: rgba(100, 116, 139, 0.32) !important;
        border-color: rgba(255, 255, 255, 0.44);
        box-shadow:
            0 0 0 1px rgba(255, 255, 255, 0.04),
            0 6px 12px rgba(0, 0, 0, 0.16);
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

function isWarmTemperatureHue(hue: number) {
    const normalizedHue = ((hue % 360) + 360) % 360;
    return Math.abs(normalizedHue - 38) <= Math.abs(normalizedHue - 210);
}

function buildTemperatureIndicatorColor(hue: number, saturation: number, brightness: number) {
    const normalizedSaturation = Math.max(0, Math.min(1, saturation / 100));
    const normalizedBrightness = Math.max(0, Math.min(1, brightness / 100));

    if (normalizedSaturation < 0.12) {
        const whiteLightness = 97 + normalizedBrightness * 2;
        return `hsl(0, 0%, ${Math.min(99, whiteLightness)}%)`;
    }

    if (isWarmTemperatureHue(hue)) {
        const colorSaturation = 22 + normalizedSaturation * 70;
        const colorLightness = 88 - normalizedSaturation * 10 + normalizedBrightness * 4;
        return `hsl(30, ${colorSaturation}%, ${Math.min(94, colorLightness)}%)`;
    }

    const colorSaturation = 18 + normalizedSaturation * 34;
    const colorLightness = 92 - normalizedSaturation * 8 + normalizedBrightness * 4;
    return `hsl(200, ${colorSaturation}%, ${Math.min(96, colorLightness)}%)`;
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
    markers = [],
    onChange,
    onInteractionStart,
    onInteractionEnd,
    isDiscoMode = false,
    onDiscoModeTrigger,
    onDiscoModeExit,
    onMarkerSelect,
    onToggle,
    mode,
}: HaloProps) {
    const trackpadRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [pulse, setPulse] = useState<HaloPulse | null>(null);
    const [dragSelection, setDragSelection] = useState<HaloSelection | null>(null);
    const [dragSourceMarkerId, setDragSourceMarkerId] = useState<string | null>(null);
    const pulseIdRef = useRef(0);
    const lastEmittedSelectionRef = useRef<HaloSelection | null>(null);
    const lastVelocitySampleRef = useRef<HaloVelocitySample | null>(null);
    const overspeedStartedAtRef = useRef<number | null>(null);

    const resetSpeedRuleTracking = () => {
        lastVelocitySampleRef.current = null;
        overspeedStartedAtRef.current = null;
    };

    useEffect(() => {
        return () => {
            resetSpeedRuleTracking();
        };
    }, []);

    useEffect(() => {
        if (!isDiscoMode) return;
        setIsDragging(false);
        setDragSelection(null);
        setDragSourceMarkerId(null);
        lastEmittedSelectionRef.current = null;
        resetSpeedRuleTracking();
    }, [isDiscoMode]);

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

    const hasMeaningfulSelectionDelta = (nextSelection: HaloSelection) => {
        const previousSelection = lastEmittedSelectionRef.current;
        if (!previousSelection) return true;

        return (
            Math.abs(nextSelection.xPercent - previousSelection.xPercent) >= 1.2 ||
            Math.abs(nextSelection.yPercent - previousSelection.yPercent) >= 1.2 ||
            Math.abs(nextSelection.brightness - previousSelection.brightness) >= 2 ||
            Math.abs(nextSelection.hue - previousSelection.hue) >= 3 ||
            Math.abs(nextSelection.saturation - previousSelection.saturation) >= 3
        );
    };

    const updateFromPosition = (event: React.PointerEvent, force = false) => {
        const selection = selectionFromPosition(event);
        if (!selection) return;

        if (!force && !hasMeaningfulSelectionDelta(selection)) {
            return selection;
        }

        const now = performance.now();
        if (force) {
            lastVelocitySampleRef.current = { at: now, selection };
            overspeedStartedAtRef.current = null;
        } else {
            const previousSample = lastVelocitySampleRef.current;

            if (previousSample) {
                const deltaTime = now - previousSample.at;
                const deltaX = selection.xPercent - previousSample.selection.xPercent;
                const deltaY = selection.yPercent - previousSample.selection.yPercent;
                const distance = Math.hypot(deltaX, deltaY);
                const velocity = deltaTime > 0 ? distance / (deltaTime / 1000) : Infinity;
                const isOverspeed =
                    deltaTime < SAFE_CONTROL_UPDATE_INTERVAL_MS && velocity > DISCO_OVERSPEED_THRESHOLD;

                if (isOverspeed) {
                    if (overspeedStartedAtRef.current == null) {
                        overspeedStartedAtRef.current = now;
                    } else if (now - overspeedStartedAtRef.current >= DISCO_OVERSPEED_STREAK_MS) {
                        setIsDragging(false);
                        setDragSelection(null);
                        setDragSourceMarkerId(null);
                        lastEmittedSelectionRef.current = null;
                        resetSpeedRuleTracking();
                        onInteractionEnd?.();
                        onDiscoModeTrigger?.();
                        return selection;
                    }
                } else {
                    overspeedStartedAtRef.current = null;
                }
            } else {
                overspeedStartedAtRef.current = null;
            }

            lastVelocitySampleRef.current = { at: now, selection };
        }

        lastEmittedSelectionRef.current = selection;
        setDragSelection(selection);
        onChange(selection.hue, selection.saturation, selection.brightness);
        return selection;
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (isDiscoMode) {
            setIsDragging(false);
            lastEmittedSelectionRef.current = null;
            resetSpeedRuleTracking();
            onDiscoModeExit?.();
            return;
        }

        if (!isOn) {
            onToggle();
            return;
        }

        resetSpeedRuleTracking();
        setIsDragging(true);
        setDragSourceMarkerId(null);
        onInteractionStart?.();
        event.currentTarget.setPointerCapture(event.pointerId);
        const selection = updateFromPosition(event, true);
        if (selection) {
            triggerPulse(selection);
        }
    };

    const handleMarkerPointerDown = (marker: HaloMarker, event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();

        if (isDiscoMode) {
            resetSpeedRuleTracking();
            onDiscoModeExit?.();
            return;
        }

        onMarkerSelect?.(marker.entityId);

        if (!marker.isOn) {
            return;
        }

        resetSpeedRuleTracking();
        lastEmittedSelectionRef.current = null;
        setDragSourceMarkerId(marker.entityId);
        const markerSelection = {
            brightness: marker.brightness,
            hue: marker.hue,
            saturation: marker.saturation,
            xPercent: xPosFromHueSat(marker.hue, marker.saturation, mode),
            yPercent: 100 - marker.brightness,
        };
        setDragSelection(markerSelection);
        setIsDragging(true);
        onInteractionStart?.();
        trackpadRef.current?.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging || !isOn || isDiscoMode) return;
        updateFromPosition(event);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (isDragging) {
            updateFromPosition(event, true);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }
            onInteractionEnd?.();
        }
        setIsDragging(false);
        setDragSelection(null);
        setDragSourceMarkerId(null);
        lastEmittedSelectionRef.current = null;
        resetSpeedRuleTracking();
    };

    const padBackground =
        !isOn
            ? 'radial-gradient(circle at 50% 50%, rgba(196, 181, 253, 0.34) 0%, rgba(196, 181, 253, 0.14) 26%, rgba(217, 222, 230, 0.08) 48%, rgba(216, 220, 228, 0) 72%), linear-gradient(145deg, rgba(239, 241, 245, 0.98) 0%, rgba(223, 227, 234, 0.96) 54%, rgba(210, 214, 222, 0.98) 100%)'
            : mode === 'spectrum'
            ? 'radial-gradient(circle at 14% 18%, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0.08) 14%, rgba(255, 255, 255, 0) 34%), linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.82) 100%), linear-gradient(90deg, rgba(255, 107, 107, 0.96) 0%, rgba(255, 209, 102, 0.86) 18%, rgba(149, 209, 111, 0.84) 36%, rgba(86, 207, 225, 0.82) 54%, rgba(123, 109, 255, 0.84) 74%, rgba(255, 119, 200, 0.92) 100%)'
            : 'radial-gradient(circle at 18% 22%, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.16) 15%, rgba(255, 255, 255, 0) 38%), linear-gradient(180deg, rgba(255, 255, 255, 0.02) 0%, rgba(255, 255, 255, 0.14) 62%, rgba(250, 251, 253, 0.84) 100%), linear-gradient(90deg, rgba(170, 204, 231, 0.82) 0%, rgba(243, 247, 250, 0.74) 48%, rgba(255, 218, 102, 0.9) 100%)';

    const indicatorColor =
        mode === 'spectrum'
            ? `hsl(${hue}, 100%, 50%)`
            : buildTemperatureIndicatorColor(hue, saturation, brightness);

    const markerColor = (marker: HaloMarker) =>
        !marker.isOn
            ? 'rgba(203, 213, 225, 0.42)'
            : mode === 'spectrum'
              ? `hsl(${marker.hue}, 100%, 50%)`
              : buildTemperatureIndicatorColor(marker.hue, marker.saturation, marker.brightness);

    const visibleSelection = dragSelection ?? {
        brightness,
        hue,
        saturation,
        xPercent: xPosFromHueSat(hue, saturation, mode),
        yPercent: 100 - brightness,
    };

    return (
        <div className="halo">
            <style>{HALO_CSS}</style>
            <div className="halo__pad-shell">
                <div
                    ref={trackpadRef}
                    className={classNames('halo__pad', { 'is-off': !isOn, 'is-disco': isDiscoMode })}
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
                {isDiscoMode ? (
                    <div className="halo__disco-overlay">
                        <div className="halo__disco-message">
                            <strong className="halo__disco-title">DISCO MODE!</strong>
                            <p className="halo__disco-copy">
                                Are you hosting a Karaoke party?!
                                <br />
                                <br />
                                The system can&apos;t quite handle so many inputs so quickly :(
                                <br />
                                <br />
                                Try tapping / clicking on a single point and waiting for the system to respond.
                                It&apos;s pretty much magic.
                            </p>
                        </div>
                    </div>
                ) : null}
                {!isDiscoMode
                    ? markers.map((marker) => (
                          marker.entityId === dragSourceMarkerId ? null :
                          <button
                              key={marker.entityId}
                              type="button"
                              className={classNames('halo__group-indicator', {
                                  'is-active': marker.isActive,
                                  'is-off': !marker.isOn,
                              })}
                              aria-label={`Control ${marker.entityId}`}
                              onPointerDown={(event) => handleMarkerPointerDown(marker, event)}
                              style={{
                                  left: `${xPosFromHueSat(marker.hue, marker.saturation, mode)}%`,
                                  top: `${100 - marker.brightness}%`,
                                  background: markerColor(marker),
                              }}
                          />
                      ))
                    : null}
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
                {isOn && !isDiscoMode ? (
                    <div
                        className={classNames('halo__indicator', { 'is-live': !!dragSelection })}
                        style={{
                            left: `${visibleSelection.xPercent}%`,
                            top: `${visibleSelection.yPercent}%`,
                            background:
                                mode === 'spectrum'
                                    ? `hsl(${visibleSelection.hue}, 100%, 50%)`
                                    : buildTemperatureIndicatorColor(
                                          visibleSelection.hue,
                                          visibleSelection.saturation,
                                          visibleSelection.brightness
                                      ),
                            boxShadow: buildIndicatorShadow(
                                visibleSelection.hue,
                                visibleSelection.saturation,
                                visibleSelection.brightness,
                                mode
                            ),
                        }}
                    />
                ) : null}
            </div>
        </div>
    );
}

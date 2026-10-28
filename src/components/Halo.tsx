import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { HALO_CSS } from './halo/halo-css';
import {
    buildIndicatorShadow,
    buildPadBackground,
    buildSurfaceNodeColor,
    buildTemperatureIndicatorColor,
    selectionFromClientPosition as selectionFromClientPoint,
    selectionFromFractions,
    yPosFromBrightness,
    type HaloSelection,
    type HaloVisualStyle,
    xPosFromHueSat,
} from './halo/halo-utils';
export type { HaloVisualStyle } from './halo/halo-utils';

const PIXEL_GRID_SIZE = 10;
const PIXEL_GRID_CELLS = Array.from({ length: PIXEL_GRID_SIZE * PIXEL_GRID_SIZE }, (_, index) => ({
    column: index % PIXEL_GRID_SIZE,
    key: index,
    row: Math.floor(index / PIXEL_GRID_SIZE),
}));

interface HaloProps {
    hue: number;
    saturation: number;
    brightness: number;
    isOn: boolean;
    lockedSpectrumHue?: number | null;
    markers?: HaloMarker[];
    onChange: (h: number, s: number, b: number) => void;
    onInteractionStart?: () => void;
    onInteractionEnd?: () => void;
    isDiscoMode?: boolean;
    discoSpeedMs?: 900 | 1200 | 1500;
    onDiscoSpeedChange?: (speedMs: 900 | 1200 | 1500) => void;
    onDiscoModeTrigger?: () => void;
    onDiscoModeExit?: () => void;
    onMarkerSelect?: (entityId: string) => void;
    onFormationIndicatorSelect?: () => void;
    onDoubleSelect?: (hue: number, saturation: number, brightness: number) => void;
    onToggle: () => void;
    mode: 'temperature' | 'spectrum';
    visualStyle?: HaloVisualStyle;
    indicatorVariant?: 'default' | 'group-relative';
    formationIndicator?: HaloIndicatorSelection | null;
    // where the light was when it was last on: shown greyed while it's off, where a tap brings it back
    restSelection?: HaloIndicatorSelection | null;
    size?: 'full' | 'tile';
}

export interface HaloMarker {
    entityId: string;
    hue: number;
    saturation: number;
    brightness: number;
    isOn: boolean;
    isMuted?: boolean;
    isActive?: boolean;
}

export interface HaloIndicatorSelection {
    hue: number;
    saturation: number;
    brightness: number;
}

interface HaloPulse {
    color: string;
    id: number;
    xPercent: number;
    yPercent: number;
}

interface HaloGhostIndicator {
    brightness: number;
    hue: number;
    saturation: number;
    xPercent: number;
    yPercent: number;
}

const SAFE_CONTROL_UPDATE_INTERVAL_MS = 120;
const DISCO_OVERSPEED_THRESHOLD = 140;
const DISCO_OVERSPEED_STREAK_MS = 650;
const MARKER_DRAG_THRESHOLD_PX = 12;
// A finger works the pad only after resting this long, so a swipe across it scrolls the page and a quick touch changes
// nothing; moving further than TOUCH_SLOP_PX before then is a swipe.
const TOUCH_HOLD_MS = 350;
const TOUCH_SLOP_PX = 8;
const DISCO_SPEED_OPTIONS: Array<{ label: string; speedMs: 900 | 1200 | 1500 }> = [
    { label: 'Disco', speedMs: 900 },
    { label: 'Aurora', speedMs: 1200 },
    { label: 'Chiillll', speedMs: 1500 },
];

interface HaloVelocitySample {
    at: number;
    selection: HaloSelection;
}

interface PendingMarkerDrag {
    pointerId: number;
    selection: HaloSelection;
    sourceMarkerId: string | null;
    startClientX: number;
    startClientY: number;
}

// A finger on the pad before it counts: on a light that's off ('off', a tap turns it on), on the pad ('pad') or on a
// handle ('marker'). It's armed once held for TOUCH_HOLD_MS without moving.
interface TouchGate {
    pointerId: number;
    kind: 'off' | 'pad' | 'marker';
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    timer: number | null;
    armed: boolean;
}

export function Halo({
    hue,
    saturation,
    brightness,
    isOn,
    lockedSpectrumHue,
    markers = [],
    onChange,
    onInteractionStart,
    onInteractionEnd,
    isDiscoMode = false,
    discoSpeedMs = 900,
    onDiscoSpeedChange,
    onDiscoModeTrigger,
    onDiscoModeExit,
    onMarkerSelect,
    onFormationIndicatorSelect,
    onDoubleSelect,
    onToggle,
    mode,
    visualStyle = 'plotter',
    indicatorVariant = 'default',
    formationIndicator = null,
    restSelection = null,
    size = 'full',
}: HaloProps) {
    const buildSelection = useCallback((
        nextHue: number,
        nextSaturation: number,
        nextBrightness: number,
        nextMode: 'temperature' | 'spectrum' = mode,
        nextLockedSpectrumHue: number | null | undefined = lockedSpectrumHue,
        nextVisualStyle: HaloVisualStyle = visualStyle
    ): HaloSelection => ({
        brightness: nextBrightness,
        hue: nextHue,
        saturation: nextSaturation,
        xPercent: xPosFromHueSat(nextHue, nextSaturation, nextMode, nextLockedSpectrumHue, nextVisualStyle),
        yPercent: yPosFromBrightness(nextBrightness, nextVisualStyle),
    }), [lockedSpectrumHue, mode, visualStyle]);

    const trackpadRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [pulse, setPulse] = useState<HaloPulse | null>(null);
    const [dragSelection, setDragSelection] = useState<HaloSelection | null>(null);
    const [dragSourceMarkerId, setDragSourceMarkerId] = useState<string | null>(null);
    const [handoffSelection, setHandoffSelection] = useState<HaloSelection | null>(null);
    const [ghostSelection, setGhostSelection] = useState<HaloGhostIndicator | null>(null);
    const [displaySelection, setDisplaySelection] = useState<HaloSelection>(() =>
        buildSelection(hue, saturation, brightness)
    );
    const pulseIdRef = useRef(0);
    const displaySelectionRef = useRef(displaySelection);
    const animationFrameRef = useRef<number | null>(null);
    const wasOnRef = useRef(isOn);
    const lastEmittedSelectionRef = useRef<HaloSelection | null>(null);
    const lastVelocitySampleRef = useRef<HaloVelocitySample | null>(null);
    const overspeedStartedAtRef = useRef<number | null>(null);
    const handoffTimeoutRef = useRef<number | null>(null);
    const previousActiveMarkerIdRef = useRef<string | null>(null);
    const pendingMarkerDragRef = useRef<PendingMarkerDrag | null>(null);
    const touchGateRef = useRef<TouchGate | null>(null);

    // Once a finger holds the pad it moves the pad, not the page (React's touch listeners can't stop scrolling).
    useEffect(() => {
        const pad = trackpadRef.current;
        const hold = (event: TouchEvent) => {
            if (touchGateRef.current?.armed && event.cancelable) event.preventDefault();
        };
        pad?.addEventListener('touchmove', hold, { passive: false });
        return () => {
            pad?.removeEventListener('touchmove', hold);
            const timer = touchGateRef.current?.timer;
            if (timer != null) window.clearTimeout(timer);
        };
    }, []);
    const latestSelectionRef = useRef<HaloSelection>({
        brightness,
        hue,
        saturation,
        xPercent: xPosFromHueSat(hue, saturation, mode, lockedSpectrumHue, visualStyle),
        yPercent: yPosFromBrightness(brightness, visualStyle),
    });

    const resetSpeedRuleTracking = () => {
        lastVelocitySampleRef.current = null;
        overspeedStartedAtRef.current = null;
    };

    useEffect(() => {
        return () => {
            resetSpeedRuleTracking();
            if (animationFrameRef.current) {
                window.cancelAnimationFrame(animationFrameRef.current);
            }
            if (handoffTimeoutRef.current) {
                window.clearTimeout(handoffTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        displaySelectionRef.current = displaySelection;
    }, [displaySelection]);

    useEffect(() => {
        if (!isDiscoMode) return;
        setIsDragging(false);
        setDragSelection(null);
        setDragSourceMarkerId(null);
        setHandoffSelection(null);
        setGhostSelection(null);
        pendingMarkerDragRef.current = null;
        const nextSelection = buildSelection(hue, saturation, brightness);
        setDisplaySelection(nextSelection);
        displaySelectionRef.current = nextSelection;
        lastEmittedSelectionRef.current = null;
        resetSpeedRuleTracking();
    }, [brightness, buildSelection, hue, isDiscoMode, lockedSpectrumHue, mode, saturation, visualStyle]);

    // Before paint, so a light coming on never shows its handle where an off light sat, even for a frame.
    useLayoutEffect(() => {
        if (isDragging || isDiscoMode) {
            return;
        }

        const nextSelection = buildSelection(hue, saturation, brightness);
        const currentSelection = displaySelectionRef.current;
        const movementDelta = Math.hypot(
            nextSelection.xPercent - currentSelection.xPercent,
            nextSelection.yPercent - currentSelection.yPercent
        );
        // While the light is off the handle isn't shown, so it follows at once; when it comes on, the handle appears
        // where the light is rather than sliding in from where an off light sits, bottom left (Matt, 2026-10-28).
        const justTurnedOn = isOn && !wasOnRef.current;
        wasOnRef.current = isOn;
        const shouldSnap =
            !isOn ||
            justTurnedOn ||
            (movementDelta < 0.35 && Math.abs(nextSelection.brightness - currentSelection.brightness) < 0.75);

        if (animationFrameRef.current) {
            window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (shouldSnap) {
            setDisplaySelection(nextSelection);
            displaySelectionRef.current = nextSelection;
            return;
        }

        const startSelection = currentSelection;
        const startAt = performance.now();
        const durationMs = 260;
        const interpolateHue = (from: number, to: number, progress: number) => {
            const delta = ((((to - from) % 360) + 540) % 360) - 180;
            return from + delta * progress;
        };

        const tick = (now: number) => {
            const progress = Math.min(1, (now - startAt) / durationMs);
            const easedProgress = 1 - Math.pow(1 - progress, 3);
            const interpolatedSelection: HaloSelection = {
                brightness: startSelection.brightness + (nextSelection.brightness - startSelection.brightness) * easedProgress,
                hue: interpolateHue(startSelection.hue, nextSelection.hue, easedProgress),
                saturation: startSelection.saturation + (nextSelection.saturation - startSelection.saturation) * easedProgress,
                xPercent: startSelection.xPercent + (nextSelection.xPercent - startSelection.xPercent) * easedProgress,
                yPercent: startSelection.yPercent + (nextSelection.yPercent - startSelection.yPercent) * easedProgress,
            };

            setDisplaySelection(interpolatedSelection);
            displaySelectionRef.current = interpolatedSelection;

            if (progress < 1) {
                animationFrameRef.current = window.requestAnimationFrame(tick);
                return;
            }

            animationFrameRef.current = null;
        };

        animationFrameRef.current = window.requestAnimationFrame(tick);

        return () => {
            if (animationFrameRef.current) {
                window.cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
            }
        };
    }, [brightness, buildSelection, hue, isDiscoMode, isDragging, isOn, lockedSpectrumHue, mode, saturation, visualStyle]);

    useEffect(() => {
        latestSelectionRef.current = dragSelection ?? handoffSelection ?? {
            ...displaySelectionRef.current,
        };
    }, [dragSelection, handoffSelection, displaySelection]);

    const triggerPulse = useCallback(
        ({
            xPercent,
            yPercent,
            hue: nextHue,
            saturation: nextSaturation,
            brightness: nextBrightness,
        }: HaloSelection) => {
            pulseIdRef.current += 1;
            const color =
                mode === 'spectrum'
                    ? `hsl(${lockedSpectrumHue ?? nextHue}, 100%, 50%)`
                    : buildTemperatureIndicatorColor(nextHue, nextSaturation, nextBrightness);

            setPulse({
                color,
                id: pulseIdRef.current,
                xPercent,
                yPercent,
            });
        },
        [lockedSpectrumHue, mode]
    );

    useEffect(() => {
        if (isDragging || isDiscoMode) return;

        const activeMarker = markers.find((marker) => marker.isActive);
        const nextActiveMarkerId = activeMarker?.entityId ?? null;
        const previousActiveMarkerId = previousActiveMarkerIdRef.current;
        previousActiveMarkerIdRef.current = nextActiveMarkerId;

        if (!activeMarker || nextActiveMarkerId === previousActiveMarkerId || !activeMarker.isOn) {
            return;
        }

        const nextSelection = {
            brightness: activeMarker.brightness,
            hue: activeMarker.hue,
            saturation: activeMarker.saturation,
            xPercent: xPosFromHueSat(activeMarker.hue, activeMarker.saturation, mode, lockedSpectrumHue, visualStyle),
            yPercent: yPosFromBrightness(activeMarker.brightness, visualStyle),
        };

        setGhostSelection(latestSelectionRef.current);
        setHandoffSelection(nextSelection);
        triggerPulse(nextSelection);

        if (handoffTimeoutRef.current) {
            window.clearTimeout(handoffTimeoutRef.current);
        }

        handoffTimeoutRef.current = window.setTimeout(() => {
            setHandoffSelection(null);
            setGhostSelection(null);
            handoffTimeoutRef.current = null;
        }, 260);
    }, [isDiscoMode, isDragging, lockedSpectrumHue, markers, mode, triggerPulse, visualStyle]);

    const selectionFromClientPosition = useCallback((clientX: number, clientY: number): HaloSelection | null => {
        const hitRect = overlayRef.current?.getBoundingClientRect() ?? trackpadRef.current?.getBoundingClientRect();
        if (!hitRect) return null;
        return selectionFromClientPoint(
            hitRect,
            clientX,
            clientY,
            mode,
            lockedSpectrumHue,
            visualStyle
        );
    }, [lockedSpectrumHue, mode, visualStyle]);

    const selectionFromPosition = useCallback(
        (event: React.PointerEvent) => selectionFromClientPosition(event.clientX, event.clientY),
        [selectionFromClientPosition]
    );

    const hasMeaningfulSelectionDelta = useCallback((nextSelection: HaloSelection) => {
        const previousSelection = lastEmittedSelectionRef.current;
        if (!previousSelection) return true;

        return (
            Math.abs(nextSelection.xPercent - previousSelection.xPercent) >= 1.2 ||
            Math.abs(nextSelection.yPercent - previousSelection.yPercent) >= 1.2 ||
            Math.abs(nextSelection.brightness - previousSelection.brightness) >= 2 ||
            Math.abs(nextSelection.hue - previousSelection.hue) >= 3 ||
            Math.abs(nextSelection.saturation - previousSelection.saturation) >= 3
        );
    }, []);

    const updateFromPosition = (event: React.PointerEvent, force = false) => {
        const selection = selectionFromPosition(event);
        if (!selection) return;

        // The handle follows the finger on every move; only the light commands wait for a meaningful change.
        setDragSelection(selection);
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
        onChange(selection.hue, selection.saturation, selection.brightness);
        return selection;
    };

    const clearTouchGate = () => {
        const gate = touchGateRef.current;
        if (gate?.timer != null) window.clearTimeout(gate.timer);
        touchGateRef.current = null;
    };

    // Wait to see what a finger is doing: onHold runs once it has rested TOUCH_HOLD_MS without moving.
    const armTouchGate = (event: React.PointerEvent, kind: TouchGate['kind'], onHold?: (gate: TouchGate) => void) => {
        clearTouchGate();
        const gate: TouchGate = {
            pointerId: event.pointerId,
            kind,
            startX: event.clientX,
            startY: event.clientY,
            lastX: event.clientX,
            lastY: event.clientY,
            timer: null,
            armed: false,
        };
        if (onHold) {
            gate.timer = window.setTimeout(() => {
                if (touchGateRef.current !== gate) return;
                gate.timer = null;
                gate.armed = true;
                const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
                if (activation?.hasBeenActive) navigator.vibrate?.(8);
                onHold(gate);
            }, TOUCH_HOLD_MS);
        }
        touchGateRef.current = gate;
    };

    const startPadDrag = (pad: HTMLDivElement, pointerId: number, clientX: number, clientY: number) => {
        resetSpeedRuleTracking();
        setIsDragging(true);
        setDragSourceMarkerId(null);
        pendingMarkerDragRef.current = null;
        onInteractionStart?.();
        try {
            pad.setPointerCapture(pointerId);
        } catch {
            // the pointer has already gone
        }
        const selection = updateFromPosition({ clientX, clientY } as React.PointerEvent, true);
        if (selection) {
            triggerPulse(selection);
        }
    };

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (isDiscoMode) {
            setIsDragging(false);
            lastEmittedSelectionRef.current = null;
            resetSpeedRuleTracking();
            onDiscoModeExit?.();
            return;
        }

        const finger = event.pointerType !== 'mouse';
        if (!isOn) {
            // A mouse turns the light on at once; a finger when it lifts without having moved, so a swipe over an off
            // pad doesn't turn it on. Either way it comes back as it was last.
            if (finger) armTouchGate(event, 'off');
            else onToggle();
            return;
        }

        if (finger) {
            const pad = event.currentTarget;
            armTouchGate(event, 'pad', (gate) => startPadDrag(pad, gate.pointerId, gate.lastX, gate.lastY));
            return;
        }

        startPadDrag(event.currentTarget, event.pointerId, event.clientX, event.clientY);
    };

    const handleMarkerPointerDown = (marker: HaloMarker, event: React.PointerEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();

        if (marker.isMuted) {
            return;
        }

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
        const markerSelection = {
            brightness: marker.brightness,
            hue: marker.hue,
            saturation: marker.saturation,
            xPercent: xPosFromHueSat(marker.hue, marker.saturation, mode, lockedSpectrumHue, visualStyle),
            yPercent: yPosFromBrightness(marker.brightness, visualStyle),
        };
        pendingMarkerDragRef.current = {
            pointerId: event.pointerId,
            selection: markerSelection,
            sourceMarkerId: marker.entityId,
            startClientX: event.clientX,
            startClientY: event.clientY,
        };
        // a finger moves a handle only after the same short hold as the pad
        if (event.pointerType !== 'mouse') {
            armTouchGate(event, 'marker', (gate) => {
                try {
                    trackpadRef.current?.setPointerCapture(gate.pointerId);
                } catch {
                    // the pointer has already gone
                }
            });
            return;
        }
        trackpadRef.current?.setPointerCapture(event.pointerId);
    };

    const handleFormationIndicatorPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!formationIndicator) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (isDiscoMode) {
            resetSpeedRuleTracking();
            onDiscoModeExit?.();
            return;
        }

        onFormationIndicatorSelect?.();

        resetSpeedRuleTracking();
        lastEmittedSelectionRef.current = null;
        const formationSelection = {
            brightness: formationIndicator.brightness,
            hue: formationIndicator.hue,
            saturation: formationIndicator.saturation,
            xPercent: xPosFromHueSat(
                formationIndicator.hue,
                formationIndicator.saturation,
                mode,
                lockedSpectrumHue,
                visualStyle
            ),
            yPercent: yPosFromBrightness(formationIndicator.brightness, visualStyle),
        };
        pendingMarkerDragRef.current = {
            pointerId: event.pointerId,
            selection: formationSelection,
            sourceMarkerId: null,
            startClientX: event.clientX,
            startClientY: event.clientY,
        };
        trackpadRef.current?.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const gate = touchGateRef.current;
        if (gate && gate.pointerId === event.pointerId && !gate.armed) {
            gate.lastX = event.clientX;
            gate.lastY = event.clientY;
            // moved before the hold: a swipe, which is the page's
            if (Math.hypot(event.clientX - gate.startX, event.clientY - gate.startY) > TOUCH_SLOP_PX) {
                clearTouchGate();
                pendingMarkerDragRef.current = null;
            }
            return;
        }

        if (!isDragging) {
            const pendingMarkerDrag = pendingMarkerDragRef.current;
            if (
                pendingMarkerDrag &&
                pendingMarkerDrag.pointerId === event.pointerId &&
                isOn &&
                !isDiscoMode
            ) {
                const movementDistance = Math.hypot(
                    event.clientX - pendingMarkerDrag.startClientX,
                    event.clientY - pendingMarkerDrag.startClientY
                );

                if (movementDistance < MARKER_DRAG_THRESHOLD_PX) {
                    return;
                }

                pendingMarkerDragRef.current = null;
                setDragSourceMarkerId(pendingMarkerDrag.sourceMarkerId);
                setDragSelection(pendingMarkerDrag.selection);
                setIsDragging(true);
                onInteractionStart?.();
                updateFromPosition(event, true);
            }
        }

        if (!isDragging || !isOn || isDiscoMode) return;
        updateFromPosition(event);
    };

    const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const gate = touchGateRef.current;
        if (gate && gate.pointerId === event.pointerId) {
            clearTouchGate();
            // a finger lifted from an off pad without moving: turn the light on, as it was last
            if (gate.kind === 'off' && event.type === 'pointerup') onToggle();
        }

        const pendingMarkerDrag = pendingMarkerDragRef.current;
        if (pendingMarkerDrag?.pointerId === event.pointerId) {
            pendingMarkerDragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }
        }

        if (isDragging) {
            const finalSelection = updateFromPosition(event, true);
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                event.currentTarget.releasePointerCapture(event.pointerId);
            }
            onInteractionEnd?.();
            // Stay where the finger let go, instead of going back to where the drag began.
            if (finalSelection) {
                setDisplaySelection(finalSelection);
                displaySelectionRef.current = finalSelection;
            }
        }
        setIsDragging(false);
        setDragSelection(null);
        setDragSourceMarkerId(null);
        setHandoffSelection(null);
        pendingMarkerDragRef.current = null;
        lastEmittedSelectionRef.current = null;
        resetSpeedRuleTracking();
    };

    const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!isOn || isDiscoMode || !onDoubleSelect) return;

        const selection = selectionFromClientPosition(event.clientX, event.clientY);
        if (!selection) return;

        triggerPulse(selection);
        onDoubleSelect(selection.hue, selection.saturation, selection.brightness);
    };

    const padBackground = useMemo(
        () => buildPadBackground(isOn, mode, lockedSpectrumHue, visualStyle),
        [isOn, lockedSpectrumHue, mode, visualStyle]
    );

    const indicatorColor = useMemo(
        () =>
            buildSurfaceNodeColor(
                mode,
                { hue, saturation, brightness },
                lockedSpectrumHue,
                visualStyle
            ),
        [brightness, hue, lockedSpectrumHue, mode, saturation, visualStyle]
    );

    const markerColor = useCallback(
        (marker: HaloMarker) =>
            !marker.isOn
                ? 'rgba(203, 213, 225, 0.42)'
                : buildSurfaceNodeColor(
                      mode,
                      { hue: marker.hue, saturation: marker.saturation, brightness: marker.brightness },
                      lockedSpectrumHue,
                      visualStyle
                  ),
        [lockedSpectrumHue, mode, visualStyle]
    );

    const visibleSelection = useMemo(
        () =>
            dragSelection ?? handoffSelection ?? {
                ...displaySelection,
            },
        [displaySelection, dragSelection, handoffSelection]
    );
    const isBrickStyle = visualStyle === 'pixel';
    const selectedBrickColumn = Math.max(
        0,
        Math.min(PIXEL_GRID_SIZE - 1, Math.floor((visibleSelection.xPercent / 100) * PIXEL_GRID_SIZE))
    );
    const selectedBrickRow = Math.max(
        0,
        Math.min(PIXEL_GRID_SIZE - 1, Math.floor((visibleSelection.yPercent / 100) * PIXEL_GRID_SIZE))
    );
    const formationBrickColumn =
        isBrickStyle && formationIndicator
            ? Math.max(
                  0,
                  Math.min(
                      PIXEL_GRID_SIZE - 1,
                      Math.floor(
                          (xPosFromHueSat(
                              formationIndicator.hue,
                              formationIndicator.saturation,
                              mode,
                              lockedSpectrumHue,
                              visualStyle
                          ) /
                              100) *
                              PIXEL_GRID_SIZE
                      )
                  )
              )
            : null;
    const formationBrickRow =
        isBrickStyle && formationIndicator
            ? Math.max(
                  0,
                  Math.min(
                      PIXEL_GRID_SIZE - 1,
                      Math.floor((yPosFromBrightness(formationIndicator.brightness, visualStyle) / 100) * PIXEL_GRID_SIZE)
                  )
              )
            : null;
    const pixelMarkerLookup = useMemo(
        () =>
            !isBrickStyle
                ? null
                : markers.reduce<Record<string, { color: string; isActive: boolean; isOn: boolean }>>((lookup, marker) => {
                      const markerColumn = Math.max(
                          0,
                          Math.min(
                              PIXEL_GRID_SIZE - 1,
                              Math.floor(
                                  (xPosFromHueSat(marker.hue, marker.saturation, mode, lockedSpectrumHue, visualStyle) / 100) *
                                      PIXEL_GRID_SIZE
                              )
                          )
                      );
                      const markerRow = Math.max(
                          0,
                          Math.min(
                              PIXEL_GRID_SIZE - 1,
                              Math.floor((yPosFromBrightness(marker.brightness, visualStyle) / 100) * PIXEL_GRID_SIZE)
                          )
                      );
                      const key = `${markerRow}-${markerColumn}`;
                      const nextValue = {
                          color: markerColor(marker),
                          isActive: Boolean(marker.isActive),
                          isOn: marker.isOn,
                      };
                      const currentValue = lookup[key];

                      if (!currentValue || nextValue.isActive || (!currentValue.isOn && nextValue.isOn)) {
                          lookup[key] = nextValue;
                      }

                      return lookup;
                  }, {}),
        [isBrickStyle, lockedSpectrumHue, markerColor, markers, mode, visualStyle]
    );

    const pixelCells = useMemo(
        () =>
            !isBrickStyle
                ? null
                : PIXEL_GRID_CELLS.map((cell) => {
                      const xFraction = PIXEL_GRID_SIZE > 1 ? cell.column / (PIXEL_GRID_SIZE - 1) : 0.5;
                      const yFraction = PIXEL_GRID_SIZE > 1 ? cell.row / (PIXEL_GRID_SIZE - 1) : 0.5;
                      const selection = selectionFromFractions(xFraction, yFraction, mode, lockedSpectrumHue);
                      const markerState = pixelMarkerLookup?.[`${cell.row}-${cell.column}`] ?? null;
                      const isLit =
                          (isOn &&
                              cell.row >= selectedBrickRow &&
                              cell.column <= selectedBrickColumn) ||
                          Boolean(markerState?.isOn);
                      const isTopLitCell = isLit && cell.row === selectedBrickRow;
                      const hasMarker = Boolean(markerState);
                      const isActiveMarkerCell = Boolean(markerState?.isActive);
                      const isSelectedBrickCell = cell.row === selectedBrickRow && cell.column === selectedBrickColumn;
                      const isFormationCell = isOn && formationBrickRow === cell.row && formationBrickColumn === cell.column;
                      const isPrimaryBrickCell = isActiveMarkerCell || isSelectedBrickCell;
                      const markerGlowMultiplier = hasMarker ? (isActiveMarkerCell ? 1.15 : 0.3) : 1;
                      const baseLitColor = buildSurfaceNodeColor(
                          mode,
                          { ...selection, brightness: Math.max(70, visibleSelection.brightness) },
                          lockedSpectrumHue,
                          visualStyle
                      );
                      const litColor = hasMarker ? markerState?.color ?? baseLitColor : baseLitColor;
                      const fillOpacity = isPrimaryBrickCell ? 1 : hasMarker ? 1 : 0.3;
                      const fillShadow = isPrimaryBrickCell
                          ? isTopLitCell
                              ? `inset 0 1px 0 rgba(255, 255, 255, ${hasMarker ? 0.84 : 0.72}), inset 0 -1px 0 rgba(15, 23, 42, 0.04), 0 0 ${Math.round(
                                    18 * markerGlowMultiplier
                                )}px ${litColor}, 0 0 ${Math.round(hasMarker ? 38 * markerGlowMultiplier : 30)}px rgba(255, 255, 255, ${
                                    isActiveMarkerCell ? 0.24 : hasMarker ? 0.08 : 0.18
                                })`
                              : `inset 0 1px 0 rgba(255, 255, 255, ${hasMarker ? 0.66 : 0.5}), inset 0 -1px 0 rgba(15, 23, 42, 0.06), 0 0 ${Math.round(
                                    14 * markerGlowMultiplier
                                )}px ${litColor}`
                          : hasMarker
                            ? `inset 0 1px 0 rgba(255, 255, 255, 0.42), inset 0 -1px 0 rgba(15, 23, 42, 0.06), 0 0 12px ${litColor}, 0 0 22px rgba(255, 255, 255, 0.12)`
                            : 'inset 0 1px 0 rgba(255, 255, 255, 0.18), inset 0 -1px 0 rgba(15, 23, 42, 0.06), 0 0 4px rgba(255, 255, 255, 0.04)';
                      return {
                          key: cell.key,
                          selection,
                          color: isLit
                              ? litColor
                              : 'rgba(118, 126, 138, 0.22)',
                          boxShadow: isLit
                              ? fillShadow
                              : 'inset 0 1px 0 rgba(255, 255, 255, 0.14), inset 0 -1px 0 rgba(15, 23, 42, 0.08)',
                          opacity: isLit ? fillOpacity : 1,
                          isLit,
                          isTopLitCell,
                          hasMarker,
                          isActiveMarkerCell,
                          isFormationCell,
                      };
                  }),
        [
            formationBrickColumn,
            formationBrickRow,
            isBrickStyle,
            isOn,
            lockedSpectrumHue,
            mode,
            pixelMarkerLookup,
            selectedBrickColumn,
            selectedBrickRow,
            visibleSelection.brightness,
            visualStyle,
        ]
    );

    return (
        <div className={classNames('halo', { 'is-size-tile': size === 'tile' })}>
            <style>{HALO_CSS}</style>
            <div
                className={classNames('halo__pad-shell', {
                    'is-borderless-style': visualStyle === 'pixel',
                })}
            >
                <div
                    ref={trackpadRef}
                    className={classNames(
                        'halo__pad',
                        `is-style-${visualStyle}`,
                        { 'is-off': !isOn, 'is-disco': isDiscoMode }
                    )}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onDoubleClick={handleDoubleClick}
                    style={{
                        background: padBackground,
                        ['--halo-active-color' as string]: indicatorColor,
                    }}
                >
                    {pixelCells ? (
                        <div className="halo__pixel-surface">
                            {pixelCells.map((cell) => (
                                <button
                                    key={cell.key}
                                    type="button"
                                    className={`halo__pixel-cell-wrap${cell.isLit ? ' is-lit' : ''}${cell.isTopLitCell ? ' is-top-lit' : ''}${cell.isFormationCell ? ' is-formation' : ''}`}
                                    aria-label={
                                        cell.isFormationCell
                                            ? 'Control group relative position'
                                            : `Set light to row ${PIXEL_GRID_SIZE - cell.selection.yPercent / 10}, column ${Math.round(cell.selection.xPercent / 10) + 1}`
                                    }
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        if (isDiscoMode) {
                                            resetSpeedRuleTracking();
                                            onDiscoModeExit?.();
                                            return;
                                        }
                                        if (cell.isFormationCell) {
                                            onFormationIndicatorSelect?.();
                                        }
                                        onInteractionStart?.();
                                        lastEmittedSelectionRef.current = cell.selection;
                                        setDragSelection(cell.selection);
                                        triggerPulse(cell.selection);
                                        onChange(cell.selection.hue, cell.selection.saturation, cell.selection.brightness);
                                        onInteractionEnd?.();
                                        setDragSelection(null);
                                        resetSpeedRuleTracking();
                                    }}
                                    >
                                    <span
                                        className="halo__pixel-cell"
                                        style={{
                                            background: cell.color,
                                            boxShadow: cell.boxShadow,
                                            opacity: cell.opacity,
                                        }}
                                    >
                                        {cell.isFormationCell ? <span className="halo__pixel-cell-center-dot" aria-hidden="true" /> : null}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>
                <div ref={overlayRef} className="halo__overlay">
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
                            <div className="halo__disco-speed-row" role="group" aria-label="Disco speed">
                                {DISCO_SPEED_OPTIONS.map((option) => (
                                    <button
                                        key={option.speedMs}
                                        type="button"
                                        className={`halo__disco-speed-button${
                                            discoSpeedMs === option.speedMs ? ' is-active' : ''
                                        }`}
                                        onClick={() => onDiscoSpeedChange?.(option.speedMs)}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}
                {!isDiscoMode && !isBrickStyle
                    ? markers.map((marker) => (
                          marker.entityId === dragSourceMarkerId || marker.isActive ? null :
                          <button
                              key={marker.entityId}
                              type="button"
                              className={classNames('halo__group-indicator', {
                                  'is-active': marker.isActive,
                                  'is-off': !marker.isOn,
                                  'is-muted': marker.isMuted,
                              })}
                              aria-label={marker.isMuted ? `${marker.entityId} is muted` : `Control ${marker.entityId}`}
                              disabled={marker.isMuted}
                              onPointerDown={(event) => handleMarkerPointerDown(marker, event)}
                                  style={{
                                  left: `${xPosFromHueSat(marker.hue, marker.saturation, mode, lockedSpectrumHue, visualStyle)}%`,
                                  top: `${yPosFromBrightness(marker.brightness, visualStyle)}%`,
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
                {ghostSelection && !isDiscoMode && !isBrickStyle ? (
                    <div
                        className={classNames('halo__indicator-ghost', {
                            'is-group-relative': indicatorVariant === 'group-relative',
                        })}
                        style={{
                            left: `${ghostSelection.xPercent}%`,
                            top: `${ghostSelection.yPercent}%`,
                            background:
                                buildSurfaceNodeColor(
                                    mode,
                                    {
                                        hue: ghostSelection.hue,
                                        saturation: ghostSelection.saturation,
                                        brightness: ghostSelection.brightness,
                                    },
                                    lockedSpectrumHue,
                                    visualStyle
                                ),
                            boxShadow: buildIndicatorShadow(
                                ghostSelection.hue,
                                ghostSelection.saturation,
                                ghostSelection.brightness,
                                mode
                            ),
                        }}
                    />
                ) : null}
                {isOn && formationIndicator && !isDiscoMode && !isBrickStyle ? (
                    <button
                        type="button"
                        className="halo__indicator halo__indicator--formation is-group-relative"
                        aria-label="Control group relative position"
                        onPointerDown={handleFormationIndicatorPointerDown}
                        style={{
                            left: `${xPosFromHueSat(
                                formationIndicator.hue,
                                formationIndicator.saturation,
                                mode,
                                lockedSpectrumHue,
                                visualStyle
                            )}%`,
                            top: `${yPosFromBrightness(formationIndicator.brightness, visualStyle)}%`,
                        }}
                    />
                ) : null}
                {!isOn && restSelection && !isDiscoMode && !isBrickStyle ? (
                    <div
                        className="halo__indicator is-rest"
                        aria-hidden="true"
                        style={{
                            left: `${xPosFromHueSat(restSelection.hue, restSelection.saturation, mode, lockedSpectrumHue, visualStyle)}%`,
                            top: `${yPosFromBrightness(restSelection.brightness, visualStyle)}%`,
                        }}
                    />
                ) : null}
                {isOn && !isDiscoMode && !isBrickStyle ? (
                    <div
                        className={classNames('halo__indicator', {
                            'is-live': !!dragSelection,
                            'is-handoff': !!handoffSelection && !dragSelection,
                            'is-group-relative': indicatorVariant === 'group-relative',
                        })}
                        style={{
                            left: `${visibleSelection.xPercent}%`,
                            top: `${visibleSelection.yPercent}%`,
                            background:
                                buildSurfaceNodeColor(
                                    mode,
                                    {
                                        hue: visibleSelection.hue,
                                        saturation: visibleSelection.saturation,
                                        brightness: visibleSelection.brightness,
                                    },
                                    lockedSpectrumHue,
                                    visualStyle
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
        </div>
    );
}

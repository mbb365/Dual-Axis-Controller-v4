import { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { HALO_CSS } from './halo/halo-css';
import {
    buildIndicatorShadow,
    buildPadBackground,
    buildTemperatureIndicatorColor,
    selectionFromClientPosition as selectionFromClientPoint,
    type HaloSelection,
    xPosFromHueSat,
} from './halo/halo-utils';

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
    onDiscoModeTrigger?: () => void;
    onDiscoModeExit?: () => void;
    onMarkerSelect?: (entityId: string) => void;
    onDoubleSelect?: (hue: number, saturation: number, brightness: number) => void;
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

interface HaloVelocitySample {
    at: number;
    selection: HaloSelection;
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
    onDiscoModeTrigger,
    onDiscoModeExit,
    onMarkerSelect,
    onDoubleSelect,
    onToggle,
    mode,
}: HaloProps) {
    const trackpadRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [pulse, setPulse] = useState<HaloPulse | null>(null);
    const [dragSelection, setDragSelection] = useState<HaloSelection | null>(null);
    const [dragSourceMarkerId, setDragSourceMarkerId] = useState<string | null>(null);
    const [handoffSelection, setHandoffSelection] = useState<HaloSelection | null>(null);
    const [ghostSelection, setGhostSelection] = useState<HaloGhostIndicator | null>(null);
    const pulseIdRef = useRef(0);
    const lastEmittedSelectionRef = useRef<HaloSelection | null>(null);
    const lastVelocitySampleRef = useRef<HaloVelocitySample | null>(null);
    const overspeedStartedAtRef = useRef<number | null>(null);
    const handoffTimeoutRef = useRef<number | null>(null);
    const previousActiveMarkerIdRef = useRef<string | null>(null);
    const latestSelectionRef = useRef<HaloSelection>({
        brightness,
        hue,
        saturation,
        xPercent: xPosFromHueSat(hue, saturation, mode, lockedSpectrumHue),
        yPercent: 100 - brightness,
    });

    const resetSpeedRuleTracking = () => {
        lastVelocitySampleRef.current = null;
        overspeedStartedAtRef.current = null;
    };

    useEffect(() => {
        return () => {
            resetSpeedRuleTracking();
            if (handoffTimeoutRef.current) {
                window.clearTimeout(handoffTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!isDiscoMode) return;
        setIsDragging(false);
        setDragSelection(null);
        setDragSourceMarkerId(null);
        setHandoffSelection(null);
        setGhostSelection(null);
        lastEmittedSelectionRef.current = null;
        resetSpeedRuleTracking();
    }, [isDiscoMode]);

    useEffect(() => {
        latestSelectionRef.current = dragSelection ?? handoffSelection ?? {
            brightness,
            hue,
            saturation,
            xPercent: xPosFromHueSat(hue, saturation, mode, lockedSpectrumHue),
            yPercent: 100 - brightness,
        };
    }, [brightness, dragSelection, handoffSelection, hue, lockedSpectrumHue, mode, saturation]);

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
            xPercent: xPosFromHueSat(activeMarker.hue, activeMarker.saturation, mode, lockedSpectrumHue),
            yPercent: 100 - activeMarker.brightness,
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
    }, [isDiscoMode, isDragging, lockedSpectrumHue, markers, mode]);

    const selectionFromClientPosition = (clientX: number, clientY: number): HaloSelection | null => {
        if (!trackpadRef.current) return null;
        return selectionFromClientPoint(
            trackpadRef.current.getBoundingClientRect(),
            clientX,
            clientY,
            mode,
            lockedSpectrumHue
        );
    };

    const selectionFromPosition = (event: React.PointerEvent) => selectionFromClientPosition(event.clientX, event.clientY);

    const triggerPulse = ({ xPercent, yPercent, hue: nextHue, saturation: nextSaturation, brightness: nextBrightness }: HaloSelection) => {
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
            xPercent: xPosFromHueSat(marker.hue, marker.saturation, mode, lockedSpectrumHue),
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
        setHandoffSelection(null);
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

    const padBackground = buildPadBackground(isOn, mode, lockedSpectrumHue);

    const indicatorColor =
        mode === 'spectrum'
            ? `hsl(${lockedSpectrumHue ?? hue}, 100%, 50%)`
            : buildTemperatureIndicatorColor(hue, saturation, brightness);

    const markerColor = (marker: HaloMarker) =>
        !marker.isOn
            ? 'rgba(203, 213, 225, 0.42)'
            : mode === 'spectrum'
              ? `hsl(${lockedSpectrumHue ?? marker.hue}, 100%, 50%)`
              : buildTemperatureIndicatorColor(marker.hue, marker.saturation, marker.brightness);

    const visibleSelection = dragSelection ?? handoffSelection ?? {
        brightness,
        hue,
        saturation,
        xPercent: xPosFromHueSat(hue, saturation, mode, lockedSpectrumHue),
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
                    onDoubleClick={handleDoubleClick}
                    style={{
                        background: padBackground,
                        ['--halo-active-color' as string]: indicatorColor,
                    }}
                >
                </div>
                <div className="halo__overlay">
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
                          marker.entityId === dragSourceMarkerId || marker.isActive ? null :
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
                                  left: `${xPosFromHueSat(marker.hue, marker.saturation, mode, lockedSpectrumHue)}%`,
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
                {ghostSelection && !isDiscoMode ? (
                    <div
                        className="halo__indicator-ghost"
                        style={{
                            left: `${ghostSelection.xPercent}%`,
                            top: `${ghostSelection.yPercent}%`,
                            background:
                                mode === 'spectrum'
                                    ? `hsl(${lockedSpectrumHue ?? ghostSelection.hue}, 100%, 50%)`
                                    : buildTemperatureIndicatorColor(
                                          ghostSelection.hue,
                                          ghostSelection.saturation,
                                          ghostSelection.brightness
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
                {isOn && !isDiscoMode ? (
                    <div
                        className={classNames('halo__indicator', {
                            'is-live': !!dragSelection,
                            'is-handoff': !!handoffSelection && !dragSelection,
                        })}
                        style={{
                            left: `${visibleSelection.xPercent}%`,
                            top: `${visibleSelection.yPercent}%`,
                            background:
                                mode === 'spectrum'
                                    ? `hsl(${lockedSpectrumHue ?? visibleSelection.hue}, 100%, 50%)`
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
        </div>
    );
}

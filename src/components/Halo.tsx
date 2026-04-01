import { useEffect, useRef, useState } from 'react';
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
const MATRIX_GRID_SIZE = 32;
const MATRIX_GRID_CELLS = Array.from({ length: MATRIX_GRID_SIZE * MATRIX_GRID_SIZE }, (_, index) => ({
    column: index % MATRIX_GRID_SIZE,
    key: index,
    row: Math.floor(index / MATRIX_GRID_SIZE),
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
    onDiscoModeTrigger?: () => void;
    onDiscoModeExit?: () => void;
    onMarkerSelect?: (entityId: string) => void;
    onDoubleSelect?: (hue: number, saturation: number, brightness: number) => void;
    onToggle: () => void;
    mode: 'temperature' | 'spectrum';
    visualStyle?: HaloVisualStyle;
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
    visualStyle = 'plotter',
}: HaloProps) {
    const trackpadRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
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
            xPercent: xPosFromHueSat(hue, saturation, mode, lockedSpectrumHue, visualStyle),
            yPercent: yPosFromBrightness(brightness, visualStyle),
        };
    }, [brightness, dragSelection, handoffSelection, hue, lockedSpectrumHue, mode, saturation, visualStyle]);

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
    }, [isDiscoMode, isDragging, lockedSpectrumHue, markers, mode, visualStyle]);

    const selectionFromClientPosition = (clientX: number, clientY: number): HaloSelection | null => {
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
            xPercent: xPosFromHueSat(marker.hue, marker.saturation, mode, lockedSpectrumHue, visualStyle),
            yPercent: yPosFromBrightness(marker.brightness, visualStyle),
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

    const padBackground = buildPadBackground(isOn, mode, lockedSpectrumHue, visualStyle);

    const indicatorColor = buildSurfaceNodeColor(
        mode,
        { hue, saturation, brightness },
        lockedSpectrumHue,
        visualStyle
    );

    const markerColor = (marker: HaloMarker) =>
        !marker.isOn
            ? 'rgba(203, 213, 225, 0.42)'
            : buildSurfaceNodeColor(
                  mode,
                  { hue: marker.hue, saturation: marker.saturation, brightness: marker.brightness },
                  lockedSpectrumHue,
                  visualStyle
              );

    const visibleSelection = dragSelection ?? handoffSelection ?? {
        brightness,
        hue,
        saturation,
        xPercent: xPosFromHueSat(hue, saturation, mode, lockedSpectrumHue, visualStyle),
        yPercent: yPosFromBrightness(brightness, visualStyle),
    };
    const isBrickStyle = visualStyle === 'pixel';
    const selectedBrickColumn = Math.max(
        0,
        Math.min(PIXEL_GRID_SIZE - 1, Math.floor((visibleSelection.xPercent / 100) * PIXEL_GRID_SIZE))
    );
    const selectedBrickRow = Math.max(
        0,
        Math.min(PIXEL_GRID_SIZE - 1, Math.floor((visibleSelection.yPercent / 100) * PIXEL_GRID_SIZE))
    );
    const pixelMarkerLookup = isBrickStyle
        ? markers.reduce<Record<string, { color: string; isActive: boolean; isOn: boolean }>>((lookup, marker) => {
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
          }, {})
        : null;

    const pixelCells =
        isBrickStyle
            ? PIXEL_GRID_CELLS.map((cell) => {
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
                  };
              })
            : null;

    const matrixCells =
        visualStyle === 'matrix'
            ? MATRIX_GRID_CELLS.map((cell) => {
                  const xFraction = (cell.column + 0.5) / MATRIX_GRID_SIZE;
                  const yFraction = (cell.row + 0.5) / MATRIX_GRID_SIZE;
                  const selection = selectionFromFractions(xFraction, yFraction, mode, lockedSpectrumHue);
                  const cellXPercent = xFraction * 100;
                  const cellYPercent = yFraction * 100;
                  const distance = Math.hypot(
                      cellXPercent - visibleSelection.xPercent,
                      cellYPercent - visibleSelection.yPercent
                  );
                  const glowStrength = Math.max(0, 1 - distance / 24);
                  const glowOpacityBoost = glowStrength * 0.42;
                  const glowBlur = 8 + glowStrength * 14;
                  const glowSpread = glowStrength * 8;
                  return {
                      key: cell.key,
                      color: isOn
                          ? buildSurfaceNodeColor(mode, selection, lockedSpectrumHue, visualStyle)
                          : 'rgba(71, 85, 105, 0.9)',
                      opacity: isOn ? 0.18 + selection.brightness / 140 + glowOpacityBoost : 0.44,
                      scale: isOn ? 0.32 * (1 + glowStrength * 2) : 0.32,
                      boxShadow:
                          isOn && glowStrength > 0.02
                              ? `0 0 ${glowBlur}px rgba(255, 255, 255, ${glowStrength * 0.12}), 0 0 ${glowSpread}px ${buildSurfaceNodeColor(
                                    mode,
                                    selection,
                                    lockedSpectrumHue,
                                    visualStyle
                                )}`
                              : undefined,
                  };
              })
            : null;

    return (
        <div className="halo">
            <style>{HALO_CSS}</style>
            <div
                className={classNames('halo__pad-shell', {
                    'is-borderless-style': visualStyle === 'matrix' || visualStyle === 'pixel',
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
                                    className={`halo__pixel-cell-wrap${cell.isLit ? ' is-lit' : ''}${cell.isTopLitCell ? ' is-top-lit' : ''}`}
                                    aria-label={`Set light to row ${PIXEL_GRID_SIZE - cell.selection.yPercent / 10}, column ${Math.round(cell.selection.xPercent / 10) + 1}`}
                                    onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        if (isDiscoMode) {
                                            resetSpeedRuleTracking();
                                            onDiscoModeExit?.();
                                            return;
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
                                    />
                                </button>
                            ))}
                        </div>
                    ) : null}
                    {matrixCells ? (
                        <div className="halo__matrix-surface" aria-hidden="true">
                            {matrixCells.map((cell) => (
                                <span key={cell.key} className="halo__matrix-node-wrap">
                                    <span
                                        className="halo__matrix-node"
                                        style={{
                                            background: cell.color,
                                            opacity: cell.opacity,
                                            transform: `scale(${cell.scale})`,
                                            boxShadow: cell.boxShadow,
                                        }}
                                    />
                                </span>
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
                              })}
                              aria-label={`Control ${marker.entityId}`}
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
                        className="halo__indicator-ghost"
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
                {isOn && !isDiscoMode && !isBrickStyle ? (
                    <div
                        className={classNames('halo__indicator', {
                            'is-live': !!dragSelection,
                            'is-handoff': !!handoffSelection && !dragSelection,
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

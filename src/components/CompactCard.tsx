import { useEffect, useRef, useState } from 'react';
import compactCardStyles from './CompactCard.css?inline';
import { Halo, type HaloMarker } from './Halo';

export type CardLayout = 'compact' | 'expanded';

export interface SceneOption {
    entityId: string;
    name: string;
}

export interface GroupedLightOption {
    entityId: string;
    isOn: boolean;
    name: string;
    value: string;
    previewBrightness: number;
    previewHue: number;
    previewMode: 'temperature' | 'spectrum';
    previewSaturation: number;
}

interface CompactCardProps {
    layout: CardLayout;
    lightName: string;
    icon: string;
    isOn: boolean;
    hue: number;
    saturation: number;
    brightness: number;
    kelvin: number | null;
    uiMode: 'temperature' | 'spectrum';
    canUseTemperature: boolean;
    canUseSpectrum: boolean;
    onModeChange: (mode: 'temperature' | 'spectrum') => void;
    onControlsChange: (h: number, s: number, b: number) => void;
    onControlInteractionStart?: () => void;
    onControlInteractionEnd?: () => void;
    isDiscoMode?: boolean;
    onDiscoModeTrigger?: () => void;
    onDiscoModeExit?: () => void;
    onPadMarkerSelect?: (entityId: string) => void;
    onToggle: () => void;
    sceneOptions?: SceneOption[];
    selectedSceneName?: string | null;
    sceneFeedbackMessage?: string | null;
    groupedLights?: GroupedLightOption[];
    groupedLightMarkers?: HaloMarker[];
    controlScope?: 'group' | 'group-relative' | 'individual';
    controlledLightEntityId?: string | null;
    onControlScopeChange?: (scope: 'group' | 'group-relative') => void;
    onGroupedLightSelect?: (entityId: string) => void;
    onGroupedLightToggle?: (entityId: string) => void;
    onSceneSelect?: (sceneEntityId: string) => void;
    onTapAction?: () => void;
    onHoldAction?: () => void;
    onDoubleTapAction?: () => void;
}

function formatStatus(isOn: boolean, brightness: number, kelvin: number | null, uiMode: 'temperature' | 'spectrum') {
    if (!isOn) return 'Off';

    const brightnessText = `${Math.round(brightness)}%`;
    if (uiMode === 'temperature' && kelvin) {
        return `${brightnessText} at ${kelvin.toLocaleString()}K`;
    }

    return `${brightnessText} at color`;
}

function getRgbText(hue: number, saturation: number, brightness: number) {
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

function buildCompactBackground(
    isOn: boolean,
    hue: number,
    saturation: number,
    brightness: number,
    uiMode: 'temperature' | 'spectrum'
) {
    if (!isOn) {
        return 'linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)';
    }

    const intensity = Math.max(0, Math.min(1, brightness / 100));

    if (uiMode === 'temperature') {
        const normalizedSaturation = Math.max(0, Math.min(1, saturation / 100));
        const isWarm = isWarmTemperatureHue(hue) && normalizedSaturation >= 0.08;
        const whiteLift = `rgba(255, 255, 255, ${0.82 - intensity * 0.1})`;
        const baseTone = isWarm ? 'hsla(34, 100%, 98%, 1)' : 'hsla(205, 100%, 98%, 1)';
        const midTone = buildReflectionColor(true, hue, saturation, brightness, uiMode, isWarm ? 0.2 : 0.16);
        const edgeTone = buildReflectionColor(true, hue, saturation, brightness, uiMode, isWarm ? 0.52 : 0.42);
        return `radial-gradient(circle at 18% 24%, ${whiteLift} 0%, rgba(255, 255, 255, 0.16) 24%, transparent 54%), linear-gradient(135deg, ${baseTone} 0%, ${midTone} 40%, ${edgeTone} 100%)`;
    }

    const startTone = `hsla(${hue}, ${Math.max(24, saturation * 0.28)}%, ${98 - intensity * 1.4}%, 1)`;
    const midTone = buildReflectionColor(true, hue, saturation, brightness, uiMode, 0.16);
    const endTone = buildReflectionColor(true, hue, saturation, brightness, uiMode, 0.5);
    const whiteLift = `rgba(255, 255, 255, ${0.76 - intensity * 0.08})`;
    return `radial-gradient(circle at 20% 24%, ${whiteLift} 0%, rgba(255, 255, 255, 0.12) 22%, transparent 50%), linear-gradient(135deg, ${startTone} 0%, ${midTone} 42%, ${endTone} 100%)`;
}

function buildGroupedCompactBackground(groupedLights: GroupedLightOption[]) {
    const activeLights = groupedLights
        .filter((light) => light.isOn && light.previewBrightness > 0)
        .sort((left, right) => right.previewBrightness - left.previewBrightness)
        .slice(0, 4);

    if (activeLights.length < 2) {
        return null;
    }

    const anchorSets =
        activeLights.length === 2
            ? [
                  { x: 18, y: 42 },
                  { x: 82, y: 54 },
              ]
            : activeLights.length === 3
              ? [
                    { x: 18, y: 24 },
                    { x: 82, y: 26 },
                    { x: 46, y: 76 },
                ]
              : [
                    { x: 16, y: 24 },
                    { x: 82, y: 22 },
                    { x: 34, y: 78 },
                    { x: 78, y: 72 },
                ];

    const colorLayers = activeLights.map((light, index) => {
        const brightnessRatio = Math.max(0, Math.min(1, light.previewBrightness / 100));
        const coreAlpha = 0.16 + brightnessRatio * 0.18;
        const midAlpha = 0.08 + brightnessRatio * 0.1;
        const radius = 46 + brightnessRatio * 16;
        const anchor = anchorSets[index] ?? anchorSets[anchorSets.length - 1];

        return `radial-gradient(circle at ${anchor.x}% ${anchor.y}%, ${buildReflectionColor(
            true,
            light.previewHue,
            light.previewSaturation,
            light.previewBrightness,
            light.previewMode,
            coreAlpha
        )} 0%, ${buildReflectionColor(
            true,
            light.previewHue,
            light.previewSaturation,
            light.previewBrightness,
            light.previewMode,
            midAlpha
        )} ${Math.round(radius * 0.46)}%, transparent ${Math.round(radius)}%)`;
    });

    return `radial-gradient(circle at 20% 22%, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.14) 24%, transparent 52%), ${colorLayers.join(
        ', '
    )}, linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(249, 251, 254, 0.9) 48%, rgba(242, 246, 251, 0.96) 100%)`;
}

function buildIconBackground(
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

function buildIconForeground(
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

export function CompactCard({
    layout,
    lightName,
    icon: _icon,
    isOn,
    hue,
    saturation,
    brightness,
    kelvin,
    uiMode,
    canUseTemperature,
    canUseSpectrum,
    onModeChange,
    onControlsChange,
    onControlInteractionStart,
    onControlInteractionEnd,
    isDiscoMode,
    onDiscoModeTrigger,
    onDiscoModeExit,
    onPadMarkerSelect,
    onToggle,
    sceneOptions = [],
    selectedSceneName,
    sceneFeedbackMessage,
    groupedLights = [],
    groupedLightMarkers = [],
    controlScope = 'group',
    controlledLightEntityId,
    onControlScopeChange,
    onGroupedLightSelect,
    onGroupedLightToggle,
    onSceneSelect,
    onTapAction,
    onHoldAction,
    onDoubleTapAction,
}: CompactCardProps) {
    const holdTimer = useRef<number | null>(null);
    const tapTimer = useRef<number | null>(null);
    const holdTriggered = useRef(false);
    const sceneDropdownRef = useRef<HTMLDivElement>(null);
    const [isSceneMenuOpen, setIsSceneMenuOpen] = useState(false);

    useEffect(() => {
        return () => {
            if (holdTimer.current) window.clearTimeout(holdTimer.current);
            if (tapTimer.current) window.clearTimeout(tapTimer.current);
        };
    }, []);

    useEffect(() => {
        if (!isSceneMenuOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!sceneDropdownRef.current?.contains(event.target as Node)) {
                setIsSceneMenuOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsSceneMenuOpen(false);
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isSceneMenuOpen]);

    const leadingValue =
        uiMode === 'temperature' && kelvin ? `${kelvin.toLocaleString()}K` : getRgbText(hue, saturation, brightness);
    const statusText =
        uiMode === 'temperature'
            ? formatStatus(isOn, brightness, kelvin, uiMode)
            : isOn
              ? `${Math.round(brightness)}% at ${leadingValue}`
              : 'Off';
    const compactBackground =
        buildGroupedCompactBackground(groupedLights) ?? buildCompactBackground(isOn, hue, saturation, brightness, uiMode);

    const clearHold = () => {
        if (holdTimer.current) {
            window.clearTimeout(holdTimer.current);
            holdTimer.current = null;
        }
    };

    const handlePointerDown = () => {
        if (layout !== 'compact' || !onHoldAction) return;

        holdTriggered.current = false;
        clearHold();
        holdTimer.current = window.setTimeout(() => {
            holdTriggered.current = true;
            onHoldAction();
        }, 500);
    };

    const handlePointerEnd = () => {
        clearHold();
    };

    const handleClick = () => {
        if (layout !== 'compact' || !onTapAction) return;
        if (holdTriggered.current) {
            holdTriggered.current = false;
            return;
        }

        if (onDoubleTapAction) {
            if (tapTimer.current) {
                window.clearTimeout(tapTimer.current);
                tapTimer.current = null;
                onDoubleTapAction();
                return;
            }

            tapTimer.current = window.setTimeout(() => {
                tapTimer.current = null;
                onTapAction();
            }, 250);
            return;
        }

        onTapAction();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (layout !== 'compact' || !onTapAction) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onTapAction();
    };

    const handleIconPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        clearHold();
    };

    const handleIconClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onToggle();
    };

    const handleSceneTriggerPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
    };

    const handleSceneTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setIsSceneMenuOpen((current) => !current);
    };

    if (layout === 'compact') {
        return (
            <div
                className="dual-card dual-card--compact"
                role={onTapAction ? 'button' : undefined}
                tabIndex={onTapAction ? 0 : -1}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerEnd}
                onPointerLeave={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                style={{
                    background: compactBackground,
                    color: 'var(--primary-text-color, #111827)',
                }}
            >
                <style>{compactCardStyles}</style>
                <button
                    type="button"
                    className="dual-card__icon-shell dual-card__icon-button"
                    aria-label={`${isOn ? 'Turn off' : 'Turn on'} ${lightName}`}
                    aria-pressed={isOn}
                    onPointerDown={handleIconPointerDown}
                    onPointerUp={(event) => event.stopPropagation()}
                    onClick={handleIconClick}
                    style={{
                        background: buildIconBackground(isOn, hue, saturation, brightness, uiMode),
                        color: buildIconForeground(isOn, saturation, brightness, uiMode),
                    }}
                >
                    <ha-icon icon="mdi:power" className="dual-card__icon" />
                </button>
                <div className="dual-card__content">
                    <div className="dual-card__title">{lightName}</div>
                    <div className="dual-card__subtitle">{statusText}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="dual-card dual-card--expanded">
            <style>{compactCardStyles}</style>
            <div className="dual-card__expanded-title">{lightName}</div>

            <div className="dual-card__expanded-header">
                <div className="dual-card__meta">
                    <div className="dual-card__meta-value">{leadingValue}</div>
                </div>
                <div className="dual-card__meta dual-card__meta--right">
                    <div className="dual-card__meta-value">{Math.round(brightness)}%</div>
                </div>
            </div>

            <Halo
                hue={hue}
                saturation={saturation}
                brightness={brightness}
                isOn={isOn}
                markers={groupedLightMarkers}
                onChange={onControlsChange}
                onInteractionStart={onControlInteractionStart}
                onInteractionEnd={onControlInteractionEnd}
                isDiscoMode={isDiscoMode}
                onDiscoModeTrigger={onDiscoModeTrigger}
                onDiscoModeExit={onDiscoModeExit}
                onMarkerSelect={onPadMarkerSelect}
                onToggle={onToggle}
                mode={uiMode}
            />

            <div className="dual-card__mode-row">
                <button
                    type="button"
                    className={`dual-card__mode-pill ${uiMode === 'spectrum' ? 'is-active' : ''}`}
                    disabled={!canUseSpectrum}
                    onClick={() => onModeChange('spectrum')}
                >
                    Spectrum
                </button>
                <button
                    type="button"
                    className={`dual-card__power-pill ${isOn ? 'is-active' : ''}`}
                    aria-label={`${isOn ? 'Turn off' : 'Turn on'} ${lightName}`}
                    aria-pressed={isOn}
                    onClick={onToggle}
                >
                    <ha-icon icon="mdi:power" className="dual-card__power-icon" />
                </button>
                <button
                    type="button"
                    className={`dual-card__mode-pill ${uiMode === 'temperature' ? 'is-active' : ''}`}
                    disabled={!canUseTemperature}
                    onClick={() => onModeChange('temperature')}
                >
                    Temperature
                </button>
            </div>

            <div className="dual-card__scene-picker" ref={sceneDropdownRef}>
                <button
                    type="button"
                    className={`dual-card__scene-trigger ${isSceneMenuOpen ? 'is-open' : ''}`}
                    disabled={!sceneOptions.length}
                    aria-expanded={isSceneMenuOpen}
                    onPointerDown={handleSceneTriggerPointerDown}
                    onClick={handleSceneTriggerClick}
                >
                    <span>{sceneOptions.length ? (selectedSceneName ?? 'Scenes') : 'No scenes available'}</span>
                    <ha-icon icon={isSceneMenuOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'} className="dual-card__scene-icon" />
                </button>

                {isSceneMenuOpen && sceneOptions.length ? (
                    <div className="dual-card__scene-menu">
                        {sceneOptions.map((scene) => (
                            <button
                                key={scene.entityId}
                                type="button"
                                className="dual-card__scene-option"
                                onClick={() => {
                                    setIsSceneMenuOpen(false);
                                    onSceneSelect?.(scene.entityId);
                                }}
                            >
                                {scene.name}
                            </button>
                        ))}
                    </div>
                ) : null}

                {sceneFeedbackMessage ? (
                    <div className="dual-card__scene-feedback" role="status">
                        {sceneFeedbackMessage}
                    </div>
                ) : null}
            </div>

            {groupedLights.length ? (
                <div className="dual-card__group-section">
                    <div className="dual-card__scope-row" role="tablist" aria-label="Control scope">
                        <button
                            type="button"
                            className={`dual-card__scope-pill ${controlScope === 'group' ? 'is-active' : ''}`}
                            onClick={() => onControlScopeChange?.('group')}
                        >
                            Group
                        </button>
                        <button
                            type="button"
                            className={`dual-card__scope-pill ${controlScope === 'group-relative' ? 'is-active' : ''}`}
                            onClick={() => onControlScopeChange?.('group-relative')}
                        >
                            Group Relative
                        </button>
                    </div>

                    <div className="dual-card__group-list">
                        {groupedLights.map((groupedLight) => (
                            <div
                                key={groupedLight.entityId}
                                className={`dual-card__group-item ${
                                    controlScope === 'individual' && controlledLightEntityId === groupedLight.entityId ? 'is-active' : ''
                                }`}
                            >
                                <button
                                    type="button"
                                    className="dual-card__group-toggle"
                                    aria-label={`${groupedLight.isOn ? 'Turn off' : 'Turn on'} ${groupedLight.name}`}
                                    aria-pressed={groupedLight.isOn}
                                    onClick={() => onGroupedLightToggle?.(groupedLight.entityId)}
                                    style={{
                                        background: buildIconBackground(
                                            groupedLight.isOn,
                                            groupedLight.previewHue,
                                            groupedLight.previewSaturation,
                                            groupedLight.previewBrightness,
                                            groupedLight.previewMode
                                        ),
                                        color: buildIconForeground(
                                            groupedLight.isOn,
                                            groupedLight.previewSaturation,
                                            groupedLight.previewBrightness,
                                            groupedLight.previewMode
                                        ),
                                    }}
                                >
                                    <ha-icon icon="mdi:power" className="dual-card__group-toggle-icon" />
                                </button>
                                <button
                                    type="button"
                                    className="dual-card__group-main"
                                    onClick={() => onGroupedLightSelect?.(groupedLight.entityId)}
                                >
                                    <span className="dual-card__group-meta">
                                        <span className="dual-card__group-name">{groupedLight.name}</span>
                                        <span className="dual-card__group-value">{groupedLight.value}</span>
                                    </span>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

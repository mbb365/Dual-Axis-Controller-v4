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
    isDarkMode?: boolean;
    lightName: string;
    expandedPrimaryName?: string;
    expandedSecondaryName?: string | null;
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
    onPadDoubleSelect?: (h: number, s: number, b: number) => void;
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

function buildGroupedCompactBackground(groupedLights: GroupedLightOption[]) {
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
    isDarkMode = false,
    lightName,
    expandedPrimaryName,
    expandedSecondaryName,
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
    onPadDoubleSelect,
    onToggle,
    groupedLights = [],
    groupedLightMarkers = [],
    controlScope = 'group',
    controlledLightEntityId,
    onControlScopeChange,
    onGroupedLightSelect,
    onGroupedLightToggle,
    onTapAction,
    onHoldAction,
    onDoubleTapAction,
}: CompactCardProps) {
    const holdTimer = useRef<number | null>(null);
    const tapTimer = useRef<number | null>(null);
    const holdTriggered = useRef(false);
    const [isGroupListOpen, setIsGroupListOpen] = useState(false);

    useEffect(() => {
        return () => {
            if (holdTimer.current) window.clearTimeout(holdTimer.current);
            if (tapTimer.current) window.clearTimeout(tapTimer.current);
        };
    }, []);

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
    const displayExpandedPrimaryName = expandedPrimaryName ?? lightName;
    const displayExpandedSecondaryName =
        expandedSecondaryName && expandedSecondaryName !== displayExpandedPrimaryName ? expandedSecondaryName : null;

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

    if (layout === 'compact') {
        return (
            <div
                className={`dual-card dual-card--compact${isDarkMode ? ' dual-card--theme-dark' : ''}`}
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
        <div className={`dual-card dual-card--expanded${isDarkMode ? ' dual-card--theme-dark' : ''}`}>
            <style>{compactCardStyles}</style>
            <div className="dual-card__expanded-title-row">
                <div className="dual-card__expanded-title">{displayExpandedPrimaryName}</div>
                {displayExpandedSecondaryName ? (
                    <div className="dual-card__expanded-title dual-card__expanded-title--secondary">
                        {displayExpandedSecondaryName}
                    </div>
                ) : null}
            </div>

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
                onDoubleSelect={onPadDoubleSelect}
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

            <div className="dual-card__scene-picker">
                <div
                    className="dual-card__scene-trigger dual-card__scene-trigger--coming-soon"
                    aria-disabled="true"
                >
                    <span className="dual-card__scene-placeholder">Scene selection (coming soon)</span>
                </div>
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

                    <button
                        type="button"
                        className={`dual-card__group-mobile-trigger ${isGroupListOpen ? 'is-open' : ''}`}
                        aria-expanded={isGroupListOpen}
                        onClick={() => setIsGroupListOpen((current) => !current)}
                    >
                        <span>Select lights</span>
                        <ha-icon icon={isGroupListOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
                    </button>

                    <div className={`dual-card__group-list ${isGroupListOpen ? 'is-mobile-open' : ''}`}>
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
                                    onClick={() => {
                                        onGroupedLightSelect?.(groupedLight.entityId);
                                        setIsGroupListOpen(false);
                                    }}
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

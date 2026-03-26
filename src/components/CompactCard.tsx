import { useEffect, useRef, useState } from 'react';
import compactCardStyles from './CompactCard.css?inline';
import { Halo } from './Halo';

export type CardLayout = 'compact' | 'expanded';

export interface SceneOption {
    entityId: string;
    name: string;
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
    onToggle: () => void;
    sceneOptions?: SceneOption[];
    selectedSceneName?: string | null;
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

function buildCompactBackground(
    isOn: boolean,
    hue: number,
    saturation: number,
    brightness: number,
    uiMode: 'temperature' | 'spectrum'
) {
    if (!isOn) {
        return 'linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(244, 246, 248, 0.8) 42%, rgba(231, 234, 239, 0.62) 72%, rgba(231, 234, 239, 0.2) 100%)';
    }

    const intensity = Math.max(0, Math.min(1, brightness / 100));

    if (uiMode === 'temperature') {
        const normalizedSaturation = Math.max(0, Math.min(1, saturation / 100));
        const whiteFocus = `hsla(0, 0%, ${98 - intensity * 1.5}%, ${0.52 - normalizedSaturation * 0.14})`;
        const softGrey = `hsla(220, 14%, ${91 - intensity * 6}%, ${0.26 + (1 - normalizedSaturation) * 0.14})`;
        const coolOrWarmTint = `hsla(${hue}, ${10 + normalizedSaturation * 34}%, ${84 - intensity * 12}%, ${
            0.12 + normalizedSaturation * 0.18
        })`;
        const shadowGrey = `hsla(222, 16%, ${83 - intensity * 10}%, ${0.14 + (1 - normalizedSaturation) * 0.12})`;

        return `radial-gradient(circle at 18% 28%, ${whiteFocus} 0%, ${whiteFocus} 16%, transparent 44%), linear-gradient(135deg, ${softGrey} 0%, ${coolOrWarmTint} 48%, ${shadowGrey} 76%, transparent 100%)`;
    }

    const tintSaturation = Math.max(18, uiMode === 'spectrum' ? saturation : saturation * 0.72 + 18);
    const softTint = `hsla(${hue}, ${Math.max(12, tintSaturation * 0.42)}%, ${98 - intensity * 4}%, ${
        0.12 + intensity * 0.12
    })`;
    const midTint = `hsla(${hue}, ${Math.max(18, tintSaturation * 0.7)}%, ${94 - intensity * 10}%, ${
        0.18 + intensity * 0.14
    })`;
    const richTint = `hsla(${hue}, ${Math.max(24, tintSaturation)}%, ${86 - intensity * 18}%, ${
        0.18 + intensity * 0.22
    })`;
    const tintReach = 34 + intensity * 22;

    return `radial-gradient(circle at 16% 26%, ${softTint} 0%, ${softTint} 14%, transparent 42%), linear-gradient(135deg, ${midTint} 0%, ${richTint} ${tintReach}%, transparent 100%)`;
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

    if (uiMode === 'temperature') {
        const normalizedSaturation = Math.max(0, Math.min(1, saturation / 100));
        const normalizedBrightness = Math.max(0, Math.min(1, brightness / 100));
        const lightness = 80 + (1 - normalizedSaturation) * 15 + normalizedBrightness * 3;
        const colorSaturation = normalizedSaturation < 0.12 ? 2 : 10 + normalizedSaturation * 52;

        return `hsla(${hue}, ${colorSaturation}%, ${Math.min(97, lightness)}%, 0.96)`;
    }

    const intensity = Math.max(0, Math.min(1, brightness / 100));
    const iconSaturation = Math.max(42, uiMode === 'spectrum' ? saturation * 1.08 : saturation * 0.9 + 24);

    return `hsla(${hue}, ${iconSaturation}%, ${52 + intensity * 12}%, 0.94)`;
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
    onToggle,
    sceneOptions = [],
    selectedSceneName,
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
                    background: buildCompactBackground(isOn, hue, saturation, brightness, uiMode),
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
                onChange={onControlsChange}
                onInteractionStart={onControlInteractionStart}
                onInteractionEnd={onControlInteractionEnd}
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
                    onClick={() => setIsSceneMenuOpen((current) => !current)}
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
            </div>
        </div>
    );
}

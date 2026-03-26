import { useEffect, useRef } from 'react';
import compactCardStyles from './CompactCard.css?inline';
import { Halo } from './Halo';

export type CardLayout = 'compact' | 'expanded';

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
    onToggle: () => void;
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

function buildCompactBackground(isOn: boolean, hue: number, saturation: number, uiMode: 'temperature' | 'spectrum') {
    if (!isOn) {
        return 'linear-gradient(120deg, rgba(248, 248, 248, 0.98) 0%, rgba(235, 237, 240, 0.98) 100%)';
    }

    if (uiMode === 'spectrum') {
        const vividHue = `hsla(${hue}, ${Math.max(45, saturation)}%, 72%, 0.95)`;
        const softHue = `hsla(${hue}, ${Math.max(20, saturation * 0.6)}%, 96%, 0.98)`;
        return `linear-gradient(120deg, ${softHue} 0%, ${vividHue} 100%)`;
    }

    const cool = 'rgba(224, 241, 255, 0.98)';
    const center = 'rgba(255, 249, 234, 0.98)';
    const warm = 'rgba(246, 196, 82, 0.96)';
    return `linear-gradient(120deg, ${cool} 0%, ${center} 34%, ${warm} 100%)`;
}

function buildIconBackground(isOn: boolean, hue: number, saturation: number, uiMode: 'temperature' | 'spectrum') {
    if (!isOn) {
        return 'rgba(140, 149, 159, 0.18)';
    }

    if (uiMode === 'spectrum') {
        return `hsla(${hue}, ${Math.max(55, saturation)}%, 58%, 0.95)`;
    }

    return 'rgba(246, 196, 82, 0.98)';
}

export function CompactCard({
    layout,
    lightName,
    icon,
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
    onToggle,
    onTapAction,
    onHoldAction,
    onDoubleTapAction,
}: CompactCardProps) {
    const holdTimer = useRef<number | null>(null);
    const tapTimer = useRef<number | null>(null);
    const holdTriggered = useRef(false);

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
                    background: buildCompactBackground(isOn, hue, saturation, uiMode),
                    color: 'var(--primary-text-color, #111827)',
                }}
            >
                <style>{compactCardStyles}</style>
                <div
                    className="dual-card__icon-shell"
                    style={{
                        background: buildIconBackground(isOn, hue, saturation, uiMode),
                    }}
                >
                    <ha-icon icon={icon} className="dual-card__icon" />
                </div>
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
                    className={`dual-card__mode-pill ${uiMode === 'temperature' ? 'is-active' : ''}`}
                    disabled={!canUseTemperature}
                    onClick={() => onModeChange('temperature')}
                >
                    Temperature
                </button>
            </div>
        </div>
    );
}

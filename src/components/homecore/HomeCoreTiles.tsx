import { useEffect, useRef, useState } from 'react';
import { Halo } from '../Halo';
import { HcGlyph } from './icons';

const BAR_KEY_STEP = 5;
const BAR_SETTLE_MS = 1500;
const HOLD_MS = 500;
const DOUBLE_TAP_MS = 250;

interface TileHeadProps {
    name: string;
    icon: string;
    isOn: boolean;
    valueText: string;
    onToggle: () => void;
    onOpen: () => void;
    onHold?: () => void;
    onDoubleTap?: () => void;
}

/** Tap opens; hold and double tap run the card's hold_action and double_tap_action when they are set. */
function useTapActions(onTap: () => void, onHold?: () => void, onDoubleTap?: () => void) {
    const holdTimer = useRef<number | null>(null);
    const tapTimer = useRef<number | null>(null);
    const holdTriggered = useRef(false);

    useEffect(
        () => () => {
            if (holdTimer.current) window.clearTimeout(holdTimer.current);
            if (tapTimer.current) window.clearTimeout(tapTimer.current);
        },
        []
    );

    const clearHold = () => {
        if (holdTimer.current) {
            window.clearTimeout(holdTimer.current);
            holdTimer.current = null;
        }
    };

    return {
        onPointerDown: () => {
            if (!onHold) return;
            holdTriggered.current = false;
            clearHold();
            holdTimer.current = window.setTimeout(() => {
                holdTriggered.current = true;
                onHold();
            }, HOLD_MS);
        },
        onPointerUp: clearHold,
        onPointerLeave: clearHold,
        onPointerCancel: clearHold,
        onClick: () => {
            if (holdTriggered.current) {
                holdTriggered.current = false;
                return;
            }
            if (!onDoubleTap) {
                onTap();
                return;
            }
            if (tapTimer.current) {
                window.clearTimeout(tapTimer.current);
                tapTimer.current = null;
                onDoubleTap();
                return;
            }
            tapTimer.current = window.setTimeout(() => {
                tapTimer.current = null;
                onTap();
            }, DOUBLE_TAP_MS);
        },
    };
}

function TileChip({ name, icon, isOn, onToggle }: Pick<TileHeadProps, 'name' | 'icon' | 'isOn' | 'onToggle'>) {
    return (
        <button
            type="button"
            className={`hcChip${isOn ? ' is-on' : ''}`}
            aria-label={`${isOn ? 'Turn off' : 'Turn on'} ${name}`}
            aria-pressed={isOn}
            onClick={onToggle}
        >
            <HcGlyph icon={icon} />
        </button>
    );
}

function TileName({
    name,
    valueText,
    onOpen,
    onHold,
    onDoubleTap,
}: Pick<TileHeadProps, 'name' | 'valueText' | 'onOpen' | 'onHold' | 'onDoubleTap'>) {
    const tapActions = useTapActions(onOpen, onHold, onDoubleTap);
    return (
        <button type="button" className="hcName" aria-haspopup="dialog" {...tapActions}>
            <span className="hcTitle">{name}</span>
            <span className="hcValue">{valueText}</span>
        </button>
    );
}

interface BrightnessBarProps {
    name: string;
    brightness: number;
    onChange: (brightness: number) => void;
    onCommit: () => void;
}

function BrightnessBar({ name, brightness, onChange, onCommit }: BrightnessBarProps) {
    const barRef = useRef<HTMLDivElement>(null);
    const pointerId = useRef<number | null>(null);
    const [dragValue, setDragValue] = useState<number | null>(null);
    // Holds the value just sent until Home Assistant reports it back (or a moment passes), so the bar doesn't jump.
    const [settleValue, setSettleValue] = useState<number | null>(null);
    const settleTimer = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (settleTimer.current) window.clearTimeout(settleTimer.current);
        },
        []
    );

    const isSettling = settleValue != null && Math.abs(brightness - settleValue) > 1;
    const shown = Math.round(dragValue ?? (isSettling ? settleValue : brightness));

    const valueFromPointer = (clientX: number) => {
        const rect = barRef.current?.getBoundingClientRect();
        if (!rect || !rect.width) return shown;
        return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 100);
    };

    const send = (value: number) => {
        setDragValue(value);
        onChange(value);
    };

    const finish = (value: number) => {
        setDragValue(null);
        setSettleValue(value);
        if (settleTimer.current) window.clearTimeout(settleTimer.current);
        settleTimer.current = window.setTimeout(() => setSettleValue(null), BAR_SETTLE_MS);
        onCommit();
    };

    return (
        <div
            ref={barRef}
            className="hcBar"
            role="slider"
            tabIndex={0}
            aria-label={`${name} brightness`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={shown}
            aria-valuetext={`${shown}%`}
            onPointerDown={(event) => {
                pointerId.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                send(valueFromPointer(event.clientX));
            }}
            onPointerMove={(event) => {
                if (pointerId.current !== event.pointerId) return;
                send(valueFromPointer(event.clientX));
            }}
            onPointerUp={(event) => {
                if (pointerId.current !== event.pointerId) return;
                pointerId.current = null;
                finish(valueFromPointer(event.clientX));
            }}
            onPointerCancel={() => {
                pointerId.current = null;
                if (dragValue != null) finish(dragValue);
            }}
            onKeyDown={(event) => {
                const step =
                    event.key === 'ArrowRight' || event.key === 'ArrowUp'
                        ? BAR_KEY_STEP
                        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                          ? -BAR_KEY_STEP
                          : 0;
                if (!step) return;
                event.preventDefault();
                const next = Math.max(0, Math.min(100, shown + step));
                onChange(next);
                finish(next);
            }}
        >
            <i style={{ width: `${shown}%` }} />
        </div>
    );
}

interface LightTileProps extends TileHeadProps {
    isDarkMode: boolean;
    brightness: number;
    onBrightnessChange: (brightness: number) => void;
    onBrightnessCommit: () => void;
}

/** The dashboard tile: icon room, name and value, and a 46 tall brightness bar. */
export function LightTile({
    isDarkMode,
    name,
    icon,
    isOn,
    valueText,
    brightness,
    onToggle,
    onOpen,
    onHold,
    onDoubleTap,
    onBrightnessChange,
    onBrightnessCommit,
}: LightTileProps) {
    return (
        <div className={`hc hcTile${isDarkMode ? ' hc--dark' : ''}`}>
            <div className="hcTileHead">
                <TileChip name={name} icon={icon} isOn={isOn} onToggle={onToggle} />
                <TileName name={name} valueText={valueText} onOpen={onOpen} onHold={onHold} onDoubleTap={onDoubleTap} />
            </div>
            <BrightnessBar
                name={name}
                brightness={isOn ? brightness : 0}
                onChange={onBrightnessChange}
                onCommit={onBrightnessCommit}
            />
        </div>
    );
}

interface PadTileProps extends TileHeadProps {
    isDarkMode: boolean;
    mode: 'temperature' | 'spectrum';
    hue: number;
    saturation: number;
    brightness: number;
    onPadChange: (hue: number, saturation: number, brightness: number) => void;
    onPadStart: () => void;
    onPadEnd: () => void;
}

/** The tile-size controller (Figma "DAC Light tile", 470:12396): the light tile with the pad, 158 tall, where the bar was. */
export function PadTile({
    isDarkMode,
    name,
    icon,
    isOn,
    valueText,
    mode,
    hue,
    saturation,
    brightness,
    onToggle,
    onOpen,
    onHold,
    onDoubleTap,
    onPadChange,
    onPadStart,
    onPadEnd,
}: PadTileProps) {
    return (
        <div className={`hc hcTile${isDarkMode ? ' hc--dark' : ''}`}>
            <div className="hcTileHead">
                <TileChip name={name} icon={icon} isOn={isOn} onToggle={onToggle} />
                <TileName name={name} valueText={valueText} onOpen={onOpen} onHold={onHold} onDoubleTap={onDoubleTap} />
            </div>
            <div className="hcTilePad">
                <Halo
                    size="tile"
                    hue={hue}
                    saturation={saturation}
                    brightness={brightness}
                    isOn={isOn}
                    mode={mode}
                    visualStyle="plotter"
                    onChange={onPadChange}
                    onInteractionStart={onPadStart}
                    onInteractionEnd={onPadEnd}
                    onToggle={onToggle}
                />
            </div>
        </div>
    );
}

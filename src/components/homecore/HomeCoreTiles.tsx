import { useEffect, useRef } from 'react';
import { Halo } from '../Halo';
import { HcGlyph } from './icons';

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

interface DacLightTileProps extends TileHeadProps {
    isDarkMode: boolean;
    mode: 'temperature' | 'spectrum';
    hue: number;
    saturation: number;
    brightness: number;
    onPadChange: (hue: number, saturation: number, brightness: number) => void;
    onPadStart: () => void;
    onPadEnd: () => void;
}

/** The dashboard tile (Figma "DAC Light tile", 470:12396): icon room, name and value, and the pad, full width and 158 tall. */
export function DacLightTile({
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
}: DacLightTileProps) {
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

import { useState, useRef } from 'react';
import classNames from 'classnames';

interface PeerLight {
    hue: number;
    saturation: number;
    brightness: number;
    isOn: boolean;
}

interface HaloProps {
    hue: number;
    saturation: number;
    brightness: number;
    isOn: boolean;
    onChange: (h: number, s: number, b: number) => void;
    onToggle: () => void;
    mode: 'temperature' | 'spectrum';
    peerLights?: PeerLight[];
    lightMode?: boolean;
}

const SPECTRUM_GRADIENT = 'linear-gradient(to top, #fff, transparent), conic-gradient(from 225deg, #ff00ff, #ff0000, #ffaf00, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff)';

const HALO_CSS = `
.halo-container {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 20px;
    position: relative;
    width: 100%;
    flex: 1;
}

.trackpadWrapperV2 {
    width: 100%;
    position: relative;
    padding-bottom: 100%;
}

.trackpad {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border-radius: 8px; /* Slightly tighter rounding to match CompactCard */
    cursor: crosshair;
    touch-action: none;
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}

.trackpad.off {
    filter: brightness(0.2) grayscale(0.5);
    border-color: rgba(255, 255, 255, 0.05);
    cursor: pointer;
}

.halo-indicator {
    position: absolute;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: transparent;
    border: 2.5px solid white;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.15), 0 4px 12px rgba(0, 0, 0, 0.4);
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: all 0.1s ease-out, opacity 0.5s ease-in-out;
}

.off .halo-indicator {
    opacity: 0;
}

.brightnessValue {
    display: none;
}

.off .brightnessValue {
    opacity: 0.1;
}

.peerIndicator {
    width: 16px;
    height: 16px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.2);
    z-index: 10;
}

.barIndicator {
    position: absolute;
    width: calc(100% - 40px);
    height: 12px;
    border-radius: 6px;
    background: white;
    border: 2px solid rgba(0, 0, 0, 0.2);
    left: 50% !important;
    transform: translate(-50%, -50%);
    pointer-events: none;
    transition: all 0.1s ease-out, opacity 0.5s ease-in-out;
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
}

.off .barIndicator {
    opacity: 0;
}
`;

export const Halo = ({
    hue,
    saturation,
    brightness,
    isOn,
    onChange,
    onToggle,
    mode,
    peerLights = [],
    lightMode = false
}: HaloProps) => {
    const trackpadRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isOn) return;
        setIsDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromPosition(e);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !isOn) return;
        updateFromPosition(e);
    };

    const handleClick = () => {
        if (!isOn) {
            onToggle();
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    const updateFromPosition = (e: React.PointerEvent) => {
        if (!trackpadRef.current) return;
        const rect = trackpadRef.current.getBoundingClientRect();
        let xPercent = (e.clientX - rect.left) / rect.width;
        let yPercent = (e.clientY - rect.top) / rect.height;

        xPercent = Math.max(0, Math.min(1, xPercent));
        yPercent = Math.max(0, Math.min(1, yPercent));

        let newHue: number;
        let newSat: number;

        if (mode === 'spectrum') {
            newHue = Math.round(xPercent * 360);
            newSat = 100; // Keep saturation high for spectrum mode
        } else {
            if (xPercent < 0.5) {
                newHue = 200; // Cool
                newSat = (0.5 - xPercent) * 2 * 100;
            } else {
                newHue = 30; // Warm
                newSat = (xPercent - 0.5) * 2 * 100;
            }
        }

        const newBrightness = (1 - yPercent) * 100;
        onChange(newHue, Math.round(newSat), Math.round(newBrightness));
    };

    let backgroundGradient: string;

    if (mode === 'spectrum') {
        backgroundGradient = SPECTRUM_GRADIENT;
    } else {
        backgroundGradient = 'linear-gradient(to top, #fff, transparent), linear-gradient(to right, #7fd1ff, #fff 50%, #ffb366)';
    }

    const isRepresentable = (_h: number, s: number, m: 'temperature' | 'spectrum') => {
        if (m === 'spectrum') {
            return s >= 30;
        } else {
            return true;
        }
    };

    const mainIndicatorVisible = isRepresentable(hue, saturation, mode);

    return (
        <div className="halo-container">
            <style dangerouslySetInnerHTML={{ __html: HALO_CSS }} />
            <div className="trackpadWrapperV2">
                <div
                    ref={trackpadRef}
                    className={classNames('trackpad', { 'off': !isOn })}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onClick={handleClick}
                    style={{
                        background: lightMode
                            ? `${backgroundGradient}`
                            : `linear-gradient(to top, #1a1a1a 0%, rgba(0,0,0,0) 100%), ${backgroundGradient}`
                    }}
                >
                    {peerLights.map((peer, i) => {
                        const visible = isRepresentable(peer.hue, peer.saturation, mode);
                        if (!visible) return null;

                        return (
                            <div
                                key={i}
                                className={classNames('halo-indicator', 'peerIndicator')}
                                style={{
                                    left: `${xPosFromHueSat(peer.hue, peer.saturation, mode)}%`,
                                    top: `${100 - peer.brightness}%`,
                                    opacity: peer.isOn ? 0.4 : 0.1,
                                    backgroundColor: mode === 'spectrum'
                                        ? `hsl(${peer.hue}, 100%, 50%)`
                                        : `hsl(${peer.hue}, ${peer.saturation}%, 90%)` 
                                }}
                            />
                        );
                    })}
                    {mainIndicatorVisible && (
                        <div
                            className="halo-indicator"
                            style={{
                                left: `${xPosFromHueSat(hue, saturation, mode)}%`,
                                top: `${100 - brightness}%`
                            }}
                        />
                    )}
                    <div
                        className="brightnessValue"
                        style={{ color: lightMode ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.3)' }}
                    >
                        {Math.round(brightness)}%
                    </div>
                </div>
            </div>
        </div>
    );
};

function xPosFromHueSat(hue: number, sat: number, mode: 'temperature' | 'spectrum') {
    if (mode === 'spectrum') {
        return (hue / 360) * 100;
    }

    const leftHue = 200;
    const rightHue = 30;

    const coolDist = Math.abs(hue - leftHue);
    const warmDist = Math.abs(hue - rightHue);

    if (coolDist < warmDist) {
        return (0.5 - (sat / 200)) * 100;
    } else {
        return (0.5 + (sat / 200)) * 100;
    }
}

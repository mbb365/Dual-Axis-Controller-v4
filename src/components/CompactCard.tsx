import { useState } from 'react';
import { Halo } from './Halo';
import './CompactCard.css';

import tempIcon from '../assets/temp-icon.png';
import spectrumIcon from '../assets/spectrum-icon.png';
import candleIcon from '../assets/candle-icon.png';
import optionsIcon from '../assets/options-icon.png';

// PNG Options Icon
const OptionsIcon = ({ active }: { active: boolean }) => (
    <img 
        src={optionsIcon} 
        alt="Options" 
        style={{ 
            width: '20px', 
            height: '20px', 
            objectFit: 'contain',
            opacity: active ? 1 : 0.6,
            transition: 'all 0.3s ease'
        }} 
    />
);

// PNG Temperature Icon
const TempIcon = ({ active }: { active: boolean }) => (
    <img 
        src={tempIcon} 
        alt="Temperature" 
        style={{ 
            width: '20px', 
            height: '20px', 
            objectFit: 'contain',
            opacity: active ? 1 : 0.6,
            transition: 'all 0.3s ease'
        }} 
    />
);

// PNG Candle Icon
const CandleIcon = ({ active }: { active: boolean }) => (
    <img 
        src={candleIcon} 
        alt="Candle" 
        style={{ 
            width: '18px', 
            height: '18px', 
            objectFit: 'contain',
            opacity: active ? 1 : 0.6,
            transition: 'all 0.3s ease'
        }} 
    />
);

// PNG Spectrum Icon
const SpectrumIcon = ({ active }: { active: boolean }) => (
    <img 
        src={spectrumIcon} 
        alt="Spectrum" 
        style={{ 
            width: '18px', 
            height: '18px', 
            objectFit: 'contain',
            opacity: active ? 1 : 0.6,
            transition: 'all 0.3s ease'
        }} 
    />
);

// Scenes/Effects View Component
const ScenesView = ({ onSelect }: { onSelect: (h: number, s: number, b: number, mode: 'temperature' | 'spectrum') => void }) => {
    const scenes = [
        { id: 'relax', name: 'Relax', icon: 'mdi:weather-night', h: 30, s: 60, b: 50, m: 'temperature' as const },
        { id: 'focus', name: 'Focus', icon: 'mdi:book-open-variant', h: 200, s: 40, b: 80, m: 'temperature' as const },
        { id: 'night', name: 'Night', icon: 'mdi:star-face', h: 280, s: 100, b: 30, m: 'spectrum' as const },
        { id: 'bright', name: 'Bright', icon: 'mdi:white-balance-sunny', h: 45, s: 20, b: 100, m: 'temperature' as const },
        { id: 'party', name: 'Party', icon: 'mdi:party-popper', h: 300, s: 100, b: 80, m: 'spectrum' as const },
        { id: 'ocean', name: 'Ocean', icon: 'mdi:waves', h: 190, s: 100, b: 70, m: 'spectrum' as const },
    ];

    return (
        <div style={{
            width: '100%',
            height: '100%',
            maxHeight: '240px',
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            padding: '4px',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
        }}>
            <style>{`
                div::-webkit-scrollbar { display: none; }
            `}</style>
            {scenes.map(scene => (
                <div 
                    key={scene.id}
                    style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        backdropFilter: 'blur(8px)',
                        WebkitBackdropFilter: 'blur(8px)',
                        borderRadius: '24px',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        gap: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        padding: '4px 12px 4px 4px',
                        minHeight: '36px'
                    }}
                    onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                    }}
                    onClick={() => onSelect(scene.h, scene.s, scene.b, scene.m)}
                >
                    <div style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '50%',
                        background: 'rgba(255, 255, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        {/* @ts-ignore */}
                        <ha-icon 
                            icon={scene.icon} 
                            style={{ 
                                '--mdc-icon-size': '18px', 
                                color: 'var(--primary-text-color, #1a1a1a)',
                                opacity: 0.8
                            }} 
                        />
                    </div>
                    <span style={{ 
                        fontSize: '0.65rem', 
                        fontWeight: 600, 
                        color: 'var(--primary-text-color, #1a1a1a)', 
                        opacity: 0.8, 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis' 
                    }}>
                        {scene.name}
                    </span>
                </div>
            ))}
        </div>
    );
};

interface CompactCardProps {
    lightName: string;
    isOn: boolean;
    hue: number;
    saturation: number;
    brightness: number;
    kelvin: number | null;
    uiMode: 'temperature' | 'spectrum' | 'options';
    onToggle: () => void;
    onModeChange: (mode: 'temperature' | 'spectrum' | 'options') => void;
    onOptionsClick?: () => void;
    onControlsChange: (h: number, s: number, b: number) => void;
}

export function CompactCard({
    lightName,
    isOn,
    hue,
    saturation,
    brightness,
    kelvin,
    uiMode,
    onToggle,
    onModeChange,
    onControlsChange,
    onOptionsClick,
}: CompactCardProps) {

    const [activeSceneName, setActiveSceneName] = useState<string | null>(null);

    let iconBg = 'hsla(0, 0%, 100%, 0)';

    if (isOn) {
        if (uiMode === 'spectrum') {
            iconBg = `hsla(${hue}, 100%, 50%, 0.15)`; // Another 50% less bright (0.15 alpha)
        } else {
            if (saturation < 15) {
                iconBg = 'hsla(0, 0%, 100%, 0)';
            } else {
                iconBg = `hsla(${hue}, 100%, 50%, 0.15)`; // Muted for subtler glow
            }
        }
    }

    const getPowerEmoji = () => {
        if (!isOn) return '🔌';
        if (uiMode === 'spectrum') return '💡';
        
        // Temperature Mode Logic
        if (saturation < 15) return '❄️'; // Snowflake for white in-between
        if (hue === 200) return '🥶';    // Shivering for cold
        return '🔥';                    // Flame for warm
    };

    const getStatusText = () => {
        if (!isOn) return 'Off';
        const b = Math.round(brightness);
        if (uiMode === 'temperature') {
            const kStr = kelvin ? kelvin.toLocaleString() : '---';
            return `${b}% at ${kStr}K`;
        } else {
            const h = hue;
            const s = saturation / 100;
            const v = brightness / 100;
            let r = 0, g = 0, bl = 0;
            const i = Math.floor(h / 60);
            const f = h / 60 - i;
            const p = v * (1 - s);
            const q = v * (1 - f * s);
            const t = v * (1 - (1 - f) * s);
            switch (i % 6) {
                case 0: r = v; g = t; bl = p; break;
                case 1: r = q; g = v; bl = p; break;
                case 2: r = p; g = v; bl = t; break;
                case 3: r = p; g = q; bl = v; break;
                case 4: r = t; g = p; bl = v; break;
                case 5: r = v; g = p; bl = q; break;
            }
            return `${b}% at R${Math.round(r * 255)} G${Math.round(g * 255)} B${Math.round(bl * 255)}`;
        }
    };

    return (
        <div className="card-container" style={{
            background: 'var(--ha-card-background, var(--card-background-color, #ffffff))',
            borderRadius: 'var(--ha-card-border-radius, 24px)',
            padding: '12px 12px 20px 12px',
            fontFamily: "'Outfit', 'Inter', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            maxWidth: '320px',
            margin: '0 auto',
            boxSizing: 'border-box',
            border: `3px solid ${iconBg.replace('0.15)', '0.1)') || 'rgba(0,0,0,0.05)'}`,
            boxShadow: '0 4px 24px -1px rgba(0,0,0,0.1)',
            position: 'relative',
            transition: 'all 0.5s ease',
        }}>

            {/* Header Section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '12px',
                    background: isOn 
                        ? (uiMode === 'spectrum' 
                            ? `hsla(${hue}, 100%, 50%, 0.3)` 
                            : `hsla(${hue}, ${saturation}%, ${100 - (saturation / 100) * 25}%, 0.3)`)
                        : 'rgba(255, 255, 255, 0.05)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: isOn && (uiMode === 'spectrum' || saturation >= 15)
                        ? `1px solid hsla(${hue}, 100%, 50%, 0.2)`
                        : '1px solid var(--ha-card-border-color, rgba(0,0,0,0.05))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    color: 'var(--primary-text-color, #1a1a1a)',
                    transition: 'all 0.5s ease',
                    boxShadow: isOn && (uiMode === 'spectrum' || saturation >= 15)
                        ? `0 0 10px hsla(${hue}, 100%, 50%, 0.1)` // Subtle glow
                        : 'inset 0 2px 4px rgba(0,0,0,0.02)',
                    cursor: 'pointer'
                }} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
                    {getPowerEmoji()}
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--primary-text-color, #1a1a1a)', letterSpacing: '-0.01em', lineHeight: '1.2' }}>
                        {lightName}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--secondary-text-color, #999)', marginTop: '2px', fontWeight: 500 }}>
                        {getStatusText()}
                    </div>
                </div>
            </div>

            {/* Body Section: Layout with Trackpad on the left, buttons on bottom right (or below on mobile) */}
            <div className="card-body" onClick={(e) => e.stopPropagation()}>
                <div className="halo-wrapper" style={{ position: 'relative' }}>
                    {uiMode === 'options' ? (
                        <ScenesView onSelect={(h, s, b, m) => {
                            const scene = [
                                { id: 'relax', name: 'Relax' },
                                { id: 'focus', name: 'Focus' },
                                { id: 'night', name: 'Night' },
                                { id: 'bright', name: 'Bright' },
                                { id: 'party', name: 'Party' },
                                { id: 'ocean', name: 'Ocean' }
                            ].find(sc => sc.id === (h === 30 && s === 60 ? 'relax' : h === 200 ? 'focus' : h === 280 ? 'night' : h === 45 ? 'bright' : h === 300 ? 'party' : 'ocean'));
                            
                            setActiveSceneName(scene?.name || 'Custom');
                            onControlsChange(h, s, b);
                            onModeChange(m);
                        }} />
                    ) : (
                        <>
                            <Halo
                                hue={hue}
                                saturation={saturation}
                                brightness={brightness}
                                isOn={isOn}
                                onChange={(h, s, b) => {
                                    setActiveSceneName(null); // Clear scene name when manual change happens
                                    onControlsChange(h, s, b);
                                }}
                                onToggle={onToggle}
                                mode={uiMode as 'temperature' | 'spectrum'}
                                activeSceneName={activeSceneName}
                            />
                        </>
                    )}
                </div>

                {/* Mode Buttons */}
                <div className="mode-buttons-container">
                    <button
                        onClick={() => {
                            onModeChange('options');
                            if (onOptionsClick) onOptionsClick();
                        }}
                        style={{
                            width: '32px',
                            height: '32px',
                            minHeight: '32px',
                            flexShrink: 0,
                            borderRadius: '12px',
                            border: uiMode === 'options'
                                ? '1px solid rgba(0, 0, 0, 0.08)' 
                                : '1px solid rgba(255, 255, 255, 0.1)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            boxShadow: uiMode === 'options'
                                ? 'inset 0 2px 4px rgba(0, 0, 0, 0.03)'
                                : 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            overflow: 'hidden',
                            transition: 'all 0.3s ease-out',
                            filter: 'none',
                            transform: 'scale(1)'
                        }}
                    >
                        <OptionsIcon active={uiMode === 'options'} />
                    </button>
                    <button
                        onClick={() => {
                            onModeChange('temperature');
                            onControlsChange(30, 100, 70); // Warm candle tone
                        }}
                        style={{
                            width: '32px',
                            height: '32px',
                            minHeight: '32px',
                            flexShrink: 0,
                            borderRadius: '12px',
                            border: (uiMode === 'temperature' && hue === 30 && saturation === 100 && brightness === 70)
                                ? '1px solid rgba(0, 0, 0, 0.08)' 
                                : '1px solid rgba(255, 255, 255, 0.1)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            boxShadow: (uiMode === 'temperature' && hue === 30 && saturation === 100 && brightness === 70)
                                ? 'inset 0 2px 4px rgba(0, 0, 0, 0.03)'
                                : 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            overflow: 'hidden',
                            transition: 'all 0.3s ease-out',
                            filter: 'none',
                            transform: 'scale(1)'
                        }}
                    >
                        <CandleIcon active={uiMode === 'temperature' && hue === 30 && saturation === 100 && brightness === 70} />
                    </button>
                    <button
                        onClick={() => onModeChange('temperature')}
                        style={{
                            width: '32px',
                            height: '32px',
                            minHeight: '32px',
                            flexShrink: 0,
                            borderRadius: '12px',
                            border: (uiMode === 'temperature' && !(hue === 30 && saturation === 100 && brightness === 70))
                                ? '1px solid rgba(0, 0, 0, 0.08)' 
                                : '1px solid rgba(255, 255, 255, 0.1)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            boxShadow: (uiMode === 'temperature' && !(hue === 30 && saturation === 100 && brightness === 70))
                                ? 'inset 0 2px 4px rgba(0, 0, 0, 0.03)'
                                : 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            overflow: 'hidden',
                            transition: 'all 0.3s ease-out',
                            filter: 'none',
                            transform: 'scale(1)'
                        }}
                    >
                        <TempIcon active={uiMode === 'temperature' && !(hue === 30 && saturation === 100 && brightness === 70)} />
                    </button>
                    <button
                        onClick={() => onModeChange('spectrum')}
                        style={{
                            width: '32px',
                            height: '32px',
                            minHeight: '32px',
                            flexShrink: 0,
                            borderRadius: '12px',
                            border: uiMode === 'spectrum' 
                                ? '1px solid rgba(0, 0, 0, 0.08)' 
                                : '1px solid rgba(255, 255, 255, 0.1)',
                            background: 'rgba(255, 255, 255, 0.05)',
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            boxShadow: uiMode === 'spectrum'
                                ? 'inset 0 2px 4px rgba(0, 0, 0, 0.03)'
                                : 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            overflow: 'hidden',
                            transition: 'all 0.3s ease-out',
                            filter: 'none',
                            transform: 'scale(1)'
                        }}
                    >
                        <SpectrumIcon active={uiMode === 'spectrum'} />
                    </button>
                </div>
            </div>
        </div>
    );
}

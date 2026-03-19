import { Halo } from './Halo';

interface CompactCardProps {
    lightName: string;
    isOn: boolean;
    hue: number;
    saturation: number;
    brightness: number;
    kelvin: number | null;
    uiMode: 'temperature' | 'spectrum';
    onToggle: () => void;
    onModeChange: (mode: 'temperature' | 'spectrum') => void;
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
}: CompactCardProps) {
    const iconBg = '#d9efff';
    const iconColor = '#000';

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
        <div style={{
            background: '#ffffff',
            borderRadius: '24px',
            padding: '20px',
            fontFamily: "'Outfit', 'Inter', sans-serif",
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            minWidth: 0,
            width: '100%',
            boxSizing: 'border-box',
            border: '1px solid rgba(0,0,0,0.03)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.03)',
            position: 'relative',
        }}>

            {/* Header Section */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: iconBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '32px',
                    color: iconColor,
                    transition: 'all 0.5s ease',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                }} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
                    💡
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a1a1a', letterSpacing: '-0.02em' }}>
                        {lightName}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#999', marginTop: '4px', fontWeight: 500 }}>
                        {getStatusText()}
                    </div>
                </div>
            </div>

            {/* Body Section: Layout with Trackpad on the left, buttons on bottom right */}
            <div style={{
                flex: 1,
                minWidth: 0,
                position: 'relative',
                display: 'flex',
                flexDirection: 'row',
                gap: '16px',
                marginTop: '16px'
            }} onClick={(e) => e.stopPropagation()}>
                <div style={{ flex: 1, position: 'relative' }}>
                    <Halo
                        hue={hue}
                        saturation={saturation}
                        brightness={brightness}
                        isOn={isOn}
                        onChange={onControlsChange}
                        onToggle={onToggle}
                        mode={uiMode}
                        lightMode={true}
                    />
                </div>

                {/* Mode Buttons */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'flex-end',
                    gap: '12px',
                    zIndex: 20
                }}>
                    <button
                        onClick={() => onModeChange('temperature')}
                        style={{
                            width: '44px',
                            height: '44px',
                            minHeight: '44px',
                            flexShrink: 0,
                            borderRadius: '50%',
                            border: uiMode === 'temperature' ? '2px solid #000' : '2px solid transparent',
                            background: 'linear-gradient(to right, #7fd1ff, #fff 50%, #ffb366)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            overflow: 'hidden',
                            transition: 'transform 0.2s ease, border 0.3s ease',
                        }}
                    >
                    </button>
                    <button
                        onClick={() => onModeChange('spectrum')}
                        style={{
                            width: '44px',
                            height: '44px',
                            minHeight: '44px',
                            flexShrink: 0,
                            borderRadius: '50%',
                            border: uiMode === 'spectrum' ? '2px solid #000' : '2px solid transparent',
                            background: `
                                radial-gradient(circle at 30% 30%, #ff00ff, rgba(255,0,255,0) 70%),
                                radial-gradient(circle at 70% 30%, #ff4b00, rgba(255,75,0,0) 70%),
                                radial-gradient(circle at 70% 70%, #ffcc00, rgba(255,204,0,0) 70%),
                                radial-gradient(circle at 30% 70%, #00eaff, rgba(0,234,255,0) 70%),
                                #00ff00
                            `,
                            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            overflow: 'hidden',
                            transition: 'transform 0.2s ease, border 0.3s ease',
                        }}
                    >
                    </button>
                </div>
            </div>
        </div>
    );
}

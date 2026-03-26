import { createRoot } from 'react-dom/client';
import { useMemo, useState } from 'react';
import { CardApp } from './App';

function MockHomeAssistant() {
    const [showPopup, setShowPopup] = useState(false);
    const [mockState, setMockState] = useState({
        state: 'on',
        attributes: {
            friendly_name: 'Living room',
            brightness: 237,
            color_mode: 'color_temp',
            color_temp: 412,
            color_temp_kelvin: 2430,
            min_mireds: 153,
            max_mireds: 500,
            hs_color: [38, 62] as [number, number],
            supported_color_modes: ['color_temp', 'hs'],
        },
    });

    const hass = useMemo(
        () => ({
            states: {
                'light.preview': mockState,
            },
            callService: async (domain: string, service: string, serviceData: Record<string, unknown>) => {
                if (domain !== 'light') return;

                setMockState((previous) => {
                    const next = { ...previous, attributes: { ...previous.attributes } };

                    if (service === 'turn_off') {
                        next.state = 'off';
                        return next;
                    }

                    next.state = 'on';

                    if (typeof serviceData.brightness === 'number') {
                        next.attributes.brightness = serviceData.brightness;
                    }

                    if (Array.isArray(serviceData.hs_color)) {
                        next.attributes.hs_color = serviceData.hs_color as [number, number];
                        next.attributes.color_mode = 'hs';
                        next.attributes.color_temp = null as unknown as number;
                        next.attributes.color_temp_kelvin = null as unknown as number;
                    }

                    if (typeof serviceData.color_temp_kelvin === 'number') {
                        next.attributes.color_temp_kelvin = serviceData.color_temp_kelvin;
                        next.attributes.color_temp = Math.round(1000000 / serviceData.color_temp_kelvin);
                        next.attributes.color_mode = 'color_temp';
                    }

                    return next;
                });
            },
        }),
        [mockState]
    );

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#f3f4f6',
                padding: '32px',
                boxSizing: 'border-box',
                fontFamily: 'system-ui, sans-serif',
            }}
        >
            <div
                style={{
                    maxWidth: '520px',
                    margin: '0 auto',
                }}
            >
                <CardApp
                    hass={hass}
                    entityId="light.preview"
                    layout="compact"
                    onCardAction={(action) => {
                        if (action === 'tap') {
                            setShowPopup(true);
                        }
                    }}
                />
            </div>

            {showPopup ? (
                <div
                    onClick={() => setShowPopup(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.18)',
                        display: 'grid',
                        placeItems: 'center',
                        padding: '24px',
                        boxSizing: 'border-box',
                    }}
                >
                    <div
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: 'min(100%, 460px)',
                            background: '#ffffff',
                            borderRadius: '28px',
                            boxShadow: '0 24px 64px rgba(15, 23, 42, 0.18)',
                            padding: '20px',
                            boxSizing: 'border-box',
                        }}
                    >
                        <CardApp hass={hass} entityId="light.preview" layout="expanded" />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<MockHomeAssistant />);
}

import { createRoot } from 'react-dom/client';
import { useMemo, useState } from 'react';
import { CardApp } from './App';

const demoScenes = {
    'scene.preview_focus': {
        friendly_name: 'Focus Beam',
        state: 'on' as const,
        attributes: {
            brightness: 255,
            color_mode: 'color_temp',
            color_temp: 176,
            color_temp_kelvin: 5680,
            hs_color: [210, 28] as [number, number],
        },
    },
    'scene.preview_sunset': {
        friendly_name: 'Sunset Glow',
        state: 'on' as const,
        attributes: {
            brightness: 204,
            color_mode: 'color_temp',
            color_temp: 435,
            color_temp_kelvin: 2299,
            hs_color: [32, 74] as [number, number],
        },
    },
    'scene.preview_aurora': {
        friendly_name: 'Aurora Pop',
        state: 'on' as const,
        attributes: {
            brightness: 230,
            color_mode: 'hs',
            color_temp: null as unknown as number,
            color_temp_kelvin: null as unknown as number,
            hs_color: [164, 78] as [number, number],
        },
    },
    'scene.preview_midnight': {
        friendly_name: 'Midnight Violet',
        state: 'on' as const,
        attributes: {
            brightness: 122,
            color_mode: 'hs',
            color_temp: null as unknown as number,
            color_temp_kelvin: null as unknown as number,
            hs_color: [282, 72] as [number, number],
        },
    },
} as const;

function MockHomeAssistant() {
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
                ...Object.fromEntries(
                    Object.entries(demoScenes).map(([entityId, scene]) => [
                        entityId,
                        {
                            state: scene.state,
                            attributes: {
                                friendly_name: scene.friendly_name,
                            },
                        },
                    ])
                ),
            },
            callService: async (domain: string, service: string, serviceData: Record<string, unknown>) => {
                if (domain === 'scene' && service === 'turn_on' && typeof serviceData.entity_id === 'string') {
                    const selectedScene = demoScenes[serviceData.entity_id as keyof typeof demoScenes];
                    if (!selectedScene) return;

                    setMockState((previous) => ({
                        ...previous,
                        state: selectedScene.state,
                        attributes: {
                            ...previous.attributes,
                            brightness: selectedScene.attributes.brightness,
                            color_mode: selectedScene.attributes.color_mode,
                            color_temp: selectedScene.attributes.color_temp,
                            color_temp_kelvin: selectedScene.attributes.color_temp_kelvin,
                            hs_color: selectedScene.attributes.hs_color,
                        },
                    }));
                    return;
                }

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
                <CardApp hass={hass} entityId="light.preview" layout="compact" />
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<MockHomeAssistant />);
}

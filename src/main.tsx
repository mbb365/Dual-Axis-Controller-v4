import { createRoot } from 'react-dom/client';
import { useMemo, useState } from 'react';
import { CardApp } from './App';

const demoScenes = {
    'scene.preview_focus': {
        friendly_name: 'Focus Beam',
        state: 'on' as const,
        attributes: {
            entity_id: ['light.preview'],
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
            entity_id: ['light.preview'],
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
            entity_id: ['light.preview'],
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
            entity_id: ['light.preview'],
            brightness: 122,
            color_mode: 'hs',
            color_temp: null as unknown as number,
            color_temp_kelvin: null as unknown as number,
            hs_color: [282, 72] as [number, number],
        },
    },
    'scene.preview_elsewhere': {
        friendly_name: 'Kitchen Clean',
        state: 'on' as const,
        attributes: {
            entity_id: ['light.other_room'],
            brightness: 255,
            color_mode: 'color_temp',
            color_temp: 240,
            color_temp_kelvin: 4167,
            hs_color: [48, 18] as [number, number],
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
                'light.other_room': {
                    state: 'on',
                    attributes: {
                        friendly_name: 'Kitchen',
                    },
                },
                ...Object.fromEntries(
                    Object.entries(demoScenes).map(([entityId, scene]) => [
                        entityId,
                        {
                            state: scene.state,
                            attributes: {
                                friendly_name: scene.friendly_name,
                                entity_id: scene.attributes.entity_id,
                            },
                        },
                    ])
                ),
            },
            entities: {
                'light.preview': {
                    area_id: 'office',
                    device_id: 'preview_light_device',
                },
                'light.other_room': {
                    area_id: 'kitchen',
                    device_id: 'other_light_device',
                },
            },
            devices: {
                preview_light_device: {
                    area_id: 'office',
                },
                other_light_device: {
                    area_id: 'kitchen',
                },
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
                background:
                    'radial-gradient(circle at 20% 18%, rgba(255, 228, 182, 0.46) 0%, rgba(255, 228, 182, 0) 34%), radial-gradient(circle at 82% 16%, rgba(196, 220, 255, 0.54) 0%, rgba(196, 220, 255, 0) 38%), linear-gradient(180deg, #f7f2ea 0%, #edf2f8 100%)',
                padding: '40px 20px',
                boxSizing: 'border-box',
                fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
                display: 'grid',
                placeItems: 'center',
            }}
        >
            <div
                style={{
                    width: 'min(100%, 620px)',
                }}
            >
                <div
                    style={{
                        marginBottom: '18px',
                        textAlign: 'center',
                        color: '#314158',
                    }}
                >
                    <div
                        style={{
                            fontSize: '0.76rem',
                            letterSpacing: '0.18em',
                            textTransform: 'uppercase',
                            opacity: 0.62,
                            marginBottom: '8px',
                        }}
                    >
                        Dual Halo Controller
                    </div>
                    <div
                        style={{
                            fontSize: 'clamp(1.9rem, 4vw, 2.6rem)',
                            lineHeight: 1,
                            fontWeight: 600,
                            letterSpacing: '-0.05em',
                        }}
                    >
                        Simple live preview
                    </div>
                </div>

                <div
                    style={{
                        borderRadius: '28px',
                        padding: '24px',
                        background: 'rgba(255, 255, 255, 0.62)',
                        border: '1px solid rgba(255, 255, 255, 0.68)',
                        boxShadow:
                            '0 28px 80px rgba(80, 96, 122, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.56)',
                        backdropFilter: 'blur(22px) saturate(135%)',
                        WebkitBackdropFilter: 'blur(22px) saturate(135%)',
                    }}
                >
                    <CardApp hass={hass} entityId="light.preview" layout="expanded" />
                </div>
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<MockHomeAssistant />);
}

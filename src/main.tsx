import { createRoot } from 'react-dom/client';
import { useMemo, useState } from 'react';
import { CardApp } from './App';

const isMobileDemo =
    typeof window !== 'undefined' &&
    (window.location.pathname.endsWith('/mobile.html') || window.location.pathname === '/mobile.html');

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

const groupedLightIds = [
    'light.preview_floor',
    'light.preview_desk',
    'light.preview_corner',
    'light.preview_shelf',
    'light.preview_wall',
] as const;

function buildGroupState(memberStates: Record<string, any>) {
    const memberValues = groupedLightIds.map((entityId) => memberStates[entityId]).filter(Boolean);
    const isOn = memberValues.some((member) => member.state === 'on');
    const brightnessValues = memberValues
        .map((member) => member.attributes?.brightness)
        .filter((value): value is number => typeof value === 'number');
    const brightness = brightnessValues.length
        ? Math.round(brightnessValues.reduce((total, value) => total + value, 0) / brightnessValues.length)
        : 0;
    const primaryMember = memberValues[0];

    return {
        state: isOn ? 'on' : 'off',
        attributes: {
            friendly_name: 'Living room group',
            entity_id: [...groupedLightIds],
            brightness,
            color_mode: primaryMember?.attributes?.color_mode ?? 'color_temp',
            color_temp: primaryMember?.attributes?.color_temp ?? 412,
            color_temp_kelvin: primaryMember?.attributes?.color_temp_kelvin ?? 2430,
            min_mireds: 153,
            max_mireds: 500,
            hs_color: primaryMember?.attributes?.hs_color ?? ([38, 62] as [number, number]),
            supported_color_modes: ['color_temp', 'hs'],
        },
    };
}

function MockHomeAssistant() {
    const [memberStates, setMemberStates] = useState({
        'light.preview_floor': {
            state: 'on',
            attributes: {
                friendly_name: 'Floor lamp',
                brightness: 237,
                color_mode: 'color_temp',
                color_temp: 412,
                color_temp_kelvin: 2430,
                min_mireds: 153,
                max_mireds: 500,
                hs_color: [38, 62] as [number, number],
                supported_color_modes: ['color_temp', 'hs'],
            },
        },
        'light.preview_desk': {
            state: 'on',
            attributes: {
                friendly_name: 'Desk light',
                brightness: 190,
                color_mode: 'color_temp',
                color_temp: 355,
                color_temp_kelvin: 2817,
                min_mireds: 153,
                max_mireds: 500,
                hs_color: [42, 38] as [number, number],
                supported_color_modes: ['color_temp', 'hs'],
            },
        },
        'light.preview_corner': {
            state: 'off',
            attributes: {
                friendly_name: 'Corner lamp',
                brightness: 0,
                color_mode: 'hs',
                color_temp: null as unknown as number,
                color_temp_kelvin: null as unknown as number,
                min_mireds: 153,
                max_mireds: 500,
                hs_color: [282, 72] as [number, number],
                supported_color_modes: ['color_temp', 'hs'],
            },
        },
        'light.preview_shelf': {
            state: 'on',
            attributes: {
                friendly_name: 'Shelf light',
                brightness: 142,
                color_mode: 'color_temp',
                color_temp: 298,
                color_temp_kelvin: 3356,
                min_mireds: 153,
                max_mireds: 500,
                hs_color: [46, 26] as [number, number],
                supported_color_modes: ['color_temp', 'hs'],
            },
        },
        'light.preview_wall': {
            state: 'on',
            attributes: {
                friendly_name: 'Wall wash',
                brightness: 214,
                color_mode: 'hs',
                color_temp: null as unknown as number,
                color_temp_kelvin: null as unknown as number,
                min_mireds: 153,
                max_mireds: 500,
                hs_color: [198, 58] as [number, number],
                supported_color_modes: ['color_temp', 'hs'],
            },
        },
    });
    const [savedScenes, setSavedScenes] = useState<
        Record<
            string,
            {
                friendly_name: string;
                snapshot: Record<string, (typeof memberStates)[keyof typeof memberStates]>;
            }
        >
    >({});

    const hass = useMemo(
        () => ({
            states: {
                'light.preview_group': buildGroupState(memberStates),
                ...memberStates,
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
                ...Object.fromEntries(
                    Object.entries(savedScenes).map(([entityId, scene]) => [
                        entityId,
                        {
                            state: 'on',
                            attributes: {
                                friendly_name: scene.friendly_name,
                            },
                        },
                    ])
                ),
            },
            callService: async (domain: string, service: string, serviceData: Record<string, unknown>) => {
                if (domain === 'scene' && service === 'turn_on' && typeof serviceData.entity_id === 'string') {
                    const selectedDemoScene = demoScenes[serviceData.entity_id as keyof typeof demoScenes];
                    if (selectedDemoScene) {
                        setMemberStates((previous) =>
                            Object.fromEntries(
                                Object.entries(previous).map(([lightEntityId, lightState]) => [
                                    lightEntityId,
                                    {
                                        ...lightState,
                                        state: selectedDemoScene.state,
                                        attributes: {
                                            ...lightState.attributes,
                                            brightness: selectedDemoScene.attributes.brightness,
                                            color_mode: selectedDemoScene.attributes.color_mode,
                                            color_temp: selectedDemoScene.attributes.color_temp,
                                            color_temp_kelvin: selectedDemoScene.attributes.color_temp_kelvin,
                                            hs_color: selectedDemoScene.attributes.hs_color,
                                        },
                                    },
                                ])
                            ) as typeof previous
                        );
                        return;
                    }

                    const savedScene = savedScenes[serviceData.entity_id];
                    if (!savedScene) return;

                    setMemberStates((previous) => {
                        const nextState = { ...previous };
                        for (const [lightEntityId, lightState] of Object.entries(savedScene.snapshot)) {
                            nextState[lightEntityId as keyof typeof nextState] = {
                                ...lightState,
                                attributes: { ...lightState.attributes },
                            };
                        }
                        return nextState;
                    });
                    return;
                }

                if (domain === 'scene' && service === 'create' && typeof serviceData.scene_id === 'string') {
                    const snapshotEntities = Array.isArray(serviceData.snapshot_entities)
                        ? serviceData.snapshot_entities.filter(
                              (entityId): entityId is string => typeof entityId === 'string' && entityId in memberStates
                          )
                        : [];

                    if (!snapshotEntities.length) return;

                    const nextEntityId = `scene.${serviceData.scene_id}`;
                    setSavedScenes((previous) => ({
                        ...previous,
                        [nextEntityId]: {
                            friendly_name: String(serviceData.scene_id).replace(/^dac_/, '').replace(/_/g, ' '),
                            snapshot: Object.fromEntries(
                                snapshotEntities.map((entityId) => [
                                    entityId,
                                    {
                                        ...memberStates[entityId as keyof typeof memberStates],
                                        attributes: {
                                            ...memberStates[entityId as keyof typeof memberStates].attributes,
                                        },
                                    },
                                ])
                            ),
                        },
                    }));
                    return;
                }

                if (domain === 'scene' && service === 'delete' && typeof serviceData.entity_id === 'string') {
                    const sceneEntityId = serviceData.entity_id;
                    setSavedScenes((previous) => {
                        const nextScenes = { ...previous };
                        delete nextScenes[sceneEntityId];
                        return nextScenes;
                    });
                    return;
                }

                if (domain !== 'light') return;

                setMemberStates((previous) => {
                    const targetEntityId = typeof serviceData.entity_id === 'string' ? serviceData.entity_id : '';
                    const targetIds =
                        targetEntityId === 'light.preview_group'
                            ? [...groupedLightIds]
                            : groupedLightIds.filter((entityId) => entityId === targetEntityId);

                    const nextState = { ...previous };
                    for (const nextEntityId of targetIds) {
                        const current = nextState[nextEntityId];
                        if (!current) continue;

                        const next = { ...current, attributes: { ...current.attributes } };

                        if (service === 'turn_off') {
                            next.state = 'off';
                            next.attributes.brightness = 0;
                            nextState[nextEntityId] = next;
                            continue;
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

                        nextState[nextEntityId] = next;
                    }

                    return nextState;
                });
            },
        }),
        [memberStates, savedScenes]
    );

    return (
        <div
            style={{
                minHeight: '100vh',
                background: isMobileDemo ? '#dfe4ec' : '#f3f4f6',
                padding: isMobileDemo ? '20px 12px' : '32px',
                boxSizing: 'border-box',
                fontFamily: 'system-ui, sans-serif',
                display: 'grid',
                placeItems: 'center',
            }}
        >
            <div
                style={{
                    width: isMobileDemo ? 'min(100%, 390px)' : '100%',
                    maxWidth: isMobileDemo ? '390px' : '520px',
                    margin: '0 auto',
                    minHeight: isMobileDemo ? '844px' : undefined,
                    borderRadius: isMobileDemo ? '32px' : undefined,
                    padding: isMobileDemo ? '18px 14px' : undefined,
                    background: isMobileDemo ? '#f7f8fb' : undefined,
                    boxShadow: isMobileDemo
                        ? '0 24px 60px rgba(15, 23, 42, 0.18), inset 0 0 0 1px rgba(255, 255, 255, 0.55)'
                        : undefined,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                }}
            >
                <CardApp hass={hass} entityId="light.preview_group" layout="compact" />
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    createRoot(rootElement).render(<MockHomeAssistant />);
}

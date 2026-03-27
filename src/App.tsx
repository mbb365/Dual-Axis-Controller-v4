import { useCallback, useEffect, useRef, useState } from 'react';
import { CompactCard, type CardLayout, type GroupedLightOption, type SceneOption } from './components/CompactCard';
import type { HaloMarker } from './components/Halo';
import { callLightService, getLightState } from './services/ha-connection';

const CONTROL_SEND_INTERVAL_MS = 120;
const CONTROL_SETTLE_DELAY_MS = 220;
const DISCO_SEND_INTERVAL_MS = 480;

interface QueuedControlCommand {
    entityId: string;
    turnOn: boolean;
    brightness: number;
    hue: number;
    saturation: number;
    uiMode: 'temperature' | 'spectrum';
    colorTempKelvin?: number;
    hsColor?: [number, number];
}

type ControlScope = 'group' | 'group-relative' | 'individual';

interface GroupRelativeMemberSnapshot {
    entityId: string;
    light: NonNullable<ReturnType<typeof getLightState>>;
    x: number;
    brightness: number;
}

interface GroupRelativeSnapshot {
    mode: 'temperature' | 'spectrum';
    averageBrightness: number;
    averageX: number;
    members: GroupRelativeMemberSnapshot[];
}

function getGroupedLightIds(light: ReturnType<typeof getLightState>) {
    if (!light) return [];

    const memberIds = [...(light.attributes.entity_id ?? []), ...(light.attributes.lights ?? [])];
    return Array.from(new Set(memberIds.filter((memberId) => memberId.startsWith('light.') && memberId !== light.entity_id)));
}

function formatGroupedLightValue(
    state: {
        state?: string;
        attributes?: {
            brightness?: number;
        };
    } | undefined
) {
    if (!state || state.state !== 'on') return 'Off';
    if (state.attributes?.brightness == null) return 'On';
    return `${Math.round((state.attributes.brightness / 255) * 100)}%`;
}

function getBrightnessPercent(
    state: {
        state?: string;
        attributes?: {
            brightness?: number;
        };
    } | null | undefined
) {
    if (!state || state.state !== 'on') return 0;
    if (state.attributes?.brightness == null) return 100;
    return Math.round((state.attributes.brightness / 255) * 100);
}

function getMarkerControlValues(
    state: ReturnType<typeof getLightState>,
    mode: 'temperature' | 'spectrum'
): Pick<HaloMarker, 'brightness' | 'hue' | 'saturation'> {
    const brightness = getBrightnessPercent(state);
    if (!state || state.state !== 'on') {
        return {
            brightness,
            hue: mode === 'temperature' ? 38 : 0,
            saturation: 0,
        };
    }

    if (mode === 'temperature') {
        if (state.attributes.color_temp_kelvin != null || state.attributes.color_temp != null) {
            const nextKelvin =
                state.attributes.color_temp_kelvin ||
                Math.round(1000000 / state.attributes.color_temp!);
            const minMireds = state.attributes.min_mireds || 153;
            const maxMireds = state.attributes.max_mireds || 500;
            const mireds = state.attributes.color_temp || 1000000 / nextKelvin;
            const x = Math.max(0, Math.min(1, (mireds - minMireds) / (maxMireds - minMireds)));

            return x < 0.5
                ? {
                      brightness,
                      hue: 210,
                      saturation: Math.round((0.5 - x) * 200),
                  }
                : {
                      brightness,
                      hue: 38,
                      saturation: Math.round((x - 0.5) * 200),
                  };
        }

        if (state.attributes.hs_color) {
            const [hue, saturation] = state.attributes.hs_color;
            return { brightness, hue, saturation };
        }

        return { brightness, hue: 38, saturation: 0 };
    }

    if (state.attributes.hs_color) {
        const [hue, saturation] = state.attributes.hs_color;
        return { brightness, hue, saturation };
    }

    if (state.attributes.color_temp_kelvin != null || state.attributes.color_temp != null) {
        const nextKelvin =
            state.attributes.color_temp_kelvin ||
            Math.round(1000000 / state.attributes.color_temp!);
        const minMireds = state.attributes.min_mireds || 153;
        const maxMireds = state.attributes.max_mireds || 500;
        const mireds = state.attributes.color_temp || 1000000 / nextKelvin;
        const x = Math.max(0, Math.min(1, (mireds - minMireds) / (maxMireds - minMireds)));

        return x < 0.5
            ? {
                  brightness,
                  hue: 210,
                  saturation: Math.round((0.5 - x) * 200),
              }
            : {
                  brightness,
                  hue: 38,
                  saturation: Math.round((x - 0.5) * 200),
              };
    }

    return { brightness, hue: 0, saturation: 0 };
}

function xFractionFromHueSat(hue: number, saturation: number, mode: 'temperature' | 'spectrum') {
    if (mode === 'spectrum') {
        return Math.max(0, Math.min(1, hue / 360));
    }

    const leftHue = 210;
    const rightHue = 38;
    const coolDist = Math.abs(hue - leftHue);
    const warmDist = Math.abs(hue - rightHue);

    if (coolDist < warmDist) {
        return Math.max(0, Math.min(1, 0.5 - saturation / 200));
    }

    return Math.max(0, Math.min(1, 0.5 + saturation / 200));
}

function controlValuesFromPosition(
    x: number,
    brightness: number,
    mode: 'temperature' | 'spectrum'
): Pick<HaloMarker, 'brightness' | 'hue' | 'saturation'> {
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedBrightness = Math.max(0, Math.min(100, brightness));

    if (mode === 'spectrum') {
        return {
            brightness: clampedBrightness,
            hue: Math.round(clampedX * 360),
            saturation: 100,
        };
    }

    if (clampedX < 0.5) {
        return {
            brightness: clampedBrightness,
            hue: 210,
            saturation: Math.round((0.5 - clampedX) * 200),
        };
    }

    return {
        brightness: clampedBrightness,
        hue: 38,
        saturation: Math.round((clampedX - 0.5) * 200),
    };
}

function supportsTemperatureForLight(light: ReturnType<typeof getLightState>) {
    const supportedColorModes = light?.attributes.supported_color_modes || [];
    return (
        supportedColorModes.includes('color_temp') ||
        light?.attributes.color_mode === 'color_temp' ||
        light?.attributes.min_mireds != null ||
        light?.attributes.max_mireds != null
    );
}

function supportsSpectrumForLight(light: ReturnType<typeof getLightState>) {
    const supportedColorModes = light?.attributes.supported_color_modes || [];
    return (
        supportedColorModes.some((mode) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(mode)) ||
        (light?.attributes.hs_color != null && light?.attributes.color_mode !== 'color_temp')
    );
}

function kelvinFromXPosition(x: number, light: ReturnType<typeof getLightState>) {
    const minMireds = light?.attributes.min_mireds || 153;
    const maxMireds = light?.attributes.max_mireds || 500;
    const mireds = Math.round(minMireds + Math.max(0, Math.min(1, x)) * (maxMireds - minMireds));
    return Math.round(1000000 / mireds);
}

function buildQueuedControlCommand(
    entityId: string,
    targetLight: ReturnType<typeof getLightState>,
    values: Pick<HaloMarker, 'brightness' | 'hue' | 'saturation'>,
    mode: 'temperature' | 'spectrum'
): QueuedControlCommand {
    const command: QueuedControlCommand = {
        entityId,
        turnOn: values.brightness > 0,
        brightness: values.brightness,
        hue: values.hue,
        saturation: values.saturation,
        uiMode: mode,
    };

    if (!command.turnOn) {
        return command;
    }

    if (mode === 'temperature') {
        const x = xFractionFromHueSat(values.hue, values.saturation, 'temperature');
        const nextKelvin = kelvinFromXPosition(x, targetLight);

        if (supportsTemperatureForLight(targetLight)) {
            command.colorTempKelvin = nextKelvin;
        } else if (supportsSpectrumForLight(targetLight)) {
            command.hsColor = [values.hue, values.saturation];
        }

        return command;
    }

    if (supportsSpectrumForLight(targetLight)) {
        command.hsColor = [values.hue, values.saturation];
        return command;
    }

    if (supportsTemperatureForLight(targetLight)) {
        const fallbackX = xFractionFromHueSat(values.hue, values.saturation, 'temperature');
        command.colorTempKelvin = kelvinFromXPosition(fallbackX, targetLight);
    }

    return command;
}

export interface CardAppProps {
    hass: any;
    entityId: string;
    icon?: string;
    name?: string;
    layout?: CardLayout | 'auto';
    onTapAction?: () => void;
    onHoldAction?: () => void;
    onDoubleTapAction?: () => void;
}

export function CardApp({
    hass,
    entityId,
    icon = 'mdi:lightbulb',
    name,
    layout = 'compact',
    onTapAction,
    onHoldAction,
    onDoubleTapAction,
}: CardAppProps) {
    const allStates = (hass?.states ?? {}) as Record<
        string,
        {
            state?: string;
            attributes?: {
                friendly_name?: string;
                brightness?: number;
            };
        }
    >;
    const groupLight = getLightState(hass, entityId);
    const groupedLightIds = getGroupedLightIds(groupLight);
    const [controlScope, setControlScope] = useState<ControlScope>('group');
    const [controlledLightEntityId, setControlledLightEntityId] = useState<string | null>(null);

    useEffect(() => {
        if (!groupedLightIds.length) {
            setControlScope('group');
            setControlledLightEntityId(null);
            return;
        }

        setControlledLightEntityId((current) =>
            current && groupedLightIds.includes(current) ? current : groupedLightIds[0]
        );
    }, [groupedLightIds]);

    const activeEntityId =
        controlScope === 'individual' && controlledLightEntityId ? controlledLightEntityId : entityId;
    const light = getLightState(hass, activeEntityId) ?? groupLight;
    const lightName = name || light?.attributes.friendly_name || entityId;
    const activeEntityIdRef = useRef(activeEntityId);
    const supportedColorModes = light?.attributes.supported_color_modes || [];
    const supportsTemperature =
        supportedColorModes.includes('color_temp') ||
        light?.attributes.color_mode === 'color_temp' ||
        light?.attributes.min_mireds != null ||
        light?.attributes.max_mireds != null;
    const supportsSpectrum =
        supportedColorModes.some((mode) => ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(mode)) ||
        (light?.attributes.hs_color != null && light?.attributes.color_mode !== 'color_temp');
    const sceneOptions: SceneOption[] = Object.entries(allStates)
        .filter(([sceneEntityId, sceneState]) => sceneEntityId.startsWith('scene.') && sceneState?.state !== 'unavailable')
        .map(([sceneEntityId, sceneState]) => ({
            entityId: sceneEntityId,
            name: sceneState.attributes?.friendly_name || sceneEntityId.replace(/^scene\./, '').replace(/_/g, ' '),
        }))
        .sort((left, right) => left.name.localeCompare(right.name));
    const rootRef = useRef<HTMLDivElement>(null);
    const lastCommandTime = useRef(0);
    const isUserInteracting = useRef(false);
    const interactionTimeout = useRef<number | null>(null);
    const controlSendTimeout = useRef<number | null>(null);
    const controlBatchInFlight = useRef(false);
    const discoSendInterval = useRef<number | null>(null);
    const discoBatchInFlight = useRef(false);
    const sceneFeedbackTimeout = useRef<number | null>(null);
    const pendingControlCommand = useRef<QueuedControlCommand[] | null>(null);
    const lastSentControlCommand = useRef<QueuedControlCommand[] | null>(null);
    const groupRelativeLayout = useRef<GroupRelativeSnapshot | null>(null);
    const groupRelativeInteractionSnapshot = useRef<GroupRelativeSnapshot | null>(null);

    const [containerWidth, setContainerWidth] = useState(0);
    const [hue, setHue] = useState(0);
    const [saturation, setSaturation] = useState(0);
    const [brightness, setBrightness] = useState(50);
    const [kelvin, setKelvin] = useState<number | null>(null);
    const [isOn, setIsOn] = useState(false);
    const [uiMode, setUiMode] = useState<'temperature' | 'spectrum'>('temperature');
    const [selectedSceneName, setSelectedSceneName] = useState<string | null>(null);
    const [sceneFeedbackMessage, setSceneFeedbackMessage] = useState<string | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    const [isDiscoMode, setIsDiscoMode] = useState(false);

    const groupedLights: GroupedLightOption[] = groupedLightIds
        .map((memberId) => {
            const memberState = getLightState(hass, memberId);
            if (!memberState) return null;
            const previewMode =
                memberState.attributes.color_temp_kelvin != null ||
                memberState.attributes.color_temp != null ||
                memberState.attributes.color_mode === 'color_temp'
                    ? 'temperature'
                    : 'spectrum';
            const previewValues = getMarkerControlValues(memberState, previewMode);

            return {
                entityId: memberId,
                isOn: memberState.state === 'on',
                name: memberState.attributes.friendly_name || memberId,
                previewBrightness: previewValues.brightness,
                previewHue: previewValues.hue,
                previewMode,
                previewSaturation: previewValues.saturation,
                value: formatGroupedLightValue(memberState),
            };
        })
        .filter((member): member is GroupedLightOption => member != null);
    const groupedLightIdsKey = groupedLightIds.join('|');

    const groupedLightMarkers =
        controlScope === 'group-relative' && groupRelativeLayout.current?.mode === uiMode
            ? groupRelativeLayout.current.members.map((member) => ({
                  entityId: member.entityId,
                  isOn: member.brightness > 0,
                  isActive: false,
                  ...controlValuesFromPosition(member.x, member.brightness, uiMode),
              }))
            : groupedLightIds.reduce<HaloMarker[]>((markers, memberId) => {
                  const memberState = getLightState(hass, memberId);
                  if (!memberState) return markers;

                  const controlValues = getMarkerControlValues(memberState, uiMode);

                  markers.push({
                      entityId: memberId,
                      isOn: memberState.state === 'on',
                      isActive: controlScope === 'individual' && controlledLightEntityId === memberId,
                      ...controlValues,
                  });

                  return markers;
              }, []);

    const buildGroupRelativeLayout = useCallback(() => {
        const members = groupedLightIds
            .map((memberId) => {
                const memberLight = getLightState(hass, memberId);
                if (!memberLight) return null;

                const values = getMarkerControlValues(memberLight, uiMode);
                return {
                    entityId: memberId,
                    light: memberLight,
                    x: xFractionFromHueSat(values.hue, values.saturation, uiMode),
                    brightness: values.brightness,
                };
            })
            .filter(
                (
                    member
                ): member is {
                    entityId: string;
                    light: NonNullable<ReturnType<typeof getLightState>>;
                    x: number;
                    brightness: number;
                } => member != null
            );

        if (!members.length) {
            groupRelativeLayout.current = null;
            return null;
        }

        const snapshot = {
            mode: uiMode,
            averageX: members.reduce((total, member) => total + member.x, 0) / members.length,
            averageBrightness: members.reduce((total, member) => total + member.brightness, 0) / members.length,
            members,
        };

        groupRelativeLayout.current = snapshot;
        return snapshot;
    }, [groupedLightIds, hass, uiMode]);

    const ensureGroupRelativeLayout = useCallback(() => {
        if (groupRelativeLayout.current?.mode === uiMode) {
            return groupRelativeLayout.current;
        }

        return buildGroupRelativeLayout();
    }, [buildGroupRelativeLayout, uiMode]);

    useEffect(() => {
        activeEntityIdRef.current = activeEntityId;
    }, [activeEntityId]);

    useEffect(() => {
        if (!rootRef.current) return;

        const node = rootRef.current;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            setContainerWidth(entry.contentRect.width);
        });

        observer.observe(node);
        setContainerWidth(node.getBoundingClientRect().width);

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        return () => {
            if (interactionTimeout.current) {
                window.clearTimeout(interactionTimeout.current);
            }
            if (controlSendTimeout.current) {
                window.clearTimeout(controlSendTimeout.current);
            }
            if (discoSendInterval.current) {
                window.clearInterval(discoSendInterval.current);
                discoSendInterval.current = null;
            }
            controlBatchInFlight.current = false;
            discoBatchInFlight.current = false;
            if (sceneFeedbackTimeout.current) {
                window.clearTimeout(sceneFeedbackTimeout.current);
            }
        };
    }, []);

    useEffect(() => {
        pendingControlCommand.current = null;
        lastSentControlCommand.current = null;
        groupRelativeInteractionSnapshot.current = null;
        if (controlSendTimeout.current) {
            window.clearTimeout(controlSendTimeout.current);
            controlSendTimeout.current = null;
        }
        controlBatchInFlight.current = false;
        if (discoSendInterval.current) {
            window.clearInterval(discoSendInterval.current);
            discoSendInterval.current = null;
        }
        discoBatchInFlight.current = false;
        setIsDiscoMode(false);
    }, [activeEntityId, controlScope]);

    useEffect(() => {
        groupRelativeLayout.current = null;
        groupRelativeInteractionSnapshot.current = null;
    }, [entityId, groupedLightIds.join('|'), uiMode]);

    useEffect(() => {
        if (controlScope === 'group-relative' && groupedLightIds.length) {
            const relativeLayout = ensureGroupRelativeLayout();

            if (relativeLayout && !isUserInteracting.current && !isDiscoMode) {
                const averageValues = controlValuesFromPosition(
                    relativeLayout.averageX,
                    relativeLayout.averageBrightness,
                    uiMode
                );
                setIsOn(relativeLayout.members.some((member) => member.brightness > 0));
                setHue(averageValues.hue);
                setSaturation(averageValues.saturation);
                setBrightness(averageValues.brightness);
                setKelvin(uiMode === 'temperature' ? kelvinFromXPosition(relativeLayout.averageX, groupLight ?? light) : null);
            }
            return;
        }

        const nextLight = light ?? groupLight;
        if (!nextLight || isUserInteracting.current || isDiscoMode) return;

        setIsOn(nextLight.state === 'on');

        if (nextLight.attributes.brightness !== undefined) {
            setBrightness(Math.round((nextLight.attributes.brightness / 255) * 100));
        }

        if (nextLight.attributes.hs_color) {
            setHue(nextLight.attributes.hs_color[0]);
            setSaturation(nextLight.attributes.hs_color[1]);
        }

        if (nextLight.attributes.color_temp_kelvin != null || nextLight.attributes.color_temp != null) {
            const nextKelvin =
                nextLight.attributes.color_temp_kelvin ||
                Math.round(1000000 / nextLight.attributes.color_temp!);
            setKelvin(nextKelvin);

            const minM = nextLight.attributes.min_mireds || 153;
            const maxM = nextLight.attributes.max_mireds || 500;
            const lightMireds = nextLight.attributes.color_temp || 1000000 / nextKelvin;
            const x = Math.max(0, Math.min(1, (lightMireds - minM) / (maxM - minM)));

            if (x < 0.5) {
                setHue(210);
                setSaturation(Math.round((0.5 - x) * 200));
            } else {
                setHue(38);
                setSaturation(Math.round((x - 0.5) * 200));
            }
        } else if (nextLight.attributes.hs_color) {
            const [nextHue, nextSaturation] = nextLight.attributes.hs_color;
            const x =
                Math.abs(nextHue - 210) < Math.abs(nextHue - 38)
                    ? 0.5 - nextSaturation / 200
                    : 0.5 + nextSaturation / 200;
            const minM = nextLight.attributes.min_mireds || 153;
            const maxM = nextLight.attributes.max_mireds || 500;
            const mireds = Math.round(minM + Math.max(0, Math.min(1, x)) * (maxM - minM));
            setKelvin(Math.round(1000000 / mireds));
        }

        setUiMode((previousMode) => {
            const isColorMode = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(
                nextLight.attributes.color_mode || ''
            );

            if (nextLight.attributes.color_mode === 'color_temp' || !supportsSpectrum) {
                return 'temperature';
            }

            if (isColorMode) {
                if (previousMode === 'spectrum') return 'spectrum';

                if (nextLight.attributes.hs_color) {
                    const [nextHue, nextSaturation] = nextLight.attributes.hs_color;
                    const isWhiteish = nextSaturation < 8;
                    const isCoolOrWarm =
                        Math.abs(nextHue - 210) < 22 || Math.abs(nextHue - 38) < 22;

                    if (!isWhiteish && !isCoolOrWarm && nextSaturation > 15) {
                        return 'spectrum';
                    }
                }
            }

            return 'temperature';
        });
    }, [activeEntityId, controlScope, ensureGroupRelativeLayout, groupLight, groupedLightIds, hass, isDiscoMode, light, supportsSpectrum, uiMode]);

    const resolvedLayout: CardLayout =
        layout === 'auto' ? (containerWidth >= 420 ? 'expanded' : 'compact') : layout;

    const markInteraction = useCallback((delayMs: number) => {
        isUserInteracting.current = true;
        if (interactionTimeout.current) window.clearTimeout(interactionTimeout.current);
        interactionTimeout.current = window.setTimeout(() => {
            isUserInteracting.current = false;
        }, delayMs);
    }, []);

    const clearInteractionLock = useCallback(() => {
        isUserInteracting.current = false;
        if (interactionTimeout.current) {
            window.clearTimeout(interactionTimeout.current);
            interactionTimeout.current = null;
        }
    }, []);

    const stopDiscoMode = useCallback(() => {
        if (discoSendInterval.current) {
            window.clearInterval(discoSendInterval.current);
            discoSendInterval.current = null;
        }
        discoBatchInFlight.current = false;
        setIsDiscoMode(false);
    }, []);

    const startDiscoMode = useCallback(() => {
        pendingControlCommand.current = null;
        lastSentControlCommand.current = null;
        lastCommandTime.current = 0;
        if (controlSendTimeout.current) {
            window.clearTimeout(controlSendTimeout.current);
            controlSendTimeout.current = null;
        }
        controlBatchInFlight.current = false;
        groupRelativeInteractionSnapshot.current = null;
        setSelectedSceneName(null);
        setSceneFeedbackMessage(null);
        setUiMode('spectrum');
        setKelvin(null);
        setHue(0);
        setSaturation(100);
        setBrightness(88);
        setIsOn(true);
        markInteraction(1200);
        setIsDiscoMode(true);
    }, [markInteraction]);

    const endControlInteraction = useCallback(() => {
        if (interactionTimeout.current) {
            window.clearTimeout(interactionTimeout.current);
        }
        interactionTimeout.current = window.setTimeout(() => {
            isUserInteracting.current = false;
            interactionTimeout.current = null;
        }, CONTROL_SETTLE_DELAY_MS);
    }, []);

    useEffect(() => {
        if (!isDiscoMode) {
            if (discoSendInterval.current) {
                window.clearInterval(discoSendInterval.current);
                discoSendInterval.current = null;
            }
            discoBatchInFlight.current = false;
            return;
        }

        let step = 0;
        const targetIds = groupedLightIds.length ? groupedLightIds : [activeEntityId];

        const applyDiscoFrame = () => {
            if (!targetIds.length || discoBatchInFlight.current) return;

            const baseHue = (step * 34) % 360;
            const commands = targetIds.map((targetId, index) => {
                const hueOffset = targetIds.length > 1 ? (360 / targetIds.length) * index : 0;
                const brightnessWave = (Math.sin((step + index) * 0.9) + 1) / 2;
                return {
                    entityId: targetId,
                    brightness: 78 + Math.round(brightnessWave * 18),
                    hsColor: [Math.round((baseHue + hueOffset) % 360), 100] as [number, number],
                };
            });

            discoBatchInFlight.current = true;
            setUiMode('spectrum');
            setKelvin(null);
            setIsOn(true);
            setHue(commands[0]?.hsColor[0] ?? 0);
            setSaturation(100);
            setBrightness(
                Math.round(commands.reduce((total, command) => total + command.brightness, 0) / commands.length)
            );

            void Promise.all(
                commands.map((command) =>
                    callLightService(hass, command.entityId, true, {
                        brightness: command.brightness,
                        hs_color: command.hsColor,
                    })
                )
            ).finally(() => {
                discoBatchInFlight.current = false;
            });

            step += 1;
        };

        applyDiscoFrame();
        discoSendInterval.current = window.setInterval(applyDiscoFrame, DISCO_SEND_INTERVAL_MS);

        return () => {
            if (discoSendInterval.current) {
                window.clearInterval(discoSendInterval.current);
                discoSendInterval.current = null;
            }
            discoBatchInFlight.current = false;
        };
    }, [activeEntityId, groupedLightIdsKey, hass, isDiscoMode]);

    const hasMeaningfulControlDelta = useCallback(
        (left: QueuedControlCommand | null, right: QueuedControlCommand) => {
            if (!left) return true;
            if (left.turnOn !== right.turnOn || left.uiMode !== right.uiMode) return true;
            if (Math.abs(left.brightness - right.brightness) >= 1) return true;

            if (right.colorTempKelvin !== undefined || left.colorTempKelvin !== undefined) {
                return Math.abs((left.colorTempKelvin ?? 0) - (right.colorTempKelvin ?? 0)) >= 18;
            }

            if (right.hsColor || left.hsColor) {
                const [leftHue, leftSat] = left.hsColor ?? [left.hue, left.saturation];
                const [rightHue, rightSat] = right.hsColor ?? [right.hue, right.saturation];
                return Math.abs(leftHue - rightHue) >= 2 || Math.abs(leftSat - rightSat) >= 2;
            }

            return Math.abs(left.hue - right.hue) >= 2 || Math.abs(left.saturation - right.saturation) >= 2;
        },
        []
    );

    const hasMeaningfulControlBatchDelta = useCallback(
        (left: QueuedControlCommand[] | null, right: QueuedControlCommand[]) => {
            if (!left) return true;
            if (left.length !== right.length) return true;

            return right.some((command, index) => {
                const previous = left[index];
                if (!previous) return true;
                if (previous.entityId !== command.entityId) return true;
                return hasMeaningfulControlDelta(previous, command);
            });
        },
        [hasMeaningfulControlDelta]
    );

    const flushQueuedControlCommand = useCallback(
        (force = false) => {
            const queuedCommand = pendingControlCommand.current;
            if (!queuedCommand) return;
            if (controlBatchInFlight.current) return;

            const now = Date.now();
            const timeUntilNextSend = CONTROL_SEND_INTERVAL_MS - (now - lastCommandTime.current);
            if (!force && timeUntilNextSend > 0) {
                if (!controlSendTimeout.current) {
                    controlSendTimeout.current = window.setTimeout(() => {
                        controlSendTimeout.current = null;
                        flushQueuedControlCommand(true);
                    }, timeUntilNextSend);
                }
                return;
            }

            if (controlSendTimeout.current) {
                window.clearTimeout(controlSendTimeout.current);
                controlSendTimeout.current = null;
            }

            if (!hasMeaningfulControlBatchDelta(lastSentControlCommand.current, queuedCommand)) {
                pendingControlCommand.current = null;
                return;
            }

            pendingControlCommand.current = null;
            lastSentControlCommand.current = queuedCommand;
            lastCommandTime.current = now;
            controlBatchInFlight.current = true;

            void Promise.all(
                queuedCommand.map((command) =>
                    callLightService(hass, command.entityId, command.turnOn, {
                        brightness: command.brightness,
                        hs_color: command.hsColor,
                        color_temp_kelvin: command.colorTempKelvin,
                    })
                )
            )
                .catch((error) => {
                    console.error('[Dual Halo Controller] Failed to apply control batch', {
                        entityId: activeEntityId,
                        queuedCommand,
                        error,
                    });
                })
                .finally(() => {
                    controlBatchInFlight.current = false;

                    if (!pendingControlCommand.current) return;

                    const nextDelay = Math.max(0, CONTROL_SEND_INTERVAL_MS - (Date.now() - lastCommandTime.current));
                    if (nextDelay > 0) {
                        if (!controlSendTimeout.current) {
                            controlSendTimeout.current = window.setTimeout(() => {
                                controlSendTimeout.current = null;
                                flushQueuedControlCommand(true);
                            }, nextDelay);
                        }
                        return;
                    }

                    flushQueuedControlCommand(true);
                });
        },
        [activeEntityId, hass, hasMeaningfulControlBatchDelta]
    );

    const queueControlCommand = useCallback(
        (command: QueuedControlCommand[]) => {
            pendingControlCommand.current = command;
            flushQueuedControlCommand(false);
        },
        [flushQueuedControlCommand]
    );

    const beginControlInteraction = useCallback(() => {
        isUserInteracting.current = true;
        if (interactionTimeout.current) {
            window.clearTimeout(interactionTimeout.current);
            interactionTimeout.current = null;
        }

        if (controlScope === 'group-relative') {
            groupRelativeInteractionSnapshot.current = ensureGroupRelativeLayout();
        } else {
            groupRelativeInteractionSnapshot.current = null;
            groupRelativeLayout.current = null;
        }
    }, [controlScope, ensureGroupRelativeLayout]);

    const handleControlsChange = useCallback(
        (nextHue: number, nextSaturation: number, nextBrightness: number) => {
            stopDiscoMode();
            beginControlInteraction();

            setSelectedSceneName(null);
            setHue(nextHue);
            setSaturation(nextSaturation);
            setBrightness(nextBrightness);

            if (uiMode === 'temperature') {
                setKelvin(kelvinFromXPosition(xFractionFromHueSat(nextHue, nextSaturation, 'temperature'), light));
            } else {
                setKelvin(null);
            }

            if (controlScope === 'group-relative' && groupedLightIds.length) {
                const snapshot = groupRelativeInteractionSnapshot.current ?? ensureGroupRelativeLayout();
                if (!snapshot) return;

                const nextX = xFractionFromHueSat(nextHue, nextSaturation, uiMode);
                const deltaX = nextX - snapshot.averageX;
                const deltaBrightness = nextBrightness - snapshot.averageBrightness;

                const nextRelativeLayout: GroupRelativeSnapshot = {
                    mode: uiMode,
                    averageX: snapshot.averageX + deltaX,
                    averageBrightness: snapshot.averageBrightness + deltaBrightness,
                    members: snapshot.members.map((member) => ({
                        ...member,
                        x: member.x + deltaX,
                        brightness: member.brightness + deltaBrightness,
                    })),
                };

                groupRelativeLayout.current = nextRelativeLayout;

                const relativeCommands = nextRelativeLayout.members.map((member) =>
                    buildQueuedControlCommand(
                        member.entityId,
                        member.light,
                        controlValuesFromPosition(member.x, member.brightness, uiMode),
                        uiMode
                    )
                );

                queueControlCommand(relativeCommands);
                return;
            }

            const nextCommand = buildQueuedControlCommand(
                activeEntityIdRef.current,
                getLightState(hass, activeEntityIdRef.current) ?? light,
                {
                    brightness: nextBrightness,
                    hue: nextHue,
                    saturation: nextSaturation,
                },
                uiMode
            );

            queueControlCommand([nextCommand]);
        },
        [
            beginControlInteraction,
            controlScope,
            ensureGroupRelativeLayout,
            groupedLightIds,
            hass,
            light,
            queueControlCommand,
            stopDiscoMode,
            uiMode,
        ]
    );

    const handleControlInteractionEnd = useCallback(() => {
        flushQueuedControlCommand(true);
        groupRelativeInteractionSnapshot.current = null;
        endControlInteraction();
    }, [endControlInteraction, flushQueuedControlCommand]);

    const handleToggle = useCallback(() => {
        stopDiscoMode();
        const nextState = !isOn;
        setSelectedSceneName(null);
        setIsOn(nextState);
        markInteraction(1000);
        groupRelativeLayout.current = null;
        groupRelativeInteractionSnapshot.current = null;
        callLightService(hass, activeEntityIdRef.current, nextState);
    }, [hass, isOn, markInteraction, stopDiscoMode]);

    const handleCompactToggle = useCallback(() => {
        if (!groupLight) return;

        stopDiscoMode();
        const nextState = groupLight.state !== 'on';
        setSelectedSceneName(null);
        setIsOn(nextState);
        markInteraction(1000);
        groupRelativeLayout.current = null;
        groupRelativeInteractionSnapshot.current = null;
        callLightService(hass, entityId, nextState);
    }, [entityId, groupLight, hass, markInteraction, stopDiscoMode]);

    const handleModeChange = useCallback(
        (mode: 'temperature' | 'spectrum') => {
            if (mode === 'temperature' && !supportsTemperature) return;
            if (mode === 'spectrum' && !supportsSpectrum) return;

            stopDiscoMode();
            setSelectedSceneName(null);
            setUiMode(mode);
            markInteraction(1000);
            groupRelativeLayout.current = null;
            groupRelativeInteractionSnapshot.current = null;
        },
        [markInteraction, stopDiscoMode, supportsSpectrum, supportsTemperature]
    );

    const handleSceneSelect = useCallback(
        async (sceneEntityId: string) => {
            stopDiscoMode();
            clearInteractionLock();
            groupRelativeLayout.current = null;
            groupRelativeInteractionSnapshot.current = null;
            const selectedScene = sceneOptions.find((scene) => scene.entityId === sceneEntityId);
            setSceneFeedbackMessage(null);

            if (sceneFeedbackTimeout.current) {
                window.clearTimeout(sceneFeedbackTimeout.current);
                sceneFeedbackTimeout.current = null;
            }

            console.info('[Dual Halo Controller] Applying scene', {
                lightEntityId: entityId,
                sceneEntityId,
                sceneName: selectedScene?.name ?? null,
            });

            try {
                await hass.callService('scene', 'turn_on', { entity_id: sceneEntityId });
                setSelectedSceneName(selectedScene?.name ?? null);
            } catch (error) {
                const detail = error instanceof Error ? error.message : 'Home Assistant did not accept the scene.';
                console.error('[Dual Halo Controller] Failed to apply scene', {
                    lightEntityId: entityId,
                    sceneEntityId,
                    error,
                });

                setSceneFeedbackMessage(`Couldn't apply ${selectedScene?.name ?? 'scene'}. ${detail}`);
                sceneFeedbackTimeout.current = window.setTimeout(() => {
                    setSceneFeedbackMessage(null);
                    sceneFeedbackTimeout.current = null;
                }, 5000);
            }
        },
        [clearInteractionLock, entityId, hass, sceneOptions, stopDiscoMode]
    );

    const handleTap = useCallback(() => {
        if (onTapAction) {
            onTapAction();
            return;
        }

        if (resolvedLayout === 'compact') {
            setShowPopup(true);
        }
    }, [onTapAction, resolvedLayout]);

    const handleGroupedLightSelect = useCallback((nextEntityId: string) => {
        activeEntityIdRef.current = nextEntityId;
        stopDiscoMode();
        setControlScope('individual');
        setControlledLightEntityId(nextEntityId);
    }, [stopDiscoMode]);

    const handleGroupedLightToggle = useCallback(
        (nextEntityId: string) => {
            const targetLight = getLightState(hass, nextEntityId);
            if (!targetLight) return;

            stopDiscoMode();
            setSelectedSceneName(null);
            groupRelativeLayout.current = null;
            groupRelativeInteractionSnapshot.current = null;

            void callLightService(hass, nextEntityId, targetLight.state !== 'on');
        },
        [hass, stopDiscoMode]
    );

    const handleControlScopeChange = useCallback((nextScope: 'group' | 'group-relative') => {
        stopDiscoMode();
        if (nextScope === 'group-relative') {
            const relativeLayout = ensureGroupRelativeLayout();
            if (relativeLayout) {
                const averageValues = controlValuesFromPosition(
                    relativeLayout.averageX,
                    relativeLayout.averageBrightness,
                    uiMode
                );
                setIsOn(relativeLayout.members.some((member) => member.brightness > 0));
                setHue(averageValues.hue);
                setSaturation(averageValues.saturation);
                setBrightness(averageValues.brightness);
                setKelvin(uiMode === 'temperature' ? kelvinFromXPosition(relativeLayout.averageX, groupLight ?? light) : null);
            }
        }

        setControlScope(nextScope);
    }, [ensureGroupRelativeLayout, groupLight, light, stopDiscoMode, uiMode]);

    if (!groupLight) {
        return (
            <div ref={rootRef}>
                <div
                    style={{
                        padding: '20px',
                        color: '#ffb3b3',
                        background: '#1a1a1a',
                        borderRadius: '12px',
                        border: '1px solid #ff4d4d',
                    }}
                >
                    <strong>Light not found:</strong> {entityId}
                    <br />
                    <small style={{ opacity: 0.7 }}>
                        Ensure the entity ID is correct and starts with "light."
                    </small>
                </div>
            </div>
        );
    }

    const compactLightName = name || groupLight.attributes.friendly_name || entityId;
    const compactUiMode =
        groupLight.attributes.color_temp_kelvin != null ||
        groupLight.attributes.color_temp != null ||
        groupLight.attributes.color_mode === 'color_temp' ||
        !supportsSpectrumForLight(groupLight)
            ? 'temperature'
            : supportsSpectrumForLight(groupLight)
              ? 'spectrum'
              : uiMode;
    const compactValues = getMarkerControlValues(groupLight, compactUiMode);
    const compactKelvin =
        compactUiMode === 'temperature'
            ? groupLight.attributes.color_temp_kelvin ||
              (groupLight.attributes.color_temp != null
                  ? Math.round(1000000 / groupLight.attributes.color_temp)
                  : kelvinFromXPosition(
                        xFractionFromHueSat(compactValues.hue, compactValues.saturation, 'temperature'),
                        groupLight
                    ))
            : null;
    const compactBrightness = compactValues.brightness;
    const compactHue = compactValues.hue;
    const compactSaturation = compactValues.saturation;
    const compactIsOn = groupLight.state === 'on';

    return (
        <div ref={rootRef}>
            <CompactCard
                layout={resolvedLayout}
                lightName={resolvedLayout === 'compact' ? compactLightName : lightName}
                icon={icon}
                isOn={resolvedLayout === 'compact' ? compactIsOn : isOn}
                hue={resolvedLayout === 'compact' ? compactHue : hue}
                saturation={resolvedLayout === 'compact' ? compactSaturation : saturation}
                brightness={resolvedLayout === 'compact' ? compactBrightness : brightness}
                kelvin={resolvedLayout === 'compact' ? compactKelvin : kelvin}
                uiMode={resolvedLayout === 'compact' ? compactUiMode : uiMode}
                canUseTemperature={supportsTemperature}
                canUseSpectrum={supportsSpectrum}
                onModeChange={handleModeChange}
                onControlsChange={handleControlsChange}
                onControlInteractionStart={beginControlInteraction}
                onControlInteractionEnd={handleControlInteractionEnd}
                isDiscoMode={isDiscoMode}
                onDiscoModeTrigger={startDiscoMode}
                onDiscoModeExit={stopDiscoMode}
                onPadMarkerSelect={groupedLights.length ? handleGroupedLightSelect : undefined}
                onToggle={resolvedLayout === 'compact' ? handleCompactToggle : handleToggle}
                sceneOptions={sceneOptions}
                selectedSceneName={selectedSceneName}
                sceneFeedbackMessage={sceneFeedbackMessage}
                groupedLights={groupedLights}
                groupedLightMarkers={groupedLightMarkers}
                controlScope={controlScope}
                controlledLightEntityId={controlledLightEntityId}
                onControlScopeChange={handleControlScopeChange}
                onGroupedLightSelect={handleGroupedLightSelect}
                onGroupedLightToggle={handleGroupedLightToggle}
                onSceneSelect={handleSceneSelect}
                onTapAction={handleTap}
                onHoldAction={onHoldAction}
                onDoubleTapAction={onDoubleTapAction}
            />

            {resolvedLayout === 'compact' && showPopup ? (
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
                        zIndex: 1000,
                    }}
                >
                    <div
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            width: 'min(100%, 460px)',
                            background: 'var(--ha-card-background, var(--card-background-color, #ffffff))',
                            borderRadius: 'var(--ha-card-border-radius, 12px)',
                            boxShadow: 'var(--ha-card-box-shadow, 0 8px 24px rgba(15, 23, 42, 0.16))',
                            border: '1px solid var(--divider-color, rgba(0, 0, 0, 0.08))',
                            padding: '16px',
                            boxSizing: 'border-box',
                        }}
                    >
                        <CompactCard
                            layout="expanded"
                            lightName={lightName}
                            icon={icon}
                            isOn={isOn}
                            hue={hue}
                            saturation={saturation}
                            brightness={brightness}
                            kelvin={kelvin}
                            uiMode={uiMode}
                            canUseTemperature={supportsTemperature}
                            canUseSpectrum={supportsSpectrum}
                            onModeChange={handleModeChange}
                            onControlsChange={handleControlsChange}
                            onControlInteractionStart={beginControlInteraction}
                            onControlInteractionEnd={handleControlInteractionEnd}
                            isDiscoMode={isDiscoMode}
                            onDiscoModeTrigger={startDiscoMode}
                            onDiscoModeExit={stopDiscoMode}
                            onPadMarkerSelect={groupedLights.length ? handleGroupedLightSelect : undefined}
                            onToggle={handleToggle}
                            sceneOptions={sceneOptions}
                            selectedSceneName={selectedSceneName}
                            sceneFeedbackMessage={sceneFeedbackMessage}
                            groupedLights={groupedLights}
                            groupedLightMarkers={groupedLightMarkers}
                            controlScope={controlScope}
                            controlledLightEntityId={controlledLightEntityId}
                            onControlScopeChange={handleControlScopeChange}
                            onGroupedLightSelect={handleGroupedLightSelect}
                            onGroupedLightToggle={handleGroupedLightToggle}
                            onSceneSelect={handleSceneSelect}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default CardApp;

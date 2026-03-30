import { useCallback, useEffect, useRef, useState } from 'react';
import { CompactCard, type CardLayout, type GroupedLightOption, type SceneOption } from './components/CompactCard';
import { PopupCardShell } from './components/card-popup/PopupCardShell';
import type { HaloMarker } from './components/Halo';
import { callLightService, getLightState } from './services/ha-connection';
import { usePopupSheet } from './hooks/use-popup-sheet';
import {
    buildCompactCardState,
    buildGroupedAggregateControlState,
    buildGroupedLightMarkers,
    buildGroupedLights,
    buildGroupRelativeSnapshot,
} from './utils/card-view-state';
import {
    buildQueuedControlCommand,
    controlValuesFromPosition,
    getGroupedLightIds,
    kelvinFromXPosition,
    type ControlScope,
    type GroupRelativeSnapshot,
    type QueuedControlCommand,
    xFractionFromHueSat,
} from './utils/control-state';

const CONTROL_SEND_INTERVAL_MS = 120;
const CONTROL_SETTLE_DELAY_MS = 220;
const DISCO_SEND_INTERVAL_MS = 1100;

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
    layout = 'auto',
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
    const lastCommandTime = useRef(0);
    const isUserInteracting = useRef(false);
    const interactionTimeout = useRef<number | null>(null);
    const controlSendTimeout = useRef<number | null>(null);
    const controlBatchInFlight = useRef(false);
    const discoSendInterval = useRef<number | null>(null);
    const discoBatchInFlight = useRef(false);
    const discoStepRef = useRef(0);
    const hassRef = useRef(hass);
    const sceneFeedbackTimeout = useRef<number | null>(null);
    const pendingControlCommand = useRef<QueuedControlCommand[] | null>(null);
    const lastSentControlCommand = useRef<QueuedControlCommand[] | null>(null);
    const groupRelativeLayout = useRef<GroupRelativeSnapshot | null>(null);
    const groupRelativeInteractionSnapshot = useRef<GroupRelativeSnapshot | null>(null);
    const hasExplicitModeSelection = useRef(false);

    const [hue, setHue] = useState(0);
    const [saturation, setSaturation] = useState(0);
    const [brightness, setBrightness] = useState(50);
    const [kelvin, setKelvin] = useState<number | null>(null);
    const [isOn, setIsOn] = useState(false);
    const [uiMode, setUiMode] = useState<'temperature' | 'spectrum'>('temperature');
    const [selectedColorHue, setSelectedColorHue] = useState<number | null>(null);
    const [selectedSceneName, setSelectedSceneName] = useState<string | null>(null);
    const [sceneFeedbackMessage, setSceneFeedbackMessage] = useState<string | null>(null);
    const [showPopup, setShowPopup] = useState(false);
    const [isDiscoMode, setIsDiscoMode] = useState(false);

    const groupedLights: GroupedLightOption[] = buildGroupedLights(hass, groupedLightIds);
    const isDarkMode = Boolean(hass?.themes?.darkMode);
    const groupedLightIdsKey = groupedLightIds.join('|');
    const {
        closePopup,
        handlePopupDragEnd,
        handlePopupDragMove,
        handlePopupDragStart,
        handlePopupHandleClick,
        isMobilePopupViewport,
        isPopupClosing,
        isPopupDragging,
        mobilePopupTopInset,
        popupDragOffset,
    } = usePopupSheet(showPopup, setShowPopup);

    const groupedLightMarkers: HaloMarker[] = buildGroupedLightMarkers(
        hass,
        groupedLightIds,
        uiMode,
        controlScope,
        controlledLightEntityId,
        controlScope === 'group-relative' && groupRelativeLayout.current?.mode === uiMode
            ? groupRelativeLayout.current
            : null,
        uiMode === 'spectrum' ? selectedColorHue : null
    );

    const buildGroupRelativeLayout = useCallback(() => {
        const snapshot = buildGroupRelativeSnapshot(
            hass,
            groupedLightIds,
            uiMode,
            uiMode === 'spectrum' ? selectedColorHue : null
        );

        if (!snapshot) {
            groupRelativeLayout.current = null;
            return null;
        }

        groupRelativeLayout.current = snapshot;
        return snapshot;
    }, [groupedLightIds, hass, selectedColorHue, uiMode]);

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
        hassRef.current = hass;
    }, [hass]);

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
        hasExplicitModeSelection.current = false;
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
                setIsOn(relativeLayout.members.some((member) => member.brightness > 0));
                setHue(uiMode === 'spectrum' && selectedColorHue != null ? selectedColorHue : controlValuesFromPosition(
                    relativeLayout.averageX,
                    relativeLayout.averageBrightness,
                    uiMode
                ).hue);
                setSaturation(
                    uiMode === 'spectrum' && selectedColorHue != null
                        ? Math.round(relativeLayout.averageX * 100)
                        : controlValuesFromPosition(relativeLayout.averageX, relativeLayout.averageBrightness, uiMode)
                              .saturation
                );
                setBrightness(relativeLayout.averageBrightness);
                setKelvin(uiMode === 'temperature' ? kelvinFromXPosition(relativeLayout.averageX, groupLight ?? light) : null);
            }
            return;
        }

        if (groupedLightIds.length && controlScope !== 'individual' && groupLight) {
            const aggregate = buildGroupedAggregateControlState(
                hass,
                groupedLightIds,
                uiMode,
                groupLight,
                uiMode === 'spectrum' ? selectedColorHue : null
            );

            if (!isUserInteracting.current && !isDiscoMode) {
                setIsOn(aggregate.isOn);
                setHue(aggregate.hue);
                setSaturation(aggregate.saturation);
                setBrightness(aggregate.brightness);
                setKelvin(aggregate.kelvin);
            }
            return;
        }

        const nextLight = light ?? groupLight;
        if (!nextLight || isUserInteracting.current || isDiscoMode) return;

        setIsOn(nextLight.state === 'on');

        if (nextLight.attributes.brightness !== undefined) {
            setBrightness(Math.round((nextLight.attributes.brightness / 255) * 100));
        }

        if (uiMode === 'spectrum' && selectedColorHue != null) {
            setHue(selectedColorHue);
            setKelvin(null);
        } else if (nextLight.attributes.hs_color) {
            setHue(nextLight.attributes.hs_color[0]);
            setSaturation(nextLight.attributes.hs_color[1]);
        }

        if (uiMode !== 'spectrum' || selectedColorHue == null) {
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
        }

        setUiMode((previousMode) => {
            if (hasExplicitModeSelection.current) {
                if (previousMode === 'spectrum' && supportsSpectrum) {
                    return 'spectrum';
                }

                if (previousMode === 'temperature' && supportsTemperature) {
                    return 'temperature';
                }

                return supportsSpectrum ? 'spectrum' : 'temperature';
            }

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
    }, [
        activeEntityId,
        controlScope,
        ensureGroupRelativeLayout,
        groupLight,
        groupedLightIds,
        hass,
        isDiscoMode,
        light,
        supportsSpectrum,
        supportsTemperature,
        selectedColorHue,
        uiMode,
    ]);

    const resolvedLayout: CardLayout = layout === 'expanded' ? 'expanded' : 'compact';

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
        discoStepRef.current = 0;
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

        const targetIds = groupedLightIds.length ? groupedLightIds : [activeEntityId];

        const applyDiscoFrame = () => {
            if (!targetIds.length || discoBatchInFlight.current) return;

            const step = discoStepRef.current;
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
                    callLightService(hassRef.current, command.entityId, true, {
                        brightness: command.brightness,
                        hs_color: command.hsColor,
                    })
                )
            ).finally(() => {
                discoBatchInFlight.current = false;
            });

            discoStepRef.current += 1;
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
    }, [activeEntityId, groupedLightIdsKey, isDiscoMode]);

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

    const handlePadDoubleSelect = useCallback(
        (nextHue: number, nextSaturation: number, nextBrightness: number) => {
            stopDiscoMode();
            beginControlInteraction();
            setSelectedSceneName(null);
            setIsOn(nextBrightness > 0);
            setHue(nextHue);
            setSaturation(nextSaturation);
            setBrightness(nextBrightness);

            const shouldMoveWholeGroup = groupedLightIds.length > 0;
            if (shouldMoveWholeGroup) {
                setControlScope('group');
                setControlledLightEntityId(null);
            }

            if (uiMode === 'temperature') {
                setKelvin(
                    kelvinFromXPosition(
                        xFractionFromHueSat(nextHue, nextSaturation, 'temperature'),
                        shouldMoveWholeGroup ? (groupLight ?? light) : (getLightState(hass, activeEntityIdRef.current) ?? light)
                    )
                );
            } else {
                setKelvin(null);
            }

            const nextCommand = buildQueuedControlCommand(
                shouldMoveWholeGroup ? entityId : activeEntityIdRef.current,
                shouldMoveWholeGroup ? (groupLight ?? light) : (getLightState(hass, activeEntityIdRef.current) ?? light),
                {
                    brightness: nextBrightness,
                    hue: nextHue,
                    saturation: nextSaturation,
                },
                uiMode
            );

            queueControlCommand([nextCommand]);
            flushQueuedControlCommand(true);
            groupRelativeInteractionSnapshot.current = null;
            endControlInteraction();
        },
        [
            beginControlInteraction,
            entityId,
            endControlInteraction,
            flushQueuedControlCommand,
            groupLight,
            groupedLightIds.length,
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

        const targetEntityId =
            controlScope === 'individual' && controlledLightEntityId ? controlledLightEntityId : entityId;

        callLightService(hass, targetEntityId, nextState);
    }, [controlScope, controlledLightEntityId, entityId, hass, isOn, markInteraction, stopDiscoMode]);

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
            clearInteractionLock();
            hasExplicitModeSelection.current = true;
            setSelectedSceneName(null);
            setSelectedColorHue(null);
            setUiMode(mode);
            groupRelativeLayout.current = null;
            groupRelativeInteractionSnapshot.current = null;
        },
        [clearInteractionLock, stopDiscoMode, supportsSpectrum, supportsTemperature]
    );

    const handleColorSelect = useCallback(
        (nextHue: number) => {
            stopDiscoMode();
            beginControlInteraction();
            hasExplicitModeSelection.current = true;
            setSelectedSceneName(null);
            setSelectedColorHue(nextHue);
            setUiMode('spectrum');
            const currentX =
                uiMode === 'spectrum' && selectedColorHue != null
                    ? Math.max(0, Math.min(1, saturation / 100))
                    : xFractionFromHueSat(hue, saturation, uiMode);
            const lockedSaturation = Math.round(currentX * 100);

            if (controlScope === 'group-relative' && groupedLightIds.length) {
                const snapshot = groupRelativeInteractionSnapshot.current ?? ensureGroupRelativeLayout();
                if (!snapshot) {
                    return;
                }

                const nextRelativeLayout: GroupRelativeSnapshot = {
                    mode: 'spectrum',
                    averageX: snapshot.averageX,
                    averageBrightness: snapshot.averageBrightness,
                    members: snapshot.members.map((member) => ({
                        ...member,
                    })),
                };

                groupRelativeLayout.current = nextRelativeLayout;
                groupRelativeInteractionSnapshot.current = nextRelativeLayout;

                setIsOn(nextRelativeLayout.members.some((member) => member.brightness > 0));
                setHue(nextHue);
                setSaturation(Math.round(nextRelativeLayout.averageX * 100));
                setBrightness(nextRelativeLayout.averageBrightness);
                setKelvin(null);

                const relativeCommands = nextRelativeLayout.members.map((member) =>
                    buildQueuedControlCommand(
                        member.entityId,
                        member.light,
                        {
                            brightness: member.brightness,
                            hue: nextHue,
                            saturation: Math.round(member.x * 100),
                        },
                        'spectrum'
                    )
                );

                queueControlCommand(relativeCommands);
                flushQueuedControlCommand(true);
                markInteraction(900);
                return;
            }

            const nextBrightness = Math.max(1, brightness);
            const targetEntityId =
                controlScope === 'individual' && controlledLightEntityId ? controlledLightEntityId : entityId;
            const targetLight = getLightState(hass, targetEntityId) ?? light ?? groupLight;
            if (!targetLight) return;

            groupRelativeLayout.current = null;
            groupRelativeInteractionSnapshot.current = null;
            setIsOn(true);
            setHue(nextHue);
            setSaturation(lockedSaturation);
            setBrightness(nextBrightness);
            setKelvin(null);

            const nextCommand = buildQueuedControlCommand(
                controlScope === 'group-relative' ? entityId : targetEntityId,
                controlScope === 'group-relative' ? (groupLight ?? targetLight) : targetLight,
                {
                    brightness: nextBrightness,
                    hue: nextHue,
                    saturation: lockedSaturation,
                },
                'spectrum'
            );

            queueControlCommand([nextCommand]);
            flushQueuedControlCommand(true);
            markInteraction(900);
        },
        [
            brightness,
            beginControlInteraction,
            controlScope,
            controlledLightEntityId,
            entityId,
            ensureGroupRelativeLayout,
            flushQueuedControlCommand,
            groupLight,
            groupedLightIds.length,
            hass,
            hue,
            light,
            markInteraction,
            queueControlCommand,
            selectedColorHue,
            saturation,
            stopDiscoMode,
            uiMode,
        ]
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
                setIsOn(relativeLayout.members.some((member) => member.brightness > 0));
                if (uiMode === 'spectrum' && selectedColorHue != null) {
                    setHue(selectedColorHue);
                    setSaturation(Math.round(relativeLayout.averageX * 100));
                } else {
                    const averageValues = controlValuesFromPosition(
                        relativeLayout.averageX,
                        relativeLayout.averageBrightness,
                        uiMode
                    );
                    setHue(averageValues.hue);
                    setSaturation(averageValues.saturation);
                }
                setBrightness(relativeLayout.averageBrightness);
                setKelvin(uiMode === 'temperature' ? kelvinFromXPosition(relativeLayout.averageX, groupLight ?? light) : null);
            }
        }

        setControlScope(nextScope);
    }, [ensureGroupRelativeLayout, groupLight, light, selectedColorHue, stopDiscoMode, uiMode]);

    if (!groupLight) {
        return (
            <div>
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

    const {
        compactLightName,
        compactUiMode,
        compactBrightness,
        compactHue,
        compactSaturation,
        compactKelvin,
        compactIsOn,
        expandedPrimaryName,
        expandedSecondaryName,
    } = buildCompactCardState({
        hass,
        groupLight,
        groupedLightIds,
        entityId,
        name,
        uiMode,
        lightName,
        groupedLights,
        controlScope,
        controlledLightEntityId,
    });
    const expandedCardProps = {
        isDarkMode,
        lightName,
        expandedPrimaryName,
        expandedSecondaryName,
        icon,
        isOn,
        hue,
        saturation,
        brightness,
        kelvin,
        uiMode,
        canUseTemperature: supportsTemperature,
        canUseSpectrum: supportsSpectrum,
        onModeChange: handleModeChange,
        onControlsChange: handleControlsChange,
        selectedColorHue,
        onColorSelect: handleColorSelect,
        onControlInteractionStart: beginControlInteraction,
        onControlInteractionEnd: handleControlInteractionEnd,
        isDiscoMode,
        onDiscoModeTrigger: startDiscoMode,
        onDiscoModeExit: stopDiscoMode,
        onPadMarkerSelect: groupedLights.length ? handleGroupedLightSelect : undefined,
        onPadDoubleSelect: handlePadDoubleSelect,
        onToggle: handleToggle,
        sceneOptions,
        selectedSceneName,
        sceneFeedbackMessage,
        groupedLights,
        groupedLightMarkers,
        controlScope,
        controlledLightEntityId,
        onControlScopeChange: handleControlScopeChange,
        onGroupedLightSelect: handleGroupedLightSelect,
        onGroupedLightToggle: handleGroupedLightToggle,
        onSceneSelect: handleSceneSelect,
    } as const;

    return (
        <div>
            <CompactCard
                layout={resolvedLayout}
                isDarkMode={isDarkMode}
                lightName={resolvedLayout === 'compact' ? compactLightName : lightName}
                expandedPrimaryName={resolvedLayout === 'compact' ? undefined : expandedPrimaryName}
                expandedSecondaryName={resolvedLayout === 'compact' ? null : expandedSecondaryName}
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
                selectedColorHue={selectedColorHue}
                onColorSelect={handleColorSelect}
                onControlInteractionStart={beginControlInteraction}
                onControlInteractionEnd={handleControlInteractionEnd}
                isDiscoMode={isDiscoMode}
                onDiscoModeTrigger={startDiscoMode}
                onDiscoModeExit={stopDiscoMode}
                onPadMarkerSelect={groupedLights.length ? handleGroupedLightSelect : undefined}
                            onPadDoubleSelect={handlePadDoubleSelect}
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
                <PopupCardShell
                    isMobilePopupViewport={isMobilePopupViewport}
                    mobilePopupTopInset={mobilePopupTopInset}
                    popupDragOffset={popupDragOffset}
                    isPopupDragging={isPopupDragging}
                    isPopupClosing={isPopupClosing}
                    onClose={closePopup}
                    onDragStart={handlePopupDragStart}
                    onDragMove={handlePopupDragMove}
                    onDragEnd={handlePopupDragEnd}
                    onHandleClick={handlePopupHandleClick}
                >
                    <CompactCard layout="expanded" {...expandedCardProps} />
                </PopupCardShell>
            ) : null}
        </div>
    );
}

export default CardApp;

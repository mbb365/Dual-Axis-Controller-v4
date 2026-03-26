import { useCallback, useEffect, useRef, useState } from 'react';
import { CompactCard, type CardLayout, type SceneOption } from './components/CompactCard';
import { callLightService, getLightState } from './services/ha-connection';

const CONTROL_SEND_INTERVAL_MS = 90;
const CONTROL_SETTLE_DELAY_MS = 220;

interface QueuedControlCommand {
    turnOn: boolean;
    brightness: number;
    hue: number;
    saturation: number;
    uiMode: 'temperature' | 'spectrum';
    colorTempKelvin?: number;
    hsColor?: [number, number];
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
            };
        }
    >;
    const light = getLightState(hass, entityId);
    const lightName = name || light?.attributes.friendly_name || entityId;
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
    const pendingControlCommand = useRef<QueuedControlCommand | null>(null);
    const lastSentControlCommand = useRef<QueuedControlCommand | null>(null);

    const [containerWidth, setContainerWidth] = useState(0);
    const [hue, setHue] = useState(0);
    const [saturation, setSaturation] = useState(0);
    const [brightness, setBrightness] = useState(50);
    const [kelvin, setKelvin] = useState<number | null>(null);
    const [isOn, setIsOn] = useState(false);
    const [uiMode, setUiMode] = useState<'temperature' | 'spectrum'>('temperature');
    const [selectedSceneName, setSelectedSceneName] = useState<string | null>(null);
    const [showPopup, setShowPopup] = useState(false);

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
        };
    }, []);

    useEffect(() => {
        const nextLight = getLightState(hass, entityId);
        if (!nextLight || isUserInteracting.current) return;

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
    }, [entityId, hass, supportsSpectrum]);

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

    const beginControlInteraction = useCallback(() => {
        isUserInteracting.current = true;
        if (interactionTimeout.current) {
            window.clearTimeout(interactionTimeout.current);
            interactionTimeout.current = null;
        }
    }, []);

    const endControlInteraction = useCallback(() => {
        if (interactionTimeout.current) {
            window.clearTimeout(interactionTimeout.current);
        }
        interactionTimeout.current = window.setTimeout(() => {
            isUserInteracting.current = false;
            interactionTimeout.current = null;
        }, CONTROL_SETTLE_DELAY_MS);
    }, []);

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

    const flushQueuedControlCommand = useCallback(
        (force = false) => {
            const queuedCommand = pendingControlCommand.current;
            if (!queuedCommand) return;

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

            if (!hasMeaningfulControlDelta(lastSentControlCommand.current, queuedCommand)) {
                pendingControlCommand.current = null;
                return;
            }

            pendingControlCommand.current = null;
            lastSentControlCommand.current = queuedCommand;
            lastCommandTime.current = now;

            void callLightService(hass, entityId, queuedCommand.turnOn, {
                brightness: queuedCommand.brightness,
                hs_color: queuedCommand.hsColor,
                color_temp_kelvin: queuedCommand.colorTempKelvin,
            });
        },
        [entityId, hass, hasMeaningfulControlDelta]
    );

    const queueControlCommand = useCallback(
        (command: QueuedControlCommand) => {
            pendingControlCommand.current = command;
            flushQueuedControlCommand(false);
        },
        [flushQueuedControlCommand]
    );

    const handleControlsChange = useCallback(
        (nextHue: number, nextSaturation: number, nextBrightness: number) => {
            beginControlInteraction();

            setSelectedSceneName(null);
            setHue(nextHue);
            setSaturation(nextSaturation);
            setBrightness(nextBrightness);

            const nextCommand: QueuedControlCommand = {
                turnOn: nextBrightness > 0,
                brightness: nextBrightness,
                hue: nextHue,
                saturation: nextSaturation,
                uiMode,
            };

            if (uiMode === 'temperature') {
                const isCool = Math.abs(nextHue - 210) < Math.abs(nextHue - 38);
                const x = isCool ? 0.5 - nextSaturation / 200 : 0.5 + nextSaturation / 200;
                const minM = light?.attributes.min_mireds || 153;
                const maxM = light?.attributes.max_mireds || 500;
                const mireds = Math.round(minM + Math.max(0, Math.min(1, x)) * (maxM - minM));
                const nextKelvin = Math.round(1000000 / mireds);
                setKelvin(nextKelvin);

                if (supportsTemperature) {
                    nextCommand.colorTempKelvin = nextKelvin;
                } else if (supportsSpectrum) {
                    nextCommand.hsColor = [nextHue, nextSaturation];
                }
            } else if (supportsSpectrum) {
                nextCommand.hsColor = [nextHue, nextSaturation];
            }

            queueControlCommand(nextCommand);
        },
        [
            beginControlInteraction,
            entityId,
            light?.attributes.max_mireds,
            light?.attributes.min_mireds,
            queueControlCommand,
            supportsSpectrum,
            supportsTemperature,
            uiMode,
        ]
    );

    const handleControlInteractionEnd = useCallback(() => {
        flushQueuedControlCommand(true);
        endControlInteraction();
    }, [endControlInteraction, flushQueuedControlCommand]);

    const handleToggle = useCallback(() => {
        const nextState = !isOn;
        setSelectedSceneName(null);
        setIsOn(nextState);
        markInteraction(1000);
        callLightService(hass, entityId, nextState);
    }, [entityId, hass, isOn, markInteraction]);

    const handleModeChange = useCallback(
        (mode: 'temperature' | 'spectrum') => {
            if (mode === 'temperature' && !supportsTemperature) return;
            if (mode === 'spectrum' && !supportsSpectrum) return;

            setSelectedSceneName(null);
            setUiMode(mode);
            markInteraction(1000);
        },
        [markInteraction, supportsSpectrum, supportsTemperature]
    );

    const handleSceneSelect = useCallback(
        (sceneEntityId: string) => {
            clearInteractionLock();
            const selectedScene = sceneOptions.find((scene) => scene.entityId === sceneEntityId);
            setSelectedSceneName(selectedScene?.name ?? null);
            hass.callService('scene', 'turn_on', { entity_id: sceneEntityId });
        },
        [clearInteractionLock, hass, sceneOptions]
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

    if (!light) {
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

    return (
        <div ref={rootRef}>
            <CompactCard
                layout={resolvedLayout}
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
                onToggle={handleToggle}
                sceneOptions={sceneOptions}
                selectedSceneName={selectedSceneName}
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
                            onToggle={handleToggle}
                            sceneOptions={sceneOptions}
                            selectedSceneName={selectedSceneName}
                            onSceneSelect={handleSceneSelect}
                        />
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export default CardApp;

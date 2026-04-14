import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CompactCard, type CardLayout, type GroupedLightOption } from './components/CompactCard';
import { PopupCardShell } from './components/card-popup/PopupCardShell';
import type { HaloMarker, HaloVisualStyle } from './components/Halo';
import {
    activateScene,
    callLightService,
    createSceneDefinition,
    deleteScene,
    getLightState,
    isLightAvailable,
    isLightOn,
} from './services/ha-connection';
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
    getMarkerControlValues,
    kelvinFromXPosition,
    type ControlScope,
    type GroupRelativeMemberSnapshot,
    type GroupRelativeSnapshot,
    type QueuedControlCommand,
    xFractionFromHueSat,
} from './utils/control-state';
import {
    appendFavoritePreset,
    buildFavoriteSceneEntities,
    buildSharedFavoriteSceneEntityId,
    buildBuiltinFavoritePresets,
    createGroupFavoritePreset,
    createOwnedIndividualFavoritePreset,
    favoriteSettingsMatch,
    loadFavoritePresets,
    loadSharedFavoritePresets,
    mergeFavoritePresetCollections,
    saveFavoritePresets,
    isSharedFavoriteSceneEntityId,
    type FavoriteMemberPreset,
    type FavoritePreset,
    type FavoriteSettings,
} from './utils/favorites';
import {
    loadControllerSession,
    saveControllerSession,
    type StoredControllerSession,
    type StoredGroupRelativeLayout,
} from './utils/controller-session';

const CONTROL_SEND_INTERVAL_MS = 120;
const CONTROL_SETTLE_DELAY_MS = 220;
const DISCO_SEND_INTERVAL_MS = 900;
const UI_MODE_SYNC_LOCK_MS = 1800;

export interface CardAppProps {
    hass: any;
    entityId: string;
    name?: string;
    layout?: CardLayout | 'auto';
    onTapAction?: () => void;
    onHoldAction?: () => void;
    onDoubleTapAction?: () => void;
}

function cloneGroupRelativeSnapshot(snapshot: GroupRelativeSnapshot): GroupRelativeSnapshot {
    return {
        ...snapshot,
        members: snapshot.members.map((member) => ({
            ...member,
        })),
    };
}

function hasLitGroupRelativeMembers(snapshot: GroupRelativeSnapshot | null | undefined) {
    return Boolean(snapshot?.members.some((member) => member.brightness > 0));
}

function hasMatchingGroupRelativeMembers(snapshot: GroupRelativeSnapshot | null | undefined, groupedLightIds: string[]) {
    return Boolean(
        snapshot &&
            snapshot.members.length === groupedLightIds.length &&
            snapshot.members.every((member) => groupedLightIds.includes(member.entityId))
    );
}

function isControllableGroupRelativeMember(hass: any, member: GroupRelativeMemberSnapshot) {
    const liveLight = getLightState(hass, member.entityId) ?? member.light;
    return isLightAvailable(liveLight);
}

function buildGroupRelativeSnapshotFromMembers(
    hass: any,
    mode: 'temperature' | 'spectrum',
    members: GroupRelativeMemberSnapshot[]
): GroupRelativeSnapshot {
    const averagedMembers = members.filter((member) => isControllableGroupRelativeMember(hass, member));
    const sourceMembers = averagedMembers.length ? averagedMembers : members;

    return {
        mode,
        averageX: sourceMembers.reduce((total, member) => total + member.x, 0) / sourceMembers.length,
        averageBrightness:
            sourceMembers.reduce((total, member) => total + member.brightness, 0) / sourceMembers.length,
        members,
    };
}

function favoritePresetsTargetMatch(left: FavoritePreset, right: FavoritePreset) {
    if (left.scope !== right.scope || left.entityId !== right.entityId) {
        return false;
    }

    if (left.scope === 'group' && right.scope === 'group') {
        if (left.members.length !== right.members.length) {
            return false;
        }

        return left.members.every((member, index) => {
            const other = right.members[index];
            return !!other && member.entityId === other.entityId && favoriteSettingsMatch(member.settings, other.settings);
        });
    }

    return favoriteSettingsMatch(left.settings, right.settings);
}

function waitForMs(durationMs: number) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, durationMs);
    });
}

function buildLightStateSignature(light: ReturnType<typeof getLightState>) {
    if (!light) return 'missing';

    const attributes = light.attributes ?? {};
    const hsColor = Array.isArray(attributes.hs_color) ? attributes.hs_color.join(',') : `${attributes.hs_color ?? ''}`;
    const rgbColor = Array.isArray((attributes as { rgb_color?: unknown }).rgb_color)
        ? ((attributes as { rgb_color?: number[] }).rgb_color ?? []).join(',')
        : `${(attributes as { rgb_color?: unknown }).rgb_color ?? ''}`;
    const xyColor = Array.isArray((attributes as { xy_color?: unknown }).xy_color)
        ? ((attributes as { xy_color?: number[] }).xy_color ?? []).join(',')
        : `${(attributes as { xy_color?: unknown }).xy_color ?? ''}`;

    return [
        light.entity_id,
        light.state,
        `${attributes.available ?? ''}`,
        `${attributes.reachable ?? ''}`,
        `${attributes.brightness ?? ''}`,
        `${attributes.color_mode ?? ''}`,
        `${attributes.color_temp ?? ''}`,
        `${attributes.color_temp_kelvin ?? ''}`,
        hsColor,
        rgbColor,
        xyColor,
        `${(attributes as { effect?: unknown }).effect ?? ''}`,
    ].join('|');
}

function callQueuedCommandsDirectly(hass: any, commands: QueuedControlCommand[]) {
    return Promise.all(
        commands.map((command) =>
            callLightService(hass, command.entityId, command.turnOn, {
                brightness: command.brightness,
                hs_color: command.hsColor,
                color_temp_kelvin: command.colorTempKelvin,
            })
        )
    );
}

function cloneFavoriteSettings(settings: FavoriteSettings): FavoriteSettings {
    return {
        ...settings,
    };
}

function buildFavoriteSettingsFromLightState(
    targetLight: ReturnType<typeof getLightState>
): FavoriteSettings | null {
    if (!targetLight) return null;

    const inferredMode: 'temperature' | 'spectrum' =
        targetLight.attributes.color_mode === 'color_temp' ||
        (targetLight.attributes.color_temp_kelvin != null && targetLight.attributes.color_mode !== 'hs') ||
        (targetLight.attributes.color_temp != null && targetLight.attributes.color_mode !== 'hs')
            ? 'temperature'
            : 'spectrum';

    const markerValues = getMarkerControlValues(targetLight, inferredMode);
    const resolvedKelvin =
        inferredMode === 'temperature'
            ? targetLight.attributes.color_temp_kelvin ??
              (targetLight.attributes.color_temp ? Math.round(1000000 / targetLight.attributes.color_temp) : null)
            : null;

    return {
        brightness: markerValues.brightness,
        hue: markerValues.hue,
        isOn: isLightOn(targetLight) && markerValues.brightness > 0,
        kelvin: resolvedKelvin,
        mode: inferredMode,
        saturation: markerValues.saturation,
        selectedColorHue: null,
    };
}

function serializeGroupRelativeSnapshot(snapshot: GroupRelativeSnapshot | null): StoredGroupRelativeLayout | null {
    if (!snapshot) return null;

    return {
        mode: snapshot.mode,
        averageBrightness: snapshot.averageBrightness,
        averageX: snapshot.averageX,
        members: snapshot.members.map((member) => ({
            entityId: member.entityId,
            x: member.x,
            brightness: member.brightness,
        })),
    };
}

function hydrateStoredGroupRelativeLayout(
    storedLayout: StoredGroupRelativeLayout | null,
    hass: any,
    groupedLightIds: string[]
): GroupRelativeSnapshot | null {
    if (!storedLayout) return null;
    if (
        storedLayout.members.length !== groupedLightIds.length ||
        storedLayout.members.some((member) => !groupedLightIds.includes(member.entityId))
    ) {
        return null;
    }

    const hydratedMembers = storedLayout.members
        .map((member) => {
            const light = getLightState(hass, member.entityId);
            if (!light) return null;

            return {
                ...member,
                light,
            };
        })
        .filter((member): member is NonNullable<typeof member> => member !== null);

    if (hydratedMembers.length !== storedLayout.members.length) {
        return null;
    }

    return {
        mode: storedLayout.mode,
        averageBrightness: storedLayout.averageBrightness,
        averageX: storedLayout.averageX,
        members: hydratedMembers,
    };
}

export function CardApp({
    hass,
    entityId,
    name,
    layout = 'auto',
    onTapAction,
    onHoldAction,
    onDoubleTapAction,
}: CardAppProps) {
    const initialControllerSessionRef = useRef<StoredControllerSession | null>(loadControllerSession(entityId));
    const initialControllerSession = initialControllerSessionRef.current;
    const groupLight = getLightState(hass, entityId);
    const groupedLightIds = getGroupedLightIds(groupLight);
    const [controlScope, setControlScope] = useState<ControlScope>(initialControllerSession?.controlScope ?? 'group');
    const [controlledLightEntityId, setControlledLightEntityId] = useState<string | null>(
        initialControllerSession?.controlledLightEntityId ?? null
    );
    const controlledLightEntityIdRef = useRef<string | null>(initialControllerSession?.controlledLightEntityId ?? null);

    useEffect(() => {
        if (!groupedLightIds.length) {
            setControlScope('group');
            setControlledLightEntityId(null);
            controlledLightEntityIdRef.current = null;
            return;
        }

        setControlledLightEntityId((current) => (current && groupedLightIds.includes(current) ? current : null));
    }, [groupedLightIds]);

    useEffect(() => {
        controlledLightEntityIdRef.current = controlledLightEntityId;
    }, [controlledLightEntityId]);

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
    const lastCommandTime = useRef(0);
    const isUserInteracting = useRef(false);
    const interactionTimeout = useRef<number | null>(null);
    const controlSendTimeout = useRef<number | null>(null);
    const controlBatchInFlight = useRef(false);
    const discoSendInterval = useRef<number | null>(null);
    const discoBatchInFlight = useRef(false);
    const discoStepRef = useRef(0);
    const hassRef = useRef(hass);
    const pendingControlCommand = useRef<QueuedControlCommand[] | null>(null);
    const lastSentControlCommand = useRef<QueuedControlCommand[] | null>(null);
    const favoriteSceneApplyInFlight = useRef(false);
    const pendingFavoriteSceneApply = useRef<{ favorite: FavoritePreset; token: number } | null>(null);
    const lastRequestedFavoriteSceneToken = useRef(0);
    const favoriteMigrationInFlightKey = useRef<string | null>(null);
    const uiModeSyncLock = useRef<{ mode: 'temperature' | 'spectrum'; expiresAt: number } | null>(null);
    const groupRelativeLayout = useRef<GroupRelativeSnapshot | null>(null);
    const groupRelativeLayoutStateSignature = useRef<string | null>(null);
    const groupRelativeInteractionSnapshot = useRef<GroupRelativeSnapshot | null>(null);
    const lastLitGroupRelativeLayout = useRef<GroupRelativeSnapshot | null>(
        hydrateStoredGroupRelativeLayout(initialControllerSession?.lastLitGroupRelativeLayout ?? null, hass, groupedLightIds)
    );
    const lastLitControlSettings = useRef<Record<string, FavoriteSettings>>(
        initialControllerSession?.lastLitControlSettings ?? {}
    );
    const hasExplicitModeSelection = useRef(initialControllerSession?.hasExplicitModeSelection ?? false);

    const [hue, setHue] = useState(0);
    const [saturation, setSaturation] = useState(0);
    const [brightness, setBrightness] = useState(50);
    const [kelvin, setKelvin] = useState<number | null>(null);
    const [isOn, setIsOn] = useState(false);
    const [uiMode, setUiMode] = useState<'temperature' | 'spectrum'>(initialControllerSession?.uiMode ?? 'temperature');
    const [selectedColorHue, setSelectedColorHue] = useState<number | null>(
        initialControllerSession?.selectedColorHue ?? null
    );
    const [padVisualStyle, setPadVisualStyle] = useState<HaloVisualStyle>(
        initialControllerSession?.padVisualStyle ?? 'plotter'
    );
    const [showPopup, setShowPopup] = useState(false);
    const [isDiscoMode, setIsDiscoMode] = useState(false);
    const [favoritePresets, setFavoritePresets] = useState(() => loadFavoritePresets(entityId));
    const [loadedControllerSessionEntityId, setLoadedControllerSessionEntityId] = useState(entityId);

    const groupedLights: GroupedLightOption[] = buildGroupedLights(hass, groupedLightIds);
    const groupLightStateSignature = buildLightStateSignature(groupLight);
    const activeLightStateSignature = buildLightStateSignature(light);
    const groupedLightStateSignature = groupedLightIds
        .map((memberId) => `${memberId}:${buildLightStateSignature(getLightState(hass, memberId))}`)
        .join('|');
    const isDarkMode = Boolean(hass?.themes?.darkMode);
    const groupedLightIdsKey = groupedLightIds.join('|');
    const sharedFavoriteSceneSignature = Object.keys(hass?.states ?? {})
        .filter((stateEntityId) => isSharedFavoriteSceneEntityId(stateEntityId, entityId))
        .sort()
        .join('|');
    const effectiveControlScope: ControlScope = controlScope;
    const currentControlRestoreKey =
        effectiveControlScope === 'individual' && controlledLightEntityId ? controlledLightEntityId : entityId;
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

    useEffect(() => {
        if (!controlledLightEntityId) {
            return;
        }

        const selectedLight = getLightState(hass, controlledLightEntityId);
        if (isLightAvailable(selectedLight)) {
            return;
        }

        activeEntityIdRef.current = entityId;
        controlledLightEntityIdRef.current = null;
        setControlledLightEntityId(null);

        if (controlScope === 'individual') {
            setControlScope('group');
        }
    }, [controlScope, controlledLightEntityId, entityId, groupedLightStateSignature, hass]);

    const persistControllerSession = useCallback(() => {
        if (loadedControllerSessionEntityId !== entityId) return;

        saveControllerSession(entityId, {
            controlScope: effectiveControlScope,
            controlledLightEntityId,
            padVisualStyle,
            uiMode,
            selectedColorHue,
            hasExplicitModeSelection: hasExplicitModeSelection.current,
            lastLitGroupRelativeLayout: serializeGroupRelativeSnapshot(lastLitGroupRelativeLayout.current),
            lastLitControlSettings: lastLitControlSettings.current,
        });
    }, [
        controlledLightEntityId,
        effectiveControlScope,
        entityId,
        loadedControllerSessionEntityId,
        padVisualStyle,
        selectedColorHue,
        uiMode,
    ]);

    const rememberLastLitGroupRelativeLayout = useCallback(
        (snapshot: GroupRelativeSnapshot | null) => {
            lastLitGroupRelativeLayout.current = snapshot ? cloneGroupRelativeSnapshot(snapshot) : null;
            persistControllerSession();
        },
        [persistControllerSession]
    );

    const rememberLastLitControlSettings = useCallback(
        (targetEntityId: string, settings: FavoriteSettings) => {
            lastLitControlSettings.current = {
                ...lastLitControlSettings.current,
                [targetEntityId]: cloneFavoriteSettings(settings),
            };
            persistControllerSession();
        },
        [persistControllerSession]
    );

    const groupedLightMarkers: HaloMarker[] = buildGroupedLightMarkers(
        hass,
        groupedLightIds,
        uiMode,
        effectiveControlScope,
        controlledLightEntityId,
        effectiveControlScope === 'group-relative' && groupRelativeLayout.current?.mode === uiMode
            ? groupRelativeLayout.current
            : null,
        uiMode === 'spectrum' ? selectedColorHue : null
    );
    const groupRelativeFormationIndicator =
        effectiveControlScope === 'group-relative' && controlledLightEntityId && groupedLightIds.length
            ? (() => {
                  const relativeLayout =
                      groupRelativeLayout.current?.mode === uiMode
                          ? groupRelativeLayout.current
                          : buildGroupRelativeSnapshot(
                                hass,
                                groupedLightIds,
                                uiMode,
                                uiMode === 'spectrum' ? selectedColorHue : null
                            );

                  if (!relativeLayout) {
                      return null;
                  }

                  return uiMode === 'spectrum' && selectedColorHue != null
                      ? {
                            brightness: relativeLayout.averageBrightness,
                            hue: selectedColorHue,
                            saturation: Math.round(relativeLayout.averageX * 100),
                        }
                      : controlValuesFromPosition(
                            relativeLayout.averageX,
                            relativeLayout.averageBrightness,
                            uiMode
                        );
              })()
            : null;

    const buildGroupRelativeLayout = useCallback(() => {
        const snapshot = buildGroupRelativeSnapshot(
            hass,
            groupedLightIds,
            uiMode,
            uiMode === 'spectrum' ? selectedColorHue : null
        );

        if (!snapshot) {
            groupRelativeLayout.current = null;
            groupRelativeLayoutStateSignature.current = null;
            return null;
        }

        groupRelativeLayout.current = snapshot;
        groupRelativeLayoutStateSignature.current = groupedLightStateSignature;
        if (hasLitGroupRelativeMembers(snapshot)) {
            rememberLastLitGroupRelativeLayout(snapshot);
        }
        return snapshot;
    }, [groupedLightIds, groupedLightStateSignature, hass, rememberLastLitGroupRelativeLayout, selectedColorHue, uiMode]);

    const ensureGroupRelativeLayout = useCallback(() => {
        if (
            effectiveControlScope === 'group-relative' &&
            groupRelativeLayout.current?.mode === uiMode &&
            hasMatchingGroupRelativeMembers(groupRelativeLayout.current, groupedLightIds)
        ) {
            return groupRelativeLayout.current;
        }

        if (
            groupRelativeLayout.current?.mode === uiMode &&
            groupRelativeLayoutStateSignature.current === groupedLightStateSignature
        ) {
            return groupRelativeLayout.current;
        }

        return buildGroupRelativeLayout();
    }, [buildGroupRelativeLayout, effectiveControlScope, groupedLightIds, groupedLightStateSignature, uiMode]);

    const buildRelativeControlCommands = useCallback(
        (members: GroupRelativeMemberSnapshot[], mode: 'temperature' | 'spectrum') =>
            members
                .filter((member) => isControllableGroupRelativeMember(hass, member))
                .map((member) =>
                    buildQueuedControlCommand(
                        member.entityId,
                        getLightState(hass, member.entityId) ?? member.light,
                        controlValuesFromPosition(member.x, member.brightness, mode),
                        mode
                    )
                ),
        [hass]
    );

    const buildAnchoredGroupRelativeLayout = useCallback(() => {
        const rememberedLayout = lastLitGroupRelativeLayout.current;
        const fallbackLight = groupLight ?? light;

        if (!rememberedLayout || !hasLitGroupRelativeMembers(rememberedLayout) || !fallbackLight || !groupedLightIds.length) {
            return null;
        }

        if (
            rememberedLayout.members.length !== groupedLightIds.length ||
            rememberedLayout.members.some((member) => !groupedLightIds.includes(member.entityId))
        ) {
            return null;
        }

        const aggregate = buildGroupedAggregateControlState(
            hass,
            groupedLightIds,
            uiMode,
            fallbackLight,
            uiMode === 'spectrum' ? selectedColorHue : null
        );
        const anchorX =
            uiMode === 'spectrum' && selectedColorHue != null
                ? Math.max(0, Math.min(1, aggregate.saturation / 100))
                : xFractionFromHueSat(aggregate.hue, aggregate.saturation, uiMode);
        const deltaX = anchorX - rememberedLayout.averageX;
        const deltaBrightness = aggregate.brightness - rememberedLayout.averageBrightness;

        return buildGroupRelativeSnapshotFromMembers(
            hass,
            uiMode,
            rememberedLayout.members.map((member) => {
                const liveLight = getLightState(hass, member.entityId) ?? member.light;
                if (!isLightAvailable(liveLight)) {
                    return {
                        ...member,
                        light: liveLight,
                    };
                }

                return {
                    ...member,
                    light: liveLight,
                    x: member.x + deltaX,
                    brightness: member.brightness + deltaBrightness,
                };
            })
        );
    }, [groupLight, groupedLightIds, hass, light, selectedColorHue, uiMode]);

    useEffect(() => {
        activeEntityIdRef.current = activeEntityId;
    }, [activeEntityId]);

    useEffect(() => {
        const storedFavorites = loadFavoritePresets(entityId);
        const sharedFavorites = loadSharedFavoritePresets(hassRef.current, entityId);
        const mergedFavorites = mergeFavoritePresetCollections(sharedFavorites, storedFavorites);

        setFavoritePresets(mergedFavorites);
        saveFavoritePresets(entityId, mergedFavorites);
    }, [entityId, sharedFavoriteSceneSignature]);

    useEffect(() => {
        const migratableFavorites = favoritePresets.filter(
            (favorite) => !isSharedFavoriteSceneEntityId(favorite.sceneEntityId, entityId)
        );
        const migrationKey = migratableFavorites
            .map((favorite) => `${favorite.id}:${favorite.sceneEntityId}`)
            .sort()
            .join('|');

        const activeHass = hassRef.current;
        if (!activeHass || !migrationKey || favoriteMigrationInFlightKey.current === migrationKey) {
            return;
        }

        favoriteMigrationInFlightKey.current = migrationKey;
        void (async () => {
            let nextFavorites = favoritePresets;
            let changed = false;

            try {
                for (const favorite of migratableFavorites) {
                    const nextSceneEntityId = buildSharedFavoriteSceneEntityId(
                        entityId,
                        favorite.id,
                        favorite.createdAt,
                        favorite.scope,
                        favorite.settings,
                        favorite.entityId
                    );
                    if (nextSceneEntityId === favorite.sceneEntityId) {
                        continue;
                    }

                    const migratedFavorite = {
                        ...favorite,
                        sceneEntityId: nextSceneEntityId,
                    } satisfies FavoritePreset;

                    try {
                        await createSceneDefinition(
                            activeHass,
                            nextSceneEntityId,
                            buildFavoriteSceneEntities(migratedFavorite)
                        );
                        if (activeHass?.states?.[favorite.sceneEntityId]) {
                            await deleteScene(activeHass, favorite.sceneEntityId);
                        }

                        nextFavorites = nextFavorites.map((candidate) =>
                            candidate.id === favorite.id ? migratedFavorite : candidate
                        );
                        changed = true;
                    } catch (error) {
                        console.error('[Dual Halo Controller] Failed to migrate favourite to shared scene metadata', {
                            entityId,
                            favoriteId: favorite.id,
                            previousSceneEntityId: favorite.sceneEntityId,
                            nextSceneEntityId,
                            error,
                        });
                    }
                }

                if (!changed) {
                    return;
                }

                setFavoritePresets(nextFavorites);
                saveFavoritePresets(entityId, nextFavorites);
            } finally {
                if (favoriteMigrationInFlightKey.current === migrationKey) {
                    favoriteMigrationInFlightKey.current = null;
                }
            }
        })();
    }, [entityId, favoritePresets]);

    useEffect(() => {
        const storedControllerSession = loadControllerSession(entityId);

        setControlScope(storedControllerSession?.controlScope ?? 'group');
        setControlledLightEntityId(storedControllerSession?.controlledLightEntityId ?? null);
        setUiMode(storedControllerSession?.uiMode ?? 'temperature');
        setSelectedColorHue(storedControllerSession?.selectedColorHue ?? null);
        setPadVisualStyle(storedControllerSession?.padVisualStyle ?? 'plotter');
        hasExplicitModeSelection.current = storedControllerSession?.hasExplicitModeSelection ?? false;
        lastLitControlSettings.current = storedControllerSession?.lastLitControlSettings ?? {};
        lastLitGroupRelativeLayout.current = hydrateStoredGroupRelativeLayout(
            storedControllerSession?.lastLitGroupRelativeLayout ?? null,
            hass,
            groupedLightIds
        );
        setLoadedControllerSessionEntityId(entityId);
    }, [entityId, groupedLightIdsKey]);

    useEffect(() => {
        hassRef.current = hass;
    }, [hass]);

    useEffect(() => {
        persistControllerSession();
    }, [persistControllerSession]);

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
    }, [activeEntityId, effectiveControlScope]);

    useEffect(() => {
        groupRelativeLayout.current = null;
        groupRelativeLayoutStateSignature.current = null;
        groupRelativeInteractionSnapshot.current = null;
    }, [entityId, groupedLightIds.join('|'), uiMode]);

    useEffect(() => {
        if (effectiveControlScope === 'group-relative' || !isOn || brightness <= 0) {
            return;
        }

        rememberLastLitControlSettings(currentControlRestoreKey, {
            brightness,
            hue,
            isOn: true,
            kelvin,
            mode: uiMode,
            saturation,
            selectedColorHue,
        });
    }, [
        brightness,
        currentControlRestoreKey,
        effectiveControlScope,
        hue,
        isOn,
        kelvin,
        rememberLastLitControlSettings,
        saturation,
        selectedColorHue,
        uiMode,
    ]);

    useEffect(() => {
        if (effectiveControlScope === 'group-relative' && groupedLightIds.length) {
            const relativeLayout = ensureGroupRelativeLayout();

            if (relativeLayout && !isUserInteracting.current && !isDiscoMode) {
                const selectedRelativeMember =
                    controlledLightEntityId != null
                        ? relativeLayout.members.find((member) => member.entityId === controlledLightEntityId) ?? null
                        : null;
                const selectedMemberValues =
                    selectedRelativeMember != null
                        ? controlValuesFromPosition(selectedRelativeMember.x, selectedRelativeMember.brightness, uiMode)
                        : null;
                const selectedOrAverageX = selectedRelativeMember?.x ?? relativeLayout.averageX;
                const selectedOrAverageBrightness =
                    selectedRelativeMember?.brightness ?? relativeLayout.averageBrightness;

                setIsOn(relativeLayout.members.some((member) => member.brightness > 0));
                setHue(
                    uiMode === 'spectrum' && selectedColorHue != null
                        ? selectedColorHue
                        : selectedMemberValues?.hue ??
                              controlValuesFromPosition(relativeLayout.averageX, relativeLayout.averageBrightness, uiMode).hue
                );
                setSaturation(
                    uiMode === 'spectrum' && selectedColorHue != null
                        ? Math.round(selectedOrAverageX * 100)
                        : selectedMemberValues?.saturation ??
                              controlValuesFromPosition(relativeLayout.averageX, relativeLayout.averageBrightness, uiMode)
                                  .saturation
                );
                setBrightness(selectedOrAverageBrightness);
                setKelvin(uiMode === 'temperature' ? kelvinFromXPosition(selectedOrAverageX, groupLight ?? light) : null);
            }
            return;
        }

        if (groupedLightIds.length && effectiveControlScope !== 'individual' && groupLight) {
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

        setIsOn(isLightOn(nextLight));

        if (nextLight.attributes.brightness !== undefined) {
            setBrightness(Math.round((nextLight.attributes.brightness / 255) * 100));
        }

        if (uiMode === 'spectrum' && selectedColorHue != null) {
            setHue(selectedColorHue);
            if (nextLight.attributes.hs_color) {
                setSaturation(nextLight.attributes.hs_color[1]);
            }
            setKelvin(null);
        } else if (nextLight.attributes.hs_color) {
            setHue(nextLight.attributes.hs_color[0]);
            setSaturation(nextLight.attributes.hs_color[1]);
        }

        if (uiMode !== 'spectrum' || selectedColorHue == null) {
            const temperatureValues = getMarkerControlValues(nextLight, 'temperature');
            setHue(temperatureValues.hue);
            setSaturation(temperatureValues.saturation);

            if (nextLight.attributes.color_temp_kelvin != null || nextLight.attributes.color_temp != null) {
                const nextKelvin =
                    nextLight.attributes.color_temp_kelvin ||
                    Math.round(1000000 / nextLight.attributes.color_temp!);
                setKelvin(nextKelvin);
            } else if (nextLight.attributes.hs_color) {
                const derivedKelvin = kelvinFromXPosition(
                    xFractionFromHueSat(temperatureValues.hue, temperatureValues.saturation, 'temperature'),
                    nextLight
                );
                setKelvin(derivedKelvin);
            }
        }

        setUiMode((previousMode) => {
            const activeUiModeLock = uiModeSyncLock.current;
            if (activeUiModeLock) {
                if (activeUiModeLock.expiresAt > Date.now()) {
                    return activeUiModeLock.mode;
                }

                uiModeSyncLock.current = null;
            }

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
        activeLightStateSignature,
        effectiveControlScope,
        ensureGroupRelativeLayout,
        groupLightStateSignature,
        groupedLightIds,
        groupedLightStateSignature,
        hass,
        isDiscoMode,
        controlledLightEntityId,
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

    const lockUiModeSync = useCallback((mode: 'temperature' | 'spectrum', durationMs = UI_MODE_SYNC_LOCK_MS) => {
        uiModeSyncLock.current = {
            mode,
            expiresAt: Date.now() + durationMs,
        };
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

    const resetQueuedControlState = useCallback(() => {
        pendingControlCommand.current = null;
        lastSentControlCommand.current = null;
        lastCommandTime.current = 0;
        if (controlSendTimeout.current) {
            window.clearTimeout(controlSendTimeout.current);
            controlSendTimeout.current = null;
        }
    }, []);

    const startDiscoMode = useCallback(() => {
        resetQueuedControlState();
        controlBatchInFlight.current = false;
        discoBatchInFlight.current = false;
        groupRelativeInteractionSnapshot.current = null;
        const targetIds = groupedLightIds.length ? groupedLightIds : [activeEntityIdRef.current];
        const initialCommands = targetIds.map((targetId, index) => {
            const hueOffset = targetIds.length > 1 ? (360 / targetIds.length) * index : 0;
            return {
                entityId: targetId,
                brightness: 88,
                hsColor: [Math.round(hueOffset % 360), 100] as [number, number],
            };
        });

        setUiMode('spectrum');
        setKelvin(null);
        setHue(initialCommands[0]?.hsColor[0] ?? 0);
        setSaturation(100);
        setBrightness(initialCommands[0]?.brightness ?? 88);
        setIsOn(true);
        discoStepRef.current = 1;
        markInteraction(900);

        void Promise.all(
            initialCommands.map((command) =>
                callLightService(hassRef.current, command.entityId, true, {
                    brightness: command.brightness,
                    hs_color: command.hsColor,
                })
            )
        ).catch((error) => {
            console.error('[Dual Halo Controller] Failed to start disco mode', {
                targetIds,
                error,
            });
        });

        setIsDiscoMode(true);
    }, [groupedLightIds, markInteraction, resetQueuedControlState]);

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

        if (discoStepRef.current === 0) {
            applyDiscoFrame();
        }
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

    const applyFavoriteDirectly = useCallback(
        (favorite: FavoritePreset) => {
            const activeHass = hassRef.current;
            if (!activeHass) return;

            if (favorite.scope === 'group') {
                const groupCommands = favorite.members
                    .map((member) => {
                        const targetLight = getLightState(activeHass, member.entityId);
                        if (!targetLight || !isLightAvailable(targetLight)) return null;

                        return buildQueuedControlCommand(
                            member.entityId,
                            targetLight,
                            {
                                brightness: member.settings.brightness,
                                hue: member.settings.hue,
                                saturation: member.settings.saturation,
                            },
                            member.settings.mode
                        );
                    })
                    .filter((command): command is QueuedControlCommand => command != null);

                if (groupCommands.length) {
                    queueControlCommand(groupCommands);
                    flushQueuedControlCommand(true);
                }
                return;
            }

            const targetLight = getLightState(activeHass, favorite.entityId);
            if (!targetLight || !isLightAvailable(targetLight)) return;

            const nextCommand = buildQueuedControlCommand(
                favorite.entityId,
                targetLight,
                {
                    brightness: favorite.settings.brightness,
                    hue: favorite.settings.hue,
                    saturation: favorite.settings.saturation,
                },
                favorite.settings.mode
            );

            queueControlCommand([nextCommand]);
            flushQueuedControlCommand(true);
        },
        [flushQueuedControlCommand, queueControlCommand]
    );

    const favoriteMatchesLiveState = useCallback(
        (favorite: FavoritePreset) => {
            const activeHass = hassRef.current;
            if (!activeHass) return false;

            if (favorite.scope === 'group' && favorite.members.length) {
                return favorite.members.every((member) => {
                    const liveSettings = buildFavoriteSettingsFromLightState(getLightState(activeHass, member.entityId));
                    return liveSettings ? favoriteSettingsMatch(member.settings, liveSettings) : false;
                });
            }

            const targetEntityId = favorite.scope === 'individual' ? favorite.entityId : entityId;
            const liveSettings = buildFavoriteSettingsFromLightState(getLightState(activeHass, targetEntityId));
            return liveSettings ? favoriteSettingsMatch(favorite.settings, liveSettings) : false;
        },
        [entityId]
    );

    const processPendingFavoriteSceneActivation = useCallback(() => {
        if (favoriteSceneApplyInFlight.current) return;

        favoriteSceneApplyInFlight.current = true;
        void (async () => {
            try {
                while (true) {
                    const nextActivation = pendingFavoriteSceneApply.current;
                    if (!nextActivation) break;

                    pendingFavoriteSceneApply.current = null;

                    try {
                        await activateScene(hassRef.current, nextActivation.favorite.sceneEntityId);
                        await waitForMs(250);

                        const hasNewerFavoriteRequest =
                            pendingFavoriteSceneApply.current != null ||
                            nextActivation.token !== lastRequestedFavoriteSceneToken.current;

                        if (!hasNewerFavoriteRequest && !favoriteMatchesLiveState(nextActivation.favorite)) {
                            resetQueuedControlState();
                            applyFavoriteDirectly(nextActivation.favorite);
                        }
                    } catch (error) {
                        console.error('[Dual Halo Controller] Failed to activate favourite scene', {
                            entityId,
                            favoriteId: nextActivation.favorite.id,
                            sceneEntityId: nextActivation.favorite.sceneEntityId,
                            error,
                        });

                        const hasNewerFavoriteRequest =
                            pendingFavoriteSceneApply.current != null ||
                            nextActivation.token !== lastRequestedFavoriteSceneToken.current;

                        if (!hasNewerFavoriteRequest) {
                            applyFavoriteDirectly(nextActivation.favorite);
                        }
                    }
                }
            } finally {
                favoriteSceneApplyInFlight.current = false;

                if (pendingFavoriteSceneApply.current) {
                    processPendingFavoriteSceneActivation();
                }
            }
        })();
    }, [applyFavoriteDirectly, entityId, favoriteMatchesLiveState, resetQueuedControlState]);

    const queueFavoriteSceneActivation = useCallback(
        (favorite: FavoritePreset) => {
            pendingFavoriteSceneApply.current = {
                favorite,
                token: lastRequestedFavoriteSceneToken.current + 1,
            };
            lastRequestedFavoriteSceneToken.current += 1;
            processPendingFavoriteSceneActivation();
        },
        [processPendingFavoriteSceneActivation]
    );

    const beginControlInteraction = useCallback(() => {
        isUserInteracting.current = true;
        if (interactionTimeout.current) {
            window.clearTimeout(interactionTimeout.current);
            interactionTimeout.current = null;
        }

        if (effectiveControlScope === 'group-relative') {
            groupRelativeInteractionSnapshot.current = ensureGroupRelativeLayout();
        } else {
            groupRelativeInteractionSnapshot.current = null;
            groupRelativeLayout.current = null;
        }
    }, [effectiveControlScope, ensureGroupRelativeLayout]);

    const handleControlsChange = useCallback(
        (nextHue: number, nextSaturation: number, nextBrightness: number) => {
            stopDiscoMode();
            beginControlInteraction();
            setHue(nextHue);
            setSaturation(nextSaturation);
            setBrightness(nextBrightness);

            if (uiMode === 'temperature') {
                setKelvin(kelvinFromXPosition(xFractionFromHueSat(nextHue, nextSaturation, 'temperature'), light));
            } else {
                setKelvin(null);
            }

            if (effectiveControlScope === 'group-relative' && groupedLightIds.length) {
                const snapshot = groupRelativeInteractionSnapshot.current ?? ensureGroupRelativeLayout();
                if (!snapshot) return;

                const nextX = xFractionFromHueSat(nextHue, nextSaturation, uiMode);
                const selectedRelativeLightEntityId = controlledLightEntityIdRef.current;
                const nextRelativeLayoutMembers = selectedRelativeLightEntityId
                    ? snapshot.members.map((member) =>
                          member.entityId === selectedRelativeLightEntityId &&
                          isControllableGroupRelativeMember(hass, member)
                              ? {
                                    ...member,
                                    x: nextX,
                                    brightness: nextBrightness,
                                }
                              : member
                      )
                    : (() => {
                          const deltaX = nextX - snapshot.averageX;
                          const deltaBrightness = nextBrightness - snapshot.averageBrightness;
                          return snapshot.members.map((member) => ({
                              ...member,
                              x: isControllableGroupRelativeMember(hass, member) ? member.x + deltaX : member.x,
                              brightness: isControllableGroupRelativeMember(hass, member)
                                  ? member.brightness + deltaBrightness
                                  : member.brightness,
                          }));
                      })();

                const nextRelativeLayout = buildGroupRelativeSnapshotFromMembers(
                    hass,
                    uiMode,
                    nextRelativeLayoutMembers
                );

                groupRelativeLayout.current = nextRelativeLayout;
                if (hasLitGroupRelativeMembers(nextRelativeLayout)) {
                    rememberLastLitGroupRelativeLayout(nextRelativeLayout);
                }

                const relativeCommands = buildRelativeControlCommands(nextRelativeLayout.members, uiMode);

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
            buildRelativeControlCommands,
            controlledLightEntityId,
            effectiveControlScope,
            ensureGroupRelativeLayout,
            groupedLightIds,
            hass,
            light,
            queueControlCommand,
            stopDiscoMode,
            uiMode,
            rememberLastLitGroupRelativeLayout,
        ]
    );

    const handlePadDoubleSelect = useCallback(
        (nextHue: number, nextSaturation: number, nextBrightness: number) => {
            stopDiscoMode();
            beginControlInteraction();
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

    const restoreRememberedControllerState = useCallback(
        (restoreScope: ControlScope, restoreEntityId: string | null) => {
            if (restoreScope === 'group-relative' && groupedLightIds.length) {
                const restoreLayout = lastLitGroupRelativeLayout.current;
                if (restoreLayout && hasLitGroupRelativeMembers(restoreLayout)) {
                    const restoredLayout = cloneGroupRelativeSnapshot(restoreLayout);
                    const restoredValues = controlValuesFromPosition(
                        restoredLayout.averageX,
                        restoredLayout.averageBrightness,
                        restoredLayout.mode
                    );

                    groupRelativeLayout.current = restoredLayout;
                    groupRelativeInteractionSnapshot.current = null;
                    setControlScope('group-relative');
                    controlledLightEntityIdRef.current = null;
                    setControlledLightEntityId(null);
                    setIsOn(true);
                    lockUiModeSync(restoredLayout.mode);
                    setUiMode(restoredLayout.mode);
                    setBrightness(restoredLayout.averageBrightness);

                    if (restoredLayout.mode === 'spectrum') {
                        const restoredHue = Math.round(restoredLayout.averageX * 360);
                        setSelectedColorHue(restoredHue);
                        setHue(restoredHue);
                        setSaturation(Math.round(restoredLayout.averageX * 100));
                        setKelvin(null);
                        hasExplicitModeSelection.current = true;
                    } else {
                        setSelectedColorHue(null);
                        setHue(restoredValues.hue);
                        setSaturation(restoredValues.saturation);
                        setKelvin(kelvinFromXPosition(restoredLayout.averageX, groupLight ?? light));
                        hasExplicitModeSelection.current = false;
                    }

                    const restoreCommands = buildRelativeControlCommands(restoredLayout.members, restoredLayout.mode);

                    if (restoreCommands.length) {
                        queueControlCommand(restoreCommands);
                        flushQueuedControlCommand(true);
                    }
                    void (async () => {
                        await waitForMs(320);

                        const activeHass = hassRef.current;
                        const hasLitMembers = restoredLayout.members.some((member) =>
                            isLightOn(getLightState(activeHass, member.entityId))
                        );
                        if (hasLitMembers) {
                            return;
                        }

                        try {
                            await callQueuedCommandsDirectly(activeHass, restoreCommands);
                        } catch (error) {
                            console.error('[Dual Halo Controller] Failed to reapply group-relative restore', {
                                entityId,
                                restoreScope,
                                error,
                            });
                        }
                    })();
                    return true;
                }
            }

            const targetEntityId = restoreScope === 'individual' && restoreEntityId ? restoreEntityId : entityId;
            const restoreSettings = lastLitControlSettings.current[targetEntityId];
            const targetLight =
                getLightState(hass, targetEntityId) ??
                (restoreScope === 'group' ? groupLight ?? light : light ?? groupLight);

            if (!restoreSettings || !targetLight) {
                return false;
            }

            const restoredBrightness = Math.max(1, restoreSettings.brightness);
            setControlScope(restoreScope);
            if (restoreScope === 'individual') {
                controlledLightEntityIdRef.current = targetEntityId;
                setControlledLightEntityId(targetEntityId);
            } else {
                controlledLightEntityIdRef.current = null;
                setControlledLightEntityId(null);
            }
            setIsOn(true);
            lockUiModeSync(restoreSettings.mode);
            setUiMode(restoreSettings.mode);
            setSelectedColorHue(restoreSettings.selectedColorHue);
            setHue(restoreSettings.hue);
            setSaturation(restoreSettings.saturation);
            setBrightness(restoredBrightness);
            setKelvin(restoreSettings.mode === 'temperature' ? restoreSettings.kelvin : null);
            hasExplicitModeSelection.current =
                restoreSettings.mode === 'spectrum' && restoreSettings.selectedColorHue != null;

            const restoreCommand = buildQueuedControlCommand(
                targetEntityId,
                restoreScope === 'group' ? (groupLight ?? targetLight) : targetLight,
                {
                    brightness: restoredBrightness,
                    hue: restoreSettings.hue,
                    saturation: restoreSettings.saturation,
                },
                restoreSettings.mode
            );

            queueControlCommand([restoreCommand]);
            flushQueuedControlCommand(true);
            void (async () => {
                await waitForMs(320);

                const activeHass = hassRef.current;
                if (restoreScope === 'group' && groupedLightIds.length) {
                    const hasLitMembers = groupedLightIds.some((memberEntityId) =>
                        isLightOn(getLightState(activeHass, memberEntityId))
                    );
                    if (hasLitMembers) {
                        return;
                    }

                    const memberRestoreCommands = groupedLightIds
                        .map((memberEntityId) => {
                            const memberLight = getLightState(activeHass, memberEntityId);
                            if (!memberLight || !isLightAvailable(memberLight)) return null;

                            return buildQueuedControlCommand(
                                memberEntityId,
                                memberLight,
                                {
                                    brightness: restoredBrightness,
                                    hue: restoreSettings.hue,
                                    saturation: restoreSettings.saturation,
                                },
                                restoreSettings.mode
                            );
                        })
                        .filter((command): command is QueuedControlCommand => command != null);

                    if (!memberRestoreCommands.length) {
                        return;
                    }

                    try {
                        await callQueuedCommandsDirectly(activeHass, memberRestoreCommands);
                    } catch (error) {
                        console.error('[Dual Halo Controller] Failed to reapply grouped restore', {
                            entityId,
                            restoreScope,
                            error,
                        });
                    }
                    return;
                }

                if (isLightOn(getLightState(activeHass, targetEntityId))) {
                    return;
                }

                try {
                    await callQueuedCommandsDirectly(activeHass, [restoreCommand]);
                } catch (error) {
                    console.error('[Dual Halo Controller] Failed to reapply restore command', {
                        entityId,
                        restoreScope,
                        targetEntityId,
                        error,
                    });
                }
            })();
            return true;
        },
        [
            buildRelativeControlCommands,
            entityId,
            flushQueuedControlCommand,
            groupLight,
            groupedLightIds,
            hass,
            light,
            lockUiModeSync,
            queueControlCommand,
        ]
    );

    const handleToggle = useCallback(() => {
        stopDiscoMode();
        
        // Always check actual HA state, not React state
        const targetEntityId =
            effectiveControlScope === 'individual' && controlledLightEntityId ? controlledLightEntityId : entityId;
        const actualLightState = getLightState(hass, targetEntityId);
        const actualIsOn = isLightOn(actualLightState);
        const nextState = !actualIsOn;  // Use actual HA state, not React state
        
        const currentRelativeLayout = effectiveControlScope === 'group-relative' ? ensureGroupRelativeLayout() : null;
        if (!nextState && currentRelativeLayout && hasLitGroupRelativeMembers(currentRelativeLayout)) {
            rememberLastLitGroupRelativeLayout(currentRelativeLayout);
        } else if (!nextState && effectiveControlScope !== 'group-relative' && brightness > 0) {
            rememberLastLitControlSettings(currentControlRestoreKey, {
                brightness,
                hue,
                isOn: true,
                kelvin,
                mode: uiMode,
                saturation,
                selectedColorHue,
            });
        }
        
        // Clean up state
        markInteraction(1000);
        groupRelativeLayout.current = null;
        groupRelativeInteractionSnapshot.current = null;
        if (!nextState && effectiveControlScope === 'group-relative') {
            controlledLightEntityIdRef.current = null;
            setControlledLightEntityId(null);
        }

        // Try to restore saved state if turning on
        const shouldTryRestore = nextState && effectiveControlScope === (controlledLightEntityId ? 'individual' : 'group');
        if (shouldTryRestore && restoreRememberedControllerState(effectiveControlScope, controlledLightEntityId)) {
            // State was restored and service call was made by restoreRememberedControllerState
            return;
        }

        // Always call the service (don't return early without calling it)
        callLightService(hass, targetEntityId, nextState);
        setIsOn(nextState);
    }, [
        brightness,
        controlledLightEntityId,
        currentControlRestoreKey,
        effectiveControlScope,
        ensureGroupRelativeLayout,
        entityId,
        hass,
        hue,
        kelvin,
        markInteraction,
        rememberLastLitControlSettings,
        rememberLastLitGroupRelativeLayout,
        restoreRememberedControllerState,
        saturation,
        selectedColorHue,
        stopDiscoMode,
        uiMode,
    ]);

    const handleCompactToggle = useCallback(() => {
        const isGroupedCompactCard = groupedLightIds.length > 0;
        const compactRestoreScope: ControlScope = isGroupedCompactCard
            ? controlScope === 'group-relative' && hasLitGroupRelativeMembers(lastLitGroupRelativeLayout.current)
                ? 'group-relative'
                : 'group'
            : effectiveControlScope === 'individual' && controlledLightEntityId
              ? 'individual'
              : 'group';
        const compactRestoreEntityId = compactRestoreScope === 'individual' ? controlledLightEntityId : null;
        const toggleTargetEntityId =
            compactRestoreScope === 'individual' && controlledLightEntityId ? controlledLightEntityId : entityId;
        const toggleTargetLight =
            getLightState(hass, toggleTargetEntityId) ??
            (isGroupedCompactCard ? groupLight ?? light : effectiveControlScope === 'group' ? groupLight : light ?? groupLight);
        if (!toggleTargetLight) return;

        stopDiscoMode();
        // Use actual HA state instead of computed React state for consistency
        const actualIsOn = isLightOn(toggleTargetLight);
        const nextState = !actualIsOn;
        if (!nextState) {
            if (compactRestoreScope === 'group-relative') {
                const currentRelativeLayout = ensureGroupRelativeLayout();
                if (currentRelativeLayout && hasLitGroupRelativeMembers(currentRelativeLayout)) {
                    rememberLastLitGroupRelativeLayout(currentRelativeLayout);
                }
            } else {
                const currentTargetSettings = buildFavoriteSettingsFromLightState(
                    isGroupedCompactCard ? (groupLight ?? toggleTargetLight) : toggleTargetLight
                );
                if (currentTargetSettings?.isOn && currentTargetSettings.brightness > 0) {
                    rememberLastLitControlSettings(
                        isGroupedCompactCard ? entityId : toggleTargetEntityId,
                        currentTargetSettings
                    );
                }
            }
        }
        setIsOn(nextState);
        markInteraction(1000);
        groupRelativeLayout.current = null;
        groupRelativeInteractionSnapshot.current = null;
        if (!nextState && compactRestoreScope === 'group-relative') {
            controlledLightEntityIdRef.current = null;
            setControlledLightEntityId(null);
        }

        // Try to restore if turning on, but always call the service
        const shouldTryRestore = nextState && (compactRestoreScope === 'individual' || isGroupedCompactCard);
        if (shouldTryRestore && restoreRememberedControllerState(compactRestoreScope, compactRestoreEntityId)) {
            // State was restored, don't override it
        } else {
            // Always ensure service is called
            callLightService(hass, toggleTargetEntityId, nextState);
        }
    }, [
        controlScope,
        controlledLightEntityId,
        entityId,
        ensureGroupRelativeLayout,
        effectiveControlScope,
        groupLight,
        groupedLightIds,
        hass,
        lastLitGroupRelativeLayout,
        light,
        markInteraction,
        rememberLastLitControlSettings,
        rememberLastLitGroupRelativeLayout,
        restoreRememberedControllerState,
        stopDiscoMode,
    ]);

    const handleModeChange = useCallback(
        (mode: 'temperature' | 'spectrum') => {
            if (mode === 'temperature' && !supportsTemperature) return;
            if (mode === 'spectrum' && !supportsSpectrum) return;

            stopDiscoMode();
            clearInteractionLock();
            hasExplicitModeSelection.current = true;
            setSelectedColorHue(null);
            setUiMode(mode);
            groupRelativeLayout.current = null;
            groupRelativeInteractionSnapshot.current = null;
        },
        [clearInteractionLock, stopDiscoMode, supportsSpectrum, supportsTemperature]
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

    const buildFavoriteSettingsFromLight = useCallback(
        (targetLight: ReturnType<typeof getLightState>) => buildFavoriteSettingsFromLightState(targetLight),
        []
    );

    const currentFavoriteSettings: FavoriteSettings = useMemo(() => ({
        brightness,
        hue,
        isOn,
        kelvin,
        mode: uiMode,
        saturation,
        selectedColorHue,
    }), [brightness, hue, isOn, kelvin, uiMode, saturation, selectedColorHue]);
    const builtinFavoritePresets = buildBuiltinFavoritePresets(new Date(), hass?.states?.['sun.sun']);

    const activeFavoriteId =
        favoritePresets.find((favorite) => {
            if (favorite.scope === 'individual') {
                const liveSettings = buildFavoriteSettingsFromLight(getLightState(hass, favorite.entityId));
                return liveSettings ? favoriteSettingsMatch(favorite.settings, liveSettings) : false;
            }

            if (!favorite.members.length) {
                return favoriteSettingsMatch(favorite.settings, currentFavoriteSettings);
            }

            return favorite.members.every((member) => {
                const liveSettings = buildFavoriteSettingsFromLight(getLightState(hass, member.entityId));
                return liveSettings ? favoriteSettingsMatch(member.settings, liveSettings) : false;
            });
        })?.id ??
        builtinFavoritePresets.find((favorite) => favoriteSettingsMatch(favorite.settings, currentFavoriteSettings))?.id ??
        null;

    const handleBuiltinFavoriteApply = useCallback(
        (favoriteId: string) => {
            const favorite = builtinFavoritePresets.find((candidate) => candidate.id === favoriteId);
            if (!favorite) return;

            stopDiscoMode();
            resetQueuedControlState();
            clearInteractionLock();
            groupRelativeInteractionSnapshot.current = null;
            markInteraction(900);

            const targetSettings = favorite.settings;
            const targetBrightness = Math.max(0, targetSettings.brightness);
            const targetX = xFractionFromHueSat(targetSettings.hue, targetSettings.saturation, targetSettings.mode);
            hasExplicitModeSelection.current =
                targetSettings.mode === 'spectrum' && targetSettings.selectedColorHue != null;

            setIsOn(targetSettings.isOn);
            lockUiModeSync(targetSettings.mode);
            setUiMode(targetSettings.mode);
            setSelectedColorHue(targetSettings.selectedColorHue);
            setHue(targetSettings.hue);
            setSaturation(targetSettings.saturation);
            setBrightness(targetBrightness);
            setKelvin(targetSettings.mode === 'temperature' ? targetSettings.kelvin : null);

            if (effectiveControlScope === 'group-relative' && groupedLightIds.length) {
                const snapshot =
                    buildGroupRelativeSnapshot(
                        hass,
                        groupedLightIds,
                        targetSettings.mode,
                        targetSettings.mode === 'spectrum' ? targetSettings.selectedColorHue : null
                    ) ?? ensureGroupRelativeLayout();

                if (snapshot) {
                    const deltaX = targetX - snapshot.averageX;
                    const deltaBrightness = targetBrightness - snapshot.averageBrightness;
                    const nextRelativeLayout = buildGroupRelativeSnapshotFromMembers(
                        hass,
                        targetSettings.mode,
                        snapshot.members.map((member) => ({
                            ...member,
                            x: isControllableGroupRelativeMember(hass, member) ? member.x + deltaX : member.x,
                            brightness: isControllableGroupRelativeMember(hass, member)
                                ? member.brightness + deltaBrightness
                                : member.brightness,
                        }))
                    );

                    groupRelativeLayout.current = nextRelativeLayout;
                    if (hasLitGroupRelativeMembers(nextRelativeLayout)) {
                        rememberLastLitGroupRelativeLayout(nextRelativeLayout);
                    }

                    const relativeCommands = buildRelativeControlCommands(
                        nextRelativeLayout.members,
                        targetSettings.mode
                    );

                    queueControlCommand(relativeCommands);
                    flushQueuedControlCommand(true);
                    return;
                }
            }

            const targetEntityId =
                effectiveControlScope === 'individual' && controlledLightEntityId ? controlledLightEntityId : entityId;
            const targetLight =
                getLightState(hass, targetEntityId) ??
                (effectiveControlScope === 'group' ? groupLight ?? light : light ?? groupLight);

            if (!targetLight) return;

            if (targetBrightness > 0) {
                rememberLastLitControlSettings(targetEntityId, {
                    ...targetSettings,
                    brightness: targetBrightness,
                    isOn: true,
                });
            }

            const nextCommand = buildQueuedControlCommand(
                targetEntityId,
                effectiveControlScope === 'group' ? (groupLight ?? targetLight) : targetLight,
                {
                    brightness: targetBrightness,
                    hue: targetSettings.hue,
                    saturation: targetSettings.saturation,
                },
                targetSettings.mode
            );

            queueControlCommand([nextCommand]);
            flushQueuedControlCommand(true);
        },
        [
            buildRelativeControlCommands,
            builtinFavoritePresets,
            clearInteractionLock,
            controlledLightEntityId,
            entityId,
            ensureGroupRelativeLayout,
            effectiveControlScope,
            flushQueuedControlCommand,
            groupLight,
            groupedLightIds,
            hass,
            light,
            lockUiModeSync,
            markInteraction,
            queueControlCommand,
            resetQueuedControlState,
            rememberLastLitControlSettings,
            rememberLastLitGroupRelativeLayout,
            stopDiscoMode,
        ]
    );

    const handleFavoriteSave = useCallback(() => {
        void (async () => {
            let nextFavorite;

            if (effectiveControlScope === 'individual' && controlledLightEntityId) {
                const targetSettings = buildFavoriteSettingsFromLight(getLightState(hass, controlledLightEntityId));
                if (!targetSettings) {
                    return;
                }

                nextFavorite = createOwnedIndividualFavoritePreset(entityId, controlledLightEntityId, targetSettings);
            } else {
                const memberPresets: FavoriteMemberPreset[] = groupedLightIds
                    .map((memberEntityId) => {
                        const memberLight = getLightState(hass, memberEntityId);
                        const memberSettings = buildFavoriteSettingsFromLight(memberLight);
                        if (!memberLight || !memberSettings) return null;

                        const memberPreset: FavoriteMemberPreset = {
                            entityId: memberEntityId,
                            settings: memberSettings,
                        };

                        if (memberLight.attributes.friendly_name) {
                            memberPreset.name = memberLight.attributes.friendly_name;
                        }

                        return memberPreset;
                    })
                    .filter((member): member is FavoriteMemberPreset => member !== null);

                if (memberPresets.length) {
                    nextFavorite = createGroupFavoritePreset(entityId, currentFavoriteSettings, memberPresets);
                } else {
                    const targetSettings = buildFavoriteSettingsFromLight(groupLight ?? light);
                    if (!targetSettings) {
                        return;
                    }

                    nextFavorite = createOwnedIndividualFavoritePreset(entityId, entityId, targetSettings);
                }
            }

            const nextFavorites = appendFavoritePreset(favoritePresets, nextFavorite);
            const removedFavorites = favoritePresets.filter(
                (favorite) => !nextFavorites.some((candidate) => candidate.id === favorite.id)
            );

            try {
                await createSceneDefinition(hass, nextFavorite.sceneEntityId, buildFavoriteSceneEntities(nextFavorite));
                const deletionResults = await Promise.allSettled(
                    removedFavorites.map((favorite) => deleteScene(hass, favorite.sceneEntityId))
                );
                deletionResults.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        const favorite = removedFavorites[index];
                        console.warn('[Dual Halo Controller] Failed to delete replaced favourite scene', {
                            entityId,
                            sceneEntityId: favorite?.sceneEntityId,
                            favoriteId: favorite?.id,
                            error: result.reason,
                        });
                    }
                });
                setFavoritePresets(nextFavorites);
                saveFavoritePresets(entityId, nextFavorites);
            } catch (error) {
                console.error('[Dual Halo Controller] Failed to save favourite in Home Assistant', {
                    entityId,
                    nextFavorite,
                    error,
                });
            }
        })();
    }, [
        buildFavoriteSettingsFromLight,
        controlledLightEntityId,
        currentFavoriteSettings,
        entityId,
        effectiveControlScope,
        favoritePresets,
        groupLight,
        groupedLightIds,
        hass,
        light,
    ]);

    const handleFavoriteDelete = useCallback(
        (favoriteId: string) => {
            // Remove from UI state immediately to prevent race conditions
            const favoriteToDelete = favoritePresets.find((favorite) => favorite.id === favoriteId);
            if (!favoriteToDelete) return;

            const nextFavorites = favoritePresets.filter((favorite) => favorite.id !== favoriteId);
            
            // Update UI immediately
            setFavoritePresets(nextFavorites);
            saveFavoritePresets(entityId, nextFavorites);
            
            // Delete the scene in background without blocking
            void (async () => {
                try {
                    await deleteScene(hass, favoriteToDelete.sceneEntityId);
                } catch (error) {
                    console.error('[Dual Halo Controller] Failed to delete favourite scene', {
                        entityId,
                        favoriteId,
                        sceneEntityId: favoriteToDelete.sceneEntityId,
                        error,
                    });
                }
            })();
        },
        [entityId, favoritePresets, hass]
    );

    const handleFavoriteEditCommit = useCallback(
        (favoriteIdsToDelete: string[], shouldSaveCurrent: boolean) => {
            void (async () => {
                const deletions = new Set(favoriteIdsToDelete);
                let nextFavorites = favoritePresets.filter((favorite) => !deletions.has(favorite.id));
                const deletedFavorites = favoritePresets.filter((favorite) => deletions.has(favorite.id));
                let nextFavorite: FavoritePreset | null = null;

                if (shouldSaveCurrent) {
                    if (effectiveControlScope === 'individual' && controlledLightEntityId) {
                        const targetSettings = buildFavoriteSettingsFromLight(getLightState(hass, controlledLightEntityId));
                        if (targetSettings) {
                            nextFavorite = createOwnedIndividualFavoritePreset(
                                entityId,
                                controlledLightEntityId,
                                targetSettings
                            );
                        }
                    } else {
                        const memberPresets: FavoriteMemberPreset[] = groupedLightIds
                            .map((memberEntityId) => {
                                const memberLight = getLightState(hass, memberEntityId);
                                const memberSettings = buildFavoriteSettingsFromLight(memberLight);
                                if (!memberLight || !memberSettings) return null;

                                const memberPreset: FavoriteMemberPreset = {
                                    entityId: memberEntityId,
                                    settings: memberSettings,
                                };

                                if (memberLight.attributes.friendly_name) {
                                    memberPreset.name = memberLight.attributes.friendly_name;
                                }

                                return memberPreset;
                            })
                            .filter((member): member is FavoriteMemberPreset => member !== null);

                        if (memberPresets.length) {
                            nextFavorite = createGroupFavoritePreset(entityId, currentFavoriteSettings, memberPresets);
                        } else {
                            const targetSettings = buildFavoriteSettingsFromLight(groupLight ?? light);
                            if (targetSettings) {
                                nextFavorite = createOwnedIndividualFavoritePreset(entityId, entityId, targetSettings);
                            }
                        }
                    }

                    if (nextFavorite) {
                        const matchesDeletedFavorite = deletedFavorites.some((favorite) =>
                            favoritePresetsTargetMatch(favorite, nextFavorite as FavoritePreset)
                        );
                        const matchesRemainingFavorite = nextFavorites.some((favorite) =>
                            favoritePresetsTargetMatch(favorite, nextFavorite as FavoritePreset)
                        );

                        if (matchesDeletedFavorite || matchesRemainingFavorite) {
                            nextFavorite = null;
                        } else {
                            nextFavorites = appendFavoritePreset(nextFavorites, nextFavorite);
                        }
                    }
                }

                const removedFavorites = favoritePresets.filter(
                    (favorite) => !nextFavorites.some((candidate) => candidate.id === favorite.id)
                );

                try {
                    if (nextFavorite) {
                        await createSceneDefinition(
                            hass,
                            nextFavorite.sceneEntityId,
                            buildFavoriteSceneEntities(nextFavorite)
                        );
                    }
                    const deletionResults = await Promise.allSettled(
                        removedFavorites.map((favorite) => deleteScene(hass, favorite.sceneEntityId))
                    );
                    deletionResults.forEach((result, index) => {
                        if (result.status === 'rejected') {
                            const favorite = removedFavorites[index];
                            console.warn('[Dual Halo Controller] Failed to delete edited favourite scene', {
                                entityId,
                                sceneEntityId: favorite?.sceneEntityId,
                                favoriteId: favorite?.id,
                                error: result.reason,
                            });
                        }
                    });
                    setFavoritePresets(nextFavorites);
                    saveFavoritePresets(entityId, nextFavorites);
                } catch (error) {
                    console.error('[Dual Halo Controller] Failed to commit favourite edits', {
                        entityId,
                        favoriteIdsToDelete,
                        shouldSaveCurrent,
                        deletedFavorites,
                        nextFavorite,
                        error,
                    });
                }
            })();
        },
        [
            buildFavoriteSettingsFromLight,
            controlledLightEntityId,
            currentFavoriteSettings,
            entityId,
            effectiveControlScope,
            favoritePresets,
            groupLight,
            groupedLightIds,
            hass,
            light,
        ]
    );

    const handleFavoriteApply = useCallback(
        (favoriteId: string) => {
            const favorite = favoritePresets.find((candidate) => candidate.id === favoriteId);
            if (!favorite) return;

            stopDiscoMode();
            resetQueuedControlState();
            clearInteractionLock();
            hasExplicitModeSelection.current =
                favorite.settings.mode === 'spectrum' && favorite.settings.selectedColorHue != null;
            groupRelativeInteractionSnapshot.current = null;
            groupRelativeLayout.current = null;

            lockUiModeSync(favorite.settings.mode);
            setUiMode(favorite.settings.mode);
            setSelectedColorHue(favorite.settings.selectedColorHue);
            setIsOn(favorite.settings.isOn);
            setHue(favorite.settings.hue);
            setSaturation(favorite.settings.saturation);
            setBrightness(favorite.settings.brightness);
            setKelvin(favorite.settings.mode === 'temperature' ? favorite.settings.kelvin : null);
            markInteraction(900);
            if (favorite.scope === 'group') {
                activeEntityIdRef.current = entityId;
                setControlScope('group');
                controlledLightEntityIdRef.current = null;
                setControlledLightEntityId(null);

                if (favorite.settings.isOn && favorite.settings.brightness > 0) {
                    rememberLastLitControlSettings(entityId, {
                        ...favorite.settings,
                        brightness: Math.max(1, favorite.settings.brightness),
                        isOn: true,
                    });
                }
            } else {
                activeEntityIdRef.current = favorite.entityId;
                setControlScope('individual');
                controlledLightEntityIdRef.current = favorite.entityId;
                setControlledLightEntityId(favorite.entityId);

                if (favorite.settings.isOn && favorite.settings.brightness > 0) {
                    rememberLastLitControlSettings(favorite.entityId, {
                        ...favorite.settings,
                        brightness: Math.max(1, favorite.settings.brightness),
                        isOn: true,
                    });
                }
            }

            queueFavoriteSceneActivation(favorite);
        },
        [
            clearInteractionLock,
            entityId,
            favoritePresets,
            lockUiModeSync,
            markInteraction,
            queueFavoriteSceneActivation,
            resetQueuedControlState,
            rememberLastLitControlSettings,
            stopDiscoMode,
        ]
    );

    const handleGroupedLightSelect = useCallback((nextEntityId: string) => {
        const targetLight = getLightState(hass, nextEntityId);
        if (!isLightAvailable(targetLight)) {
            return;
        }

        activeEntityIdRef.current = nextEntityId;
        stopDiscoMode();

        if (controlScope === 'group-relative') {
            setControlScope('group-relative');
            controlledLightEntityIdRef.current = nextEntityId;
            setControlledLightEntityId(nextEntityId);
            return;
        }

        setControlScope('individual');
        controlledLightEntityIdRef.current = nextEntityId;
        setControlledLightEntityId(nextEntityId);
    }, [controlScope, hass, stopDiscoMode]);

    const handleGroupRelativeFormationSelect = useCallback(() => {
        stopDiscoMode();
        activeEntityIdRef.current = entityId;
        setControlScope('group-relative');
        controlledLightEntityIdRef.current = null;
        setControlledLightEntityId(null);
    }, [entityId, stopDiscoMode]);

    const handleGroupedLightToggle = useCallback(
        (nextEntityId: string) => {
            const targetLight = getLightState(hass, nextEntityId);
            if (!targetLight || !isLightAvailable(targetLight)) return;

            stopDiscoMode();
            groupRelativeLayout.current = null;
            groupRelativeInteractionSnapshot.current = null;

            void callLightService(hass, nextEntityId, !isLightOn(targetLight));
        },
        [hass, stopDiscoMode]
    );

    const handleControlScopeChange = useCallback((nextScope: 'group' | 'group-relative') => {
        stopDiscoMode();
        const resolvedNextScope = nextScope;

        if (resolvedNextScope === 'group-relative') {
            controlledLightEntityIdRef.current = null;
            setControlledLightEntityId(null);

            const anchoredRelativeLayout = buildAnchoredGroupRelativeLayout();
            const relativeLayout = anchoredRelativeLayout ?? ensureGroupRelativeLayout();
            if (relativeLayout) {
                groupRelativeLayout.current = relativeLayout;
                groupRelativeLayoutStateSignature.current = groupedLightStateSignature;
                groupRelativeInteractionSnapshot.current = null;
                if (hasLitGroupRelativeMembers(relativeLayout)) {
                    rememberLastLitGroupRelativeLayout(relativeLayout);
                }

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

                const relativeCommands = anchoredRelativeLayout
                    ? buildRelativeControlCommands(relativeLayout.members, uiMode)
                    : [];

                if (relativeCommands.length) {
                    queueControlCommand(relativeCommands);
                    flushQueuedControlCommand(true);
                }
            }
            setControlScope('group-relative');
            return;
        }

        const currentRelativeLayout = effectiveControlScope === 'group-relative' ? ensureGroupRelativeLayout() : null;
        if (currentRelativeLayout && hasLitGroupRelativeMembers(currentRelativeLayout)) {
            rememberLastLitGroupRelativeLayout(currentRelativeLayout);
        }

        controlledLightEntityIdRef.current = null;
        setControlledLightEntityId(null);
        setControlScope('group');
        groupRelativeInteractionSnapshot.current = null;
        groupRelativeLayout.current = null;
        clearInteractionLock();
        resetQueuedControlState();
        markInteraction(900);

        if (!groupedLightIds.length) {
            return;
        }

        const groupCommands = groupedLightIds
            .map((memberEntityId) => {
                const memberLight = getLightState(hass, memberEntityId) ?? groupLight ?? light;
                if (!memberLight || !isLightAvailable(memberLight)) return null;

                return buildQueuedControlCommand(
                    memberEntityId,
                    memberLight,
                    {
                        brightness,
                        hue,
                        saturation,
                    },
                    uiMode
                );
            })
            .filter((command): command is QueuedControlCommand => command != null);

        if (!groupCommands.length) {
            return;
        }

        queueControlCommand(groupCommands);
        flushQueuedControlCommand(true);
    }, [
        brightness,
        buildAnchoredGroupRelativeLayout,
        buildRelativeControlCommands,
        clearInteractionLock,
        effectiveControlScope,
        ensureGroupRelativeLayout,
        flushQueuedControlCommand,
        groupLight,
        groupedLightIds,
        groupedLightStateSignature,
        hass,
        hue,
        light,
        markInteraction,
        queueControlCommand,
        rememberLastLitGroupRelativeLayout,
        resetQueuedControlState,
        saturation,
        selectedColorHue,
        stopDiscoMode,
        uiMode,
    ]);

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
        controlScope: effectiveControlScope,
        controlledLightEntityId,
    });
    const expandedCardProps = {
        isDarkMode,
        lightName,
        expandedPrimaryName,
        expandedSecondaryName,
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
        padVisualStyle,
        onPadVisualStyleChange: setPadVisualStyle,
        onControlInteractionStart: beginControlInteraction,
        onControlInteractionEnd: handleControlInteractionEnd,
        isDiscoMode,
        onDiscoModeTrigger: startDiscoMode,
        onDiscoModeExit: stopDiscoMode,
        favoritePresets,
        builtinFavoritePresets,
        activeFavoriteId,
        onFavoriteSave: handleFavoriteSave,
        onFavoriteDelete: handleFavoriteDelete,
        onBuiltinFavoriteApply: handleBuiltinFavoriteApply,
        onFavoriteEditCommit: handleFavoriteEditCommit,
        onFavoriteApply: handleFavoriteApply,
        onPadMarkerSelect: groupedLights.length ? handleGroupedLightSelect : undefined,
        onFormationIndicatorSelect: handleGroupRelativeFormationSelect,
        onPadDoubleSelect: handlePadDoubleSelect,
        onToggle: handleToggle,
        groupedLights,
        groupedLightMarkers,
        groupRelativeFormationIndicator,
        controlScope: effectiveControlScope,
        controlledLightEntityId,
        onControlScopeChange: handleControlScopeChange,
        onGroupedLightSelect: handleGroupedLightSelect,
        onGroupedLightToggle: handleGroupedLightToggle,
    } as const;

    return (
        <div>
            <CompactCard
                layout={resolvedLayout}
                isDarkMode={isDarkMode}
                lightName={resolvedLayout === 'compact' ? compactLightName : lightName}
                expandedPrimaryName={resolvedLayout === 'compact' ? undefined : expandedPrimaryName}
                expandedSecondaryName={resolvedLayout === 'compact' ? null : expandedSecondaryName}
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
                padVisualStyle={padVisualStyle}
                onPadVisualStyleChange={setPadVisualStyle}
                onControlInteractionStart={beginControlInteraction}
                onControlInteractionEnd={handleControlInteractionEnd}
                isDiscoMode={isDiscoMode}
                onDiscoModeTrigger={startDiscoMode}
                onDiscoModeExit={stopDiscoMode}
                onPadMarkerSelect={groupedLights.length ? handleGroupedLightSelect : undefined}
                onFormationIndicatorSelect={handleGroupRelativeFormationSelect}
                onPadDoubleSelect={handlePadDoubleSelect}
                onToggle={resolvedLayout === 'compact' ? handleCompactToggle : handleToggle}
                favoritePresets={favoritePresets}
                builtinFavoritePresets={builtinFavoritePresets}
                activeFavoriteId={activeFavoriteId}
                onFavoriteSave={handleFavoriteSave}
                onBuiltinFavoriteApply={handleBuiltinFavoriteApply}
                onFavoriteDelete={handleFavoriteDelete}
                onFavoriteEditCommit={handleFavoriteEditCommit}
                onFavoriteApply={handleFavoriteApply}
                groupedLights={groupedLights}
                groupedLightMarkers={groupedLightMarkers}
                groupRelativeFormationIndicator={groupRelativeFormationIndicator}
                controlScope={effectiveControlScope}
                controlledLightEntityId={controlledLightEntityId}
                onControlScopeChange={handleControlScopeChange}
                onGroupedLightSelect={handleGroupedLightSelect}
                onGroupedLightToggle={handleGroupedLightToggle}
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

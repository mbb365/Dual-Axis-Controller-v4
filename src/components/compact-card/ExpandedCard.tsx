import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Halo, type HaloIndicatorSelection, type HaloMarker, type HaloVisualStyle } from '../Halo';
import { buildTemperatureIndicatorColor } from '../halo/halo-utils';
import type { GroupedLightOption } from '../CompactCard';
import type { BuiltinFavoritePreset, FavoritePreset, FavoriteSettings } from '../../utils/favorites';

interface ExpandedCardProps {
    isDarkMode: boolean;
    displayExpandedPrimaryName: string;
    displayExpandedSecondaryName: string | null;
    leadingValue: string;
    brightness: number;
    hue: number;
    saturation: number;
    isOn: boolean;
    uiMode: 'temperature' | 'spectrum';
    canUseTemperature: boolean;
    canUseSpectrum: boolean;
    selectedColorHue?: number | null;
    onModeChange: (mode: 'temperature' | 'spectrum') => void;
    padVisualStyle: HaloVisualStyle;
    onPadVisualStyleChange?: (style: HaloVisualStyle) => void;
    onControlsChange: (h: number, s: number, b: number) => void;
    onControlInteractionStart?: () => void;
    onControlInteractionEnd?: () => void;
    isDiscoMode?: boolean;
    onDiscoModeTrigger?: () => void;
    onDiscoModeExit?: () => void;
    onPadMarkerSelect?: (entityId: string) => void;
    onFormationIndicatorSelect?: () => void;
    onPadDoubleSelect?: (h: number, s: number, b: number) => void;
    onToggle: () => void;
    favoritePresets: FavoritePreset[];
    builtinFavoritePresets: BuiltinFavoritePreset[];
    activeFavoriteId?: string | null;
    onFavoriteSave?: () => void;
    onFavoriteApply?: (favoriteId: string) => void;
    onBuiltinFavoriteApply?: (favoriteId: string) => void;
    onFavoriteDelete?: (favoriteId: string) => void;
    onFavoriteEditCommit?: (favoriteIdsToDelete: string[], shouldSaveCurrent: boolean) => void;
    lightName: string;
    groupedLights: GroupedLightOption[];
    groupedLightMarkers: HaloMarker[];
    groupRelativeFormationIndicator?: HaloIndicatorSelection | null;
    controlScope: 'group' | 'group-relative' | 'individual';
    controlledLightEntityId?: string | null;
    isGroupListOpen: boolean;
    onGroupListToggle: () => void;
    onGroupListClose: () => void;
    onControlScopeChange?: (scope: 'group' | 'group-relative') => void;
    onGroupedLightSelect?: (entityId: string) => void;
    onGroupedLightToggle?: (entityId: string) => void;
    getGroupedLightToggleStyle: (
        groupedLight: GroupedLightOption
    ) => {
        background: string;
        color: string;
    };
}

const CONTROLLER_STYLE_OPTIONS: Array<{ style: HaloVisualStyle; label: string }> = [
    { style: 'plotter', label: 'Standard' },
    { style: 'matrix', label: 'Matrix' },
    { style: 'pixel', label: 'Brick' },
] as const;

function PadStylePreview({ style }: { style: HaloVisualStyle }) {
    if (style === 'pixel') {
        return (
            <span className="dual-card__pad-style-preview dual-card__pad-style-preview--pixel" aria-hidden="true">
                {Array.from({ length: 4 }).map((_, index) => (
                    <span key={index} className="dual-card__pad-style-cell" />
                ))}
            </span>
        );
    }

    if (style === 'matrix') {
        return (
            <span className="dual-card__pad-style-preview dual-card__pad-style-preview--matrix" aria-hidden="true">
                {Array.from({ length: 12 }).map((_, index) => (
                    <span key={index} className="dual-card__pad-style-dot" />
                ))}
            </span>
        );
    }

    return <span className={`dual-card__pad-style-preview dual-card__pad-style-preview--${style}`} aria-hidden="true" />;
}

function SettingsMenu({
    padVisualStyle,
    onPadVisualStyleChange,
    isEditingFavorites,
    onToggleFavoriteEditing,
}: Pick<ExpandedCardProps, 'padVisualStyle' | 'onPadVisualStyleChange'> & {
    isEditingFavorites: boolean;
    onToggleFavoriteEditing: () => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen]);

    return (
        <div className="dual-card__settings-anchor" ref={menuRef}>
            <button
                type="button"
                className={`dual-card__header-icon-button ${isOpen ? 'is-active' : ''}`}
                aria-label="Controller settings"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
            >
                <ha-icon icon="mdi:cog-outline" />
            </button>

            {isOpen ? (
                <div className="dual-card__settings-menu">
                    <div className="dual-card__settings-section">
                        <div className="dual-card__settings-label">Controller style</div>
                        <div className="dual-card__settings-options" role="group" aria-label="Controller style">
                            {CONTROLLER_STYLE_OPTIONS.map((option) => (
                                <button
                                    key={option.style}
                                    type="button"
                                    className={`dual-card__settings-option ${
                                        padVisualStyle === option.style ? 'is-active' : ''
                                    }`}
                                    onClick={() => {
                                        onPadVisualStyleChange?.(option.style);
                                        setIsOpen(false);
                                    }}
                                >
                                    <PadStylePreview style={option.style} />
                                    <span>{option.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="dual-card__settings-section">
                        <div className="dual-card__settings-label">Favourites</div>
                        <button
                            type="button"
                            className={`dual-card__settings-action ${isEditingFavorites ? 'is-active' : ''}`}
                            onClick={() => {
                                onToggleFavoriteEditing();
                                setIsOpen(false);
                            }}
                        >
                            <ha-icon icon={isEditingFavorites ? 'mdi:check' : 'mdi:pencil'} />
                            <span>{isEditingFavorites ? 'Done editing presets' : 'Edit presets'}</span>
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function ExpandedMetaHeader({
    leadingValue,
    brightness,
    isOn,
    displayExpandedSecondaryName,
}: Pick<
    ExpandedCardProps,
    'leadingValue' | 'brightness' | 'isOn' | 'displayExpandedSecondaryName'
>) {
    return (
        <div className="dual-card__expanded-header">
            <div className="dual-card__meta-value dual-card__meta-value--combined">{isOn ? `${leadingValue} at ${Math.round(brightness)}%` : 'Off'}</div>
            {displayExpandedSecondaryName ? (
                <div className="dual-card__meta-value dual-card__meta-value--name" title={displayExpandedSecondaryName}>
                    {displayExpandedSecondaryName}
                </div>
            ) : null}
        </div>
    );
}

function ModeControls({
    uiMode,
    canUseSpectrum,
    canUseTemperature,
    selectedColorHue,
    isOn,
    lightName,
    onModeChange,
    onToggle,
}: Pick<
    ExpandedCardProps,
    | 'uiMode'
    | 'canUseSpectrum'
    | 'canUseTemperature'
    | 'selectedColorHue'
    | 'isOn'
    | 'lightName'
    | 'onModeChange'
    | 'onToggle'
>) {
    return (
        <div className="dual-card__mode-row">
            <button
                type="button"
                className={`dual-card__mode-pill dual-card__mode-pill--spectrum ${
                    uiMode === 'spectrum' && selectedColorHue == null ? 'is-active' : ''
                }`}
                disabled={!canUseSpectrum}
                onClick={() => onModeChange('spectrum')}
            >
                Spectrum
            </button>
            <button
                type="button"
                className={`dual-card__power-pill ${isOn ? 'is-active' : ''}`}
                aria-label={`${isOn ? 'Turn off' : 'Turn on'} ${lightName}`}
                aria-pressed={isOn}
                onClick={onToggle}
            >
                <ha-icon icon="mdi:power" className="dual-card__power-icon" />
            </button>
            <button
                type="button"
                className={`dual-card__mode-pill dual-card__mode-pill--temperature ${
                    uiMode === 'temperature' ? 'is-active' : ''
                }`}
                disabled={!canUseTemperature}
                onClick={() => onModeChange('temperature')}
            >
                Temperature
            </button>
        </div>
    );
}

function favoriteSettingsDisplayColor(settings: FavoriteSettings) {
    if (!settings.isOn || settings.brightness <= 0) {
        return 'rgb(148 163 184)';
    }

    if (settings.mode === 'temperature') {
        return buildTemperatureIndicatorColor(settings.hue, settings.saturation, Math.max(settings.brightness, 36));
    }

    const hue = settings.selectedColorHue ?? settings.hue;
    const saturation = Math.max(52, settings.saturation);
    const lightness = Math.min(58, 28 + settings.brightness * 0.34);
    return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function favoriteDisplayColor(favorite: FavoritePreset) {
    return favoriteSettingsDisplayColor(favorite.settings);
}

function favoriteSettingsPillValue(settings: FavoriteSettings) {
    if (!settings.isOn || settings.brightness <= 0) {
        return 'Off';
    }

    return `${Math.round(settings.brightness)}%`;
}

function favoritePillValue(favorite: FavoritePreset) {
    return favoriteSettingsPillValue(favorite.settings);
}

function builtinFavoritePillValue(favorite: BuiltinFavoritePreset) {
    return favorite.displayValue;
}

function FavoriteStrip({
    favoritePresets,
    builtinFavoritePresets,
    activeFavoriteId,
    brightness,
    hue,
    saturation,
    isOn,
    uiMode,
    selectedColorHue,
    onFavoriteApply,
    onBuiltinFavoriteApply,
    onFavoriteDelete,
    onFavoriteSave,
    isEditingFavorites,
    pendingDeletedFavoriteIds,
    hasPendingFavoriteSave,
    onFavoriteDeleteStage,
    onFavoriteSaveStage,
    onFavoriteEditCancel,
    onFavoriteEditCommit,
}: Pick<
    ExpandedCardProps,
    | 'favoritePresets'
    | 'builtinFavoritePresets'
    | 'activeFavoriteId'
    | 'onFavoriteApply'
    | 'onBuiltinFavoriteApply'
    | 'onFavoriteDelete'
    | 'onFavoriteSave'
    | 'brightness'
    | 'hue'
    | 'saturation'
    | 'isOn'
    | 'uiMode'
    | 'selectedColorHue'
> & {
    isEditingFavorites: boolean;
    pendingDeletedFavoriteIds: string[];
    hasPendingFavoriteSave: boolean;
    onFavoriteDeleteStage: (favoriteId: string) => void;
    onFavoriteSaveStage: () => void;
    onFavoriteEditCancel: () => void;
    onFavoriteEditCommit: () => void;
}) {
    const visibleFavorites = isEditingFavorites
        ? favoritePresets.filter((favorite) => !pendingDeletedFavoriteIds.includes(favorite.id))
        : favoritePresets;
    const previewSlotCount = hasPendingFavoriteSave ? 1 : 0;
    const occupiedUserSlotCount = visibleFavorites.length + previewSlotCount;
    const userSlots = Array.from({ length: 3 }, (_, index) => {
        if (index < visibleFavorites.length) {
            return visibleFavorites[index] ?? null;
        }

        if (hasPendingFavoriteSave && index === visibleFavorites.length) {
            return 'pending-save';
        }

        return null;
    });
    const nextSavableIndex = hasPendingFavoriteSave ? -1 : occupiedUserSlotCount < userSlots.length ? occupiedUserSlotCount : -1;
    const slots = [...userSlots, ...builtinFavoritePresets];
    const liveFavoriteSettings: FavoriteSettings = {
        brightness,
        hue,
        isOn,
        kelvin: null,
        mode: uiMode,
        saturation,
        selectedColorHue: selectedColorHue ?? null,
    };
    const liveFavoriteStyle = {
        ['--dual-card-favorite-stroke' as string]: favoriteSettingsDisplayColor(liveFavoriteSettings),
    } as CSSProperties;

    return (
        <div className="dual-card__favorites-section">
            <div
                className={`dual-card__favorites-grid${isEditingFavorites ? ' is-editing' : ''}`}
                role="list"
                aria-label="Saved favourite settings"
            >
                {slots.map((favorite, index) => {
                    if (favorite === 'pending-save') {
                        return (
                            <div
                                key={`favorite-pending-save-${index}`}
                                role="listitem"
                                className="dual-card__favorite-slot dual-card__favorite-slot--save dual-card__favorite-slot--preview"
                                style={liveFavoriteStyle}
                                aria-hidden="true"
                            >
                                <span className="dual-card__favorite-slot-value">
                                    {favoriteSettingsPillValue(liveFavoriteSettings)}
                                </span>
                            </div>
                        );
                    }

                    if (!favorite) {
                        if (index !== nextSavableIndex) {
                            return (
                                <div
                                    key={`favorite-slot-${index}`}
                                    role="listitem"
                                    className="dual-card__favorite-slot dual-card__favorite-slot--placeholder"
                                    aria-hidden="true"
                                />
                            );
                        }

                        return (
                            <button
                                key={`favorite-slot-${index}`}
                                type="button"
                                className="dual-card__favorite-slot dual-card__favorite-slot--save dual-card__favorite-slot--preview"
                                aria-label="Save current light state to favorites"
                                style={liveFavoriteStyle}
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    if (isEditingFavorites) {
                                        onFavoriteSaveStage();
                                        return;
                                    }
                                    onFavoriteSave?.();
                                }}
                            >
                                <span className="dual-card__favorite-slot-value">
                                    {favoriteSettingsPillValue(liveFavoriteSettings)}
                                </span>
                            </button>
                        );
                    }

                    if ('displayValue' in favorite) {
                        const favoriteStyle = {
                            ['--dual-card-favorite-stroke' as string]: favoriteSettingsDisplayColor(favorite.settings),
                        } as CSSProperties;

                        return (
                            <button
                                key={favorite.id}
                                type="button"
                                role="listitem"
                                className={`dual-card__favorite-pill dual-card__favorite-pill--builtin ${
                                    activeFavoriteId === favorite.id ? 'is-active' : ''
                                }`}
                                style={favoriteStyle}
                                title={favorite.label}
                                aria-label={favorite.label}
                                onClick={() => {
                                    if (isEditingFavorites) return;
                                    onBuiltinFavoriteApply?.(favorite.id);
                                }}
                            >
                                <span className="dual-card__favorite-pill-value">
                                    {builtinFavoritePillValue(favorite)}
                                </span>
                            </button>
                        );
                    }

                    const favoriteStyle = {
                        ['--dual-card-favorite-stroke' as string]: favoriteDisplayColor(favorite),
                    } as CSSProperties;

                    return (
                        <div
                            key={favorite.id}
                            role="listitem"
                            className={`dual-card__favorite-pill-shell ${isEditingFavorites ? 'is-editing' : ''}`}
                        >
                            {isEditingFavorites ? (
                                <button
                                    type="button"
                                    className="dual-card__favorite-delete"
                                    aria-label={`Remove ${favorite.label}`}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        if (isEditingFavorites) {
                                            onFavoriteDeleteStage(favorite.id);
                                            return;
                                        }
                                        onFavoriteDelete?.(favorite.id);
                                    }}
                                >
                                    <ha-icon icon="mdi:minus" />
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className={`dual-card__favorite-pill ${
                                    activeFavoriteId === favorite.id ? 'is-active' : ''
                                } ${isEditingFavorites ? 'is-editing' : ''}`}
                                style={favoriteStyle}
                                title={favorite.label}
                                aria-label={favorite.label}
                                onClick={() => {
                                    if (isEditingFavorites) return;
                                    onFavoriteApply?.(favorite.id);
                                }}
                            >
                                <span className="dual-card__favorite-pill-value">{favoritePillValue(favorite)}</span>
                            </button>
                        </div>
                    );
                })}
            </div>
            {isEditingFavorites ? (
                <div className="dual-card__favorite-actions-row">
                    <button
                        type="button"
                        className="dual-card__favorite-action dual-card__favorite-action--cancel"
                        aria-label="Cancel favourite edits"
                        onClick={onFavoriteEditCancel}
                    >
                        <ha-icon icon="mdi:close" />
                        <span>Cancel</span>
                    </button>
                    <button
                        type="button"
                        className="dual-card__favorite-action dual-card__favorite-action--commit"
                        aria-label="Save favourite edits"
                        onClick={onFavoriteEditCommit}
                    >
                        <ha-icon icon="mdi:check" />
                        <span>Done</span>
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function GroupedLightsSection({
    groupedLights,
    controlScope,
    controlledLightEntityId,
    isGroupListOpen,
    onGroupListToggle,
    onGroupListClose,
    onControlScopeChange,
    onGroupedLightSelect,
    onGroupedLightToggle,
    getGroupedLightToggleStyle,
}: Pick<
    ExpandedCardProps,
    | 'groupedLights'
    | 'controlScope'
    | 'controlledLightEntityId'
    | 'isGroupListOpen'
    | 'onGroupListToggle'
    | 'onGroupListClose'
    | 'onControlScopeChange'
    | 'onGroupedLightSelect'
    | 'onGroupedLightToggle'
    | 'getGroupedLightToggleStyle'
>) {
    const [pulsedLightEntityId, setPulsedLightEntityId] = useState<string | null>(null);
    const selectedGroupedLightName =
        controlScope !== 'group' && controlledLightEntityId
            ? groupedLights.find((light) => light.entityId === controlledLightEntityId)?.name ?? null
            : null;

    useEffect(() => {
        if (!controlledLightEntityId || !groupedLights.some((light) => light.entityId === controlledLightEntityId)) {
            setPulsedLightEntityId(null);
            return;
        }

        setPulsedLightEntityId(controlledLightEntityId);
        const timeoutId = window.setTimeout(() => {
            setPulsedLightEntityId((current) => (current === controlledLightEntityId ? null : current));
        }, 280);

        return () => window.clearTimeout(timeoutId);
    }, [controlledLightEntityId, groupedLights]);

    if (!groupedLights.length) {
        return null;
    }

    return (
        <div className="dual-card__group-section">
            <div className="dual-card__scope-row" role="group" aria-label="Control scope">
                <button
                    type="button"
                    className={`dual-card__scope-pill dual-card__scope-pill--group ${
                        controlScope === 'group' ? 'is-active' : ''
                    }`}
                    aria-pressed={controlScope === 'group'}
                    onClick={() => onControlScopeChange?.('group')}
                >
                    <span className="dual-card__scope-label">Group</span>
                </button>
                <button
                    type="button"
                    className={`dual-card__scope-pill dual-card__scope-pill--group-relative ${
                        controlScope === 'group-relative' ? 'is-active' : ''
                    }`}
                    aria-pressed={controlScope === 'group-relative'}
                    onClick={() => onControlScopeChange?.('group-relative')}
                >
                    <span className="dual-card__scope-label">Group Relative</span>
                </button>
            </div>

            <button
                type="button"
                className={`dual-card__group-mobile-trigger ${isGroupListOpen ? 'is-open' : ''} ${
                    selectedGroupedLightName ? 'is-selected' : ''
                }`}
                aria-expanded={isGroupListOpen}
                onClick={onGroupListToggle}
            >
                <span className="dual-card__group-mobile-trigger-label" title={selectedGroupedLightName ?? 'Select lights'}>
                    {selectedGroupedLightName ?? 'Select lights'}
                </span>
                <ha-icon icon={isGroupListOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
            </button>

            <div className={`dual-card__group-list ${isGroupListOpen ? 'is-mobile-open' : ''}`}>
                {groupedLights.map((groupedLight) => (
                    <div
                        key={groupedLight.entityId}
                        className={`dual-card__group-item ${
                            controlScope !== 'group' && controlledLightEntityId === groupedLight.entityId
                                ? 'is-active'
                                : ''
                        } ${pulsedLightEntityId === groupedLight.entityId ? 'is-handoff' : ''}`}
                    >
                        <button
                            type="button"
                            className="dual-card__group-toggle"
                            aria-label={`${groupedLight.isOn ? 'Turn off' : 'Turn on'} ${groupedLight.name}`}
                            aria-pressed={groupedLight.isOn}
                            onClick={() => onGroupedLightToggle?.(groupedLight.entityId)}
                            style={getGroupedLightToggleStyle(groupedLight)}
                        >
                            <ha-icon icon="mdi:power" className="dual-card__group-toggle-icon" />
                        </button>
                        <button
                            type="button"
                            className="dual-card__group-main"
                            onClick={() => {
                                onGroupedLightSelect?.(groupedLight.entityId);
                                onGroupListClose();
                            }}
                        >
                            <span className="dual-card__group-meta">
                                <span className="dual-card__group-heading">
                                    <span className="dual-card__group-name">{groupedLight.name}</span>
                                    <span className="dual-card__group-value">{groupedLight.value}</span>
                                </span>
                            </span>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function ExpandedCard({
    isDarkMode,
    displayExpandedPrimaryName,
    displayExpandedSecondaryName,
    leadingValue,
    brightness,
    hue,
    saturation,
    isOn,
    uiMode,
    canUseTemperature,
    canUseSpectrum,
    selectedColorHue,
    onModeChange,
    padVisualStyle,
    onPadVisualStyleChange,
    onControlsChange,
    onControlInteractionStart,
    onControlInteractionEnd,
    isDiscoMode,
    onDiscoModeTrigger,
    onDiscoModeExit,
    onPadMarkerSelect,
    onFormationIndicatorSelect,
    onPadDoubleSelect,
    onToggle,
    favoritePresets,
    builtinFavoritePresets,
    activeFavoriteId,
    onFavoriteSave,
    onFavoriteApply,
    onBuiltinFavoriteApply,
    onFavoriteDelete,
    onFavoriteEditCommit,
    lightName,
    groupedLights,
    groupedLightMarkers,
    groupRelativeFormationIndicator,
    controlScope,
    controlledLightEntityId,
    isGroupListOpen,
    onGroupListToggle,
    onGroupListClose,
    onControlScopeChange,
    onGroupedLightSelect,
    onGroupedLightToggle,
    getGroupedLightToggleStyle,
}: ExpandedCardProps) {
    const [isEditingFavorites, setIsEditingFavorites] = useState(false);
    const [pendingDeletedFavoriteIds, setPendingDeletedFavoriteIds] = useState<string[]>([]);
    const [hasPendingFavoriteSave, setHasPendingFavoriteSave] = useState(false);
    const isFavoriteEditingEnabled = isEditingFavorites;
    const padIsOn =
        isOn ||
        (controlScope === 'individual' &&
            groupedLightMarkers.some((marker) => marker.entityId !== controlledLightEntityId && marker.isOn));

    useEffect(() => {
        if (!isEditingFavorites) {
            setPendingDeletedFavoriteIds([]);
            setHasPendingFavoriteSave(false);
        }
    }, [favoritePresets, isEditingFavorites]);

    const startFavoriteEditing = () => {
        setPendingDeletedFavoriteIds([]);
        setHasPendingFavoriteSave(false);
        setIsEditingFavorites(true);
    };

    const cancelFavoriteEditing = () => {
        setPendingDeletedFavoriteIds([]);
        setHasPendingFavoriteSave(false);
        setIsEditingFavorites(false);
    };

    const commitFavoriteEditing = () => {
        onFavoriteEditCommit?.(pendingDeletedFavoriteIds, hasPendingFavoriteSave);
        setPendingDeletedFavoriteIds([]);
        setHasPendingFavoriteSave(false);
        setIsEditingFavorites(false);
    };

    return (
        <div className={`dual-card dual-card--expanded${isDarkMode ? ' dual-card--theme-dark' : ''}`}>
            <div className="dual-card__expanded-title-row dual-card__expanded-title-row--primary">
                <div className="dual-card__expanded-title" title={displayExpandedPrimaryName}>
                    {displayExpandedPrimaryName}
                </div>
                <div className="dual-card__header-actions">
                    <SettingsMenu
                        padVisualStyle={padVisualStyle}
                        onPadVisualStyleChange={onPadVisualStyleChange}
                        isEditingFavorites={isFavoriteEditingEnabled}
                        onToggleFavoriteEditing={() => {
                            if (isFavoriteEditingEnabled) {
                                cancelFavoriteEditing();
                                return;
                            }
                            startFavoriteEditing();
                        }}
                    />
                </div>
            </div>

            <ExpandedMetaHeader
                leadingValue={leadingValue}
                brightness={brightness}
                isOn={isOn}
                displayExpandedSecondaryName={displayExpandedSecondaryName}
            />

            <div
                className={`dual-card__pad-block${
                    padVisualStyle === 'matrix' || padVisualStyle === 'pixel'
                        ? ' dual-card__pad-block--borderless'
                        : ''
                }`}
            >
                <Halo
                    hue={hue}
                    saturation={saturation}
                    brightness={brightness}
                    isOn={padIsOn}
                    lockedSpectrumHue={uiMode === 'spectrum' ? selectedColorHue : null}
                    visualStyle={padVisualStyle}
                    markers={groupedLightMarkers}
                    onChange={onControlsChange}
                    onInteractionStart={onControlInteractionStart}
                    onInteractionEnd={onControlInteractionEnd}
                    isDiscoMode={isDiscoMode}
                    onDiscoModeTrigger={onDiscoModeTrigger}
                    onDiscoModeExit={onDiscoModeExit}
                    onMarkerSelect={onPadMarkerSelect}
                    onFormationIndicatorSelect={onFormationIndicatorSelect}
                    onDoubleSelect={onPadDoubleSelect}
                    onToggle={onToggle}
                    mode={uiMode}
                    formationIndicator={groupRelativeFormationIndicator}
                    indicatorVariant={
                        controlScope === 'group-relative' && !controlledLightEntityId ? 'group-relative' : 'default'
                    }
                />
            </div>

            <ModeControls
                uiMode={uiMode}
                canUseSpectrum={canUseSpectrum}
                canUseTemperature={canUseTemperature}
                selectedColorHue={selectedColorHue}
                isOn={isOn}
                lightName={lightName}
                onModeChange={onModeChange}
                onToggle={onToggle}
            />

            <FavoriteStrip
                favoritePresets={favoritePresets}
                builtinFavoritePresets={builtinFavoritePresets}
                activeFavoriteId={activeFavoriteId}
                brightness={brightness}
                hue={hue}
                saturation={saturation}
                isOn={isOn}
                uiMode={uiMode}
                selectedColorHue={selectedColorHue}
                onFavoriteApply={onFavoriteApply}
                onBuiltinFavoriteApply={onBuiltinFavoriteApply}
                onFavoriteDelete={onFavoriteDelete}
                onFavoriteSave={onFavoriteSave}
                isEditingFavorites={isFavoriteEditingEnabled}
                pendingDeletedFavoriteIds={pendingDeletedFavoriteIds}
                hasPendingFavoriteSave={hasPendingFavoriteSave}
                onFavoriteDeleteStage={(favoriteId) => {
                    setPendingDeletedFavoriteIds((current) =>
                        current.includes(favoriteId) ? current : [...current, favoriteId]
                    );
                }}
                onFavoriteSaveStage={() => setHasPendingFavoriteSave(true)}
                onFavoriteEditCancel={cancelFavoriteEditing}
                onFavoriteEditCommit={() => {
                    commitFavoriteEditing();
                }}
            />

            <GroupedLightsSection
                groupedLights={groupedLights}
                controlScope={controlScope}
                controlledLightEntityId={controlledLightEntityId}
                isGroupListOpen={isGroupListOpen}
                onGroupListToggle={onGroupListToggle}
                onGroupListClose={onGroupListClose}
                onControlScopeChange={onControlScopeChange}
                onGroupedLightSelect={onGroupedLightSelect}
                onGroupedLightToggle={onGroupedLightToggle}
                getGroupedLightToggleStyle={getGroupedLightToggleStyle}
            />
        </div>
    );
}

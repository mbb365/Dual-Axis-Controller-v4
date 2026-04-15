import { useEffect, useId, useRef, useState } from 'react';
import { Halo, type HaloIndicatorSelection, type HaloMarker, type HaloVisualStyle } from '../Halo';
import type { GroupedLightOption } from '../CompactCard';
import type { BuiltinFavoritePreset, FavoritePreset } from '../../utils/favorites';

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
    discoSpeedMs?: 900 | 1200 | 1500;
    onDiscoSpeedChange?: (speedMs: 900 | 1200 | 1500) => void;
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
}: Pick<ExpandedCardProps, 'padVisualStyle' | 'onPadVisualStyleChange'>) {
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
        <div
            className="dual-card__settings-anchor"
            ref={menuRef}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
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
                <div className="dual-card__settings-menu" onPointerDown={(event) => event.stopPropagation()}>
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
            {displayExpandedSecondaryName ? (
                <div className="dual-card__meta-value dual-card__meta-value--name" title={displayExpandedSecondaryName}>
                    {displayExpandedSecondaryName}
                </div>
            ) : null}
            <div className="dual-card__meta-value dual-card__meta-value--combined">
                {isOn ? `${leadingValue} at ${Math.round(brightness)}%` : 'Off'}
            </div>
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
    const scopeGroupName = useId();
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
            <div className="dual-card__scope-row" role="radiogroup" aria-label="Control scope">
                <label
                    className={`dual-card__scope-pill dual-card__scope-pill--group ${
                        controlScope === 'group' ? 'is-active' : ''
                    }`}
                >
                    <input
                        className="dual-card__scope-radio"
                        type="radio"
                        name={scopeGroupName}
                        checked={controlScope === 'group'}
                        onChange={() => onControlScopeChange?.('group')}
                    />
                    <span className="dual-card__scope-pill-content">
                        <span className="dual-card__scope-radio-indicator" aria-hidden="true" />
                        <span className="dual-card__scope-label">Group</span>
                    </span>
                </label>
                <label
                    className={`dual-card__scope-pill dual-card__scope-pill--group-relative ${
                        controlScope === 'group-relative' ? 'is-active' : ''
                    }`}
                >
                    <input
                        className="dual-card__scope-radio"
                        type="radio"
                        name={scopeGroupName}
                        checked={controlScope === 'group-relative'}
                        onChange={() => onControlScopeChange?.('group-relative')}
                    />
                    <span className="dual-card__scope-pill-content">
                        <span className="dual-card__scope-radio-indicator" aria-hidden="true" />
                        <span className="dual-card__scope-label">Group Relative</span>
                    </span>
                </label>
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
                        } ${pulsedLightEntityId === groupedLight.entityId ? 'is-handoff' : ''} ${
                            groupedLight.isMuted ? 'is-muted' : ''
                        }`}
                    >
                        <button
                            type="button"
                            className="dual-card__group-toggle"
                            aria-label={`${groupedLight.isOn ? 'Turn off' : 'Turn on'} ${groupedLight.name}`}
                            aria-pressed={groupedLight.isOn}
                            disabled={groupedLight.isMuted}
                            onClick={() => onGroupedLightToggle?.(groupedLight.entityId)}
                            style={getGroupedLightToggleStyle(groupedLight)}
                        >
                            <ha-icon icon="mdi:power" className="dual-card__group-toggle-icon" />
                        </button>
                        <button
                            type="button"
                            className="dual-card__group-main"
                            disabled={groupedLight.isMuted}
                            onClick={() => {
                                if (groupedLight.isMuted) {
                                    return;
                                }
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
    discoSpeedMs,
    onDiscoSpeedChange,
    onDiscoModeTrigger,
    onDiscoModeExit,
    onPadMarkerSelect,
    onFormationIndicatorSelect,
    onPadDoubleSelect,
    onToggle,
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
    const padIsOn =
        isOn ||
        (controlScope === 'individual' &&
            groupedLightMarkers.some((marker) => marker.entityId !== controlledLightEntityId && marker.isOn));

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
                    discoSpeedMs={discoSpeedMs}
                    onDiscoSpeedChange={onDiscoSpeedChange}
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

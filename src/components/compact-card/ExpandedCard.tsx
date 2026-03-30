import { useEffect, useRef, useState } from 'react';
import { Halo, type HaloMarker } from '../Halo';
import type { GroupedLightOption } from '../CompactCard';

interface ExpandedCardProps {
    isDarkMode: boolean;
    displayExpandedPrimaryName: string;
    displayExpandedSecondaryName: string | null;
    leadingValue: string;
    brightness: number;
    hue: number;
    saturation: number;
    kelvin: number | null;
    isOn: boolean;
    uiMode: 'temperature' | 'spectrum';
    canUseTemperature: boolean;
    canUseSpectrum: boolean;
    selectedColorHue?: number | null;
    onModeChange: (mode: 'temperature' | 'spectrum') => void;
    onColorSelect?: (hue: number) => void;
    onControlsChange: (h: number, s: number, b: number) => void;
    onControlInteractionStart?: () => void;
    onControlInteractionEnd?: () => void;
    isDiscoMode?: boolean;
    onDiscoModeTrigger?: () => void;
    onDiscoModeExit?: () => void;
    onPadMarkerSelect?: (entityId: string) => void;
    onPadDoubleSelect?: (h: number, s: number, b: number) => void;
    onToggle: () => void;
    lightName: string;
    groupedLights: GroupedLightOption[];
    groupedLightMarkers: HaloMarker[];
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

const COLOR_SWATCHES = [
    { hue: 0, label: 'Red' },
    { hue: 28, label: 'Orange' },
    { hue: 52, label: 'Yellow' },
    { hue: 122, label: 'Green' },
    { hue: 210, label: 'Blue' },
    { hue: 270, label: 'Violet' },
    { hue: 328, label: 'Pink' },
] as const;

function ExpandedTitleRow({
    displayExpandedPrimaryName,
    displayExpandedSecondaryName,
}: Pick<ExpandedCardProps, 'displayExpandedPrimaryName' | 'displayExpandedSecondaryName'>) {
    return (
        <div className="dual-card__expanded-title-row">
            <div className="dual-card__expanded-title">{displayExpandedPrimaryName}</div>
            {displayExpandedSecondaryName ? (
                <div className="dual-card__expanded-title dual-card__expanded-title--secondary">
                    {displayExpandedSecondaryName}
                </div>
            ) : null}
        </div>
    );
}

function ExpandedMetaHeader({ leadingValue, brightness }: Pick<ExpandedCardProps, 'leadingValue' | 'brightness'>) {
    return (
        <div className="dual-card__expanded-header">
            <div className="dual-card__meta">
                <div className="dual-card__meta-value">{leadingValue}</div>
            </div>
            <div className="dual-card__meta dual-card__meta--right">
                <div className="dual-card__meta-value">{Math.round(brightness)}%</div>
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
                className={`dual-card__mode-pill ${uiMode === 'spectrum' && selectedColorHue == null ? 'is-active' : ''}`}
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
                className={`dual-card__mode-pill ${uiMode === 'temperature' ? 'is-active' : ''}`}
                disabled={!canUseTemperature}
                onClick={() => onModeChange('temperature')}
            >
                Temperature
            </button>
        </div>
    );
}

function ColorPicker({
    isDarkMode,
    selectedColorHue,
    onColorSelect,
}: Pick<ExpandedCardProps, 'isDarkMode' | 'selectedColorHue' | 'onColorSelect'>) {
    const [isOpen, setIsOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: PointerEvent) => {
            if (!pickerRef.current?.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        window.addEventListener('pointerdown', handlePointerDown);
        return () => window.removeEventListener('pointerdown', handlePointerDown);
    }, [isOpen]);

    return (
        <div className="dual-card__color-picker" ref={pickerRef}>
            <button
                type="button"
                className={`dual-card__color-trigger ${selectedColorHue != null ? 'is-active' : ''} ${isOpen ? 'is-open' : ''}`}
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
            >
                <span className="dual-card__color-trigger-label">Colours</span>
                <span className="dual-card__color-trigger-meta">
                    {selectedColorHue != null ? (
                        <span
                            className="dual-card__color-trigger-swatch"
                            style={{ ['--dual-card-swatch-color' as string]: `hsl(${selectedColorHue}, 100%, 50%)` }}
                        />
                    ) : null}
                    <ha-icon
                        icon={isOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                        className="dual-card__color-trigger-icon"
                    />
                </span>
            </button>
            {isOpen ? (
                <div className={`dual-card__color-menu${isDarkMode ? ' dual-card__color-menu--dark' : ''}`}>
                    {COLOR_SWATCHES.map((swatch) => (
                        <button
                            key={swatch.label}
                            type="button"
                            className={`dual-card__color-swatch${selectedColorHue === swatch.hue ? ' is-active' : ''}`}
                            aria-label={swatch.label}
                            title={swatch.label}
                            onClick={() => {
                                onColorSelect?.(swatch.hue);
                                setIsOpen(false);
                            }}
                            style={{ ['--dual-card-swatch-color' as string]: `hsl(${swatch.hue}, 100%, 50%)` }}
                        />
                    ))}
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
            <div className="dual-card__scope-row" role="tablist" aria-label="Control scope">
                <button
                    type="button"
                    className={`dual-card__scope-pill ${controlScope === 'group' ? 'is-active' : ''}`}
                    onClick={() => onControlScopeChange?.('group')}
                >
                    Group
                </button>
                <button
                    type="button"
                    className={`dual-card__scope-pill ${controlScope === 'group-relative' ? 'is-active' : ''}`}
                    onClick={() => onControlScopeChange?.('group-relative')}
                >
                    Group Relative
                </button>
            </div>

            <button
                type="button"
                className={`dual-card__group-mobile-trigger ${isGroupListOpen ? 'is-open' : ''}`}
                aria-expanded={isGroupListOpen}
                onClick={onGroupListToggle}
            >
                <span>Select lights</span>
                <ha-icon icon={isGroupListOpen ? 'mdi:chevron-up' : 'mdi:chevron-down'} />
            </button>

            <div className={`dual-card__group-list ${isGroupListOpen ? 'is-mobile-open' : ''}`}>
                {groupedLights.map((groupedLight) => (
                    <div
                        key={groupedLight.entityId}
                        className={`dual-card__group-item ${
                            controlScope === 'individual' && controlledLightEntityId === groupedLight.entityId
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
    kelvin: _kelvin,
    isOn,
    uiMode,
    canUseTemperature,
    canUseSpectrum,
    selectedColorHue,
    onModeChange,
    onColorSelect,
    onControlsChange,
    onControlInteractionStart,
    onControlInteractionEnd,
    isDiscoMode,
    onDiscoModeTrigger,
    onDiscoModeExit,
    onPadMarkerSelect,
    onPadDoubleSelect,
    onToggle,
    lightName,
    groupedLights,
    groupedLightMarkers,
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
    return (
        <div className={`dual-card dual-card--expanded${isDarkMode ? ' dual-card--theme-dark' : ''}`}>
            <ExpandedTitleRow
                displayExpandedPrimaryName={displayExpandedPrimaryName}
                displayExpandedSecondaryName={displayExpandedSecondaryName}
            />

            <ExpandedMetaHeader leadingValue={leadingValue} brightness={brightness} />

            <Halo
                hue={hue}
                saturation={saturation}
                brightness={brightness}
                isOn={isOn}
                lockedSpectrumHue={uiMode === 'spectrum' ? selectedColorHue : null}
                markers={groupedLightMarkers}
                onChange={onControlsChange}
                onInteractionStart={onControlInteractionStart}
                onInteractionEnd={onControlInteractionEnd}
                isDiscoMode={isDiscoMode}
                onDiscoModeTrigger={onDiscoModeTrigger}
                onDiscoModeExit={onDiscoModeExit}
                onMarkerSelect={onPadMarkerSelect}
                onDoubleSelect={onPadDoubleSelect}
                onToggle={onToggle}
                mode={uiMode}
            />

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

            <ColorPicker
                isDarkMode={isDarkMode}
                selectedColorHue={selectedColorHue}
                onColorSelect={onColorSelect}
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

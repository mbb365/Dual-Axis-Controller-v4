import { useEffect, useState } from 'react';
import { Halo, type HaloIndicatorSelection, type HaloMarker, type HaloVisualStyle } from '../Halo';
import type { GroupedLightOption } from '../CompactCard';
import { HcBackIcon, HcCloseIcon, HcGlyph, HcSettingsIcon } from './icons';

// The settings panel sits beside the controller when both fit (440 + 12 + 300, plus the 16 margins).
const SIDE_BY_SIDE_MIN_WIDTH = 784;

const CONTROLLER_STYLES: Array<{ style: HaloVisualStyle; label: string }> = [
    { style: 'plotter', label: 'Standard' },
    { style: 'pixel', label: 'Brick' },
];

export interface HomeCoreSheetProps {
    isSheet: boolean;
    dragOffset: number;
    isDragging: boolean;
    isClosing: boolean;
    onDragStart: (event: React.PointerEvent<HTMLDivElement>) => void;
    onDragMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onDragEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export interface HomeCoreControllerProps {
    isDarkMode: boolean;
    title: string;
    icon: string;
    chosenLightName: string | null;
    isOn: boolean;
    brightness: number;
    hue: number;
    saturation: number;
    kelvin: number | null;
    uiMode: 'temperature' | 'spectrum';
    canUseTemperature: boolean;
    canUseSpectrum: boolean;
    selectedColorHue?: number | null;
    onModeChange: (mode: 'temperature' | 'spectrum') => void;
    onControlsChange: (h: number, s: number, b: number) => void;
    onControlInteractionStart?: () => void;
    onControlInteractionEnd?: () => void;
    padVisualStyle: HaloVisualStyle;
    onPadVisualStyleChange?: (style: HaloVisualStyle) => void;
    isDiscoMode?: boolean;
    discoSpeedMs?: 900 | 1200 | 1500;
    onDiscoSpeedChange?: (speedMs: 900 | 1200 | 1500) => void;
    onDiscoModeTrigger?: () => void;
    onDiscoModeExit?: () => void;
    onPadMarkerSelect?: (entityId: string) => void;
    onFormationIndicatorSelect?: () => void;
    onPadDoubleSelect?: (h: number, s: number, b: number) => void;
    onToggle: () => void;
    groupedLights: GroupedLightOption[];
    groupedLightMarkers: HaloMarker[];
    groupRelativeFormationIndicator?: HaloIndicatorSelection | null;
    controlScope: 'group' | 'group-relative' | 'individual';
    controlledLightEntityId?: string | null;
    onControlScopeChange?: (scope: 'group' | 'group-relative') => void;
    onGroupedLightSelect?: (entityId: string) => void;
    onGroupedLightRelease?: () => void;
    onGroupedLightToggle?: (entityId: string) => void;
    getGroupedLightChipStyle: (light: GroupedLightOption) => React.CSSProperties;
    onClose: () => void;
    sheet: HomeCoreSheetProps;
}

function useViewportWidth() {
    const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1024 : window.innerWidth));
    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return width;
}

function Segmented<T extends string>({
    label,
    options,
    value,
    onChange,
}: {
    label: string;
    options: Array<{ value: T; label: string; disabled?: boolean }>;
    value: T | null;
    onChange: (value: T) => void;
}) {
    return (
        <div className="hcSeg" role="group" aria-label={label}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    aria-pressed={value === option.value}
                    disabled={option.disabled}
                    onClick={() => onChange(option.value)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}

function nowSubText(uiMode: 'temperature' | 'spectrum', kelvin: number | null, hue: number, chosenLightName: string | null) {
    const reading =
        uiMode === 'temperature' ? (kelvin ? `${kelvin.toLocaleString()}K` : null) : `${Math.round(hue)}° hue`;
    return [chosenLightName, reading].filter(Boolean).join(' · ');
}

/** The controller: a 440 popup on desktop, a sheet from the bottom on phones, with a 300 settings panel beside it. */
export function HomeCoreController({
    isDarkMode,
    title,
    icon,
    chosenLightName,
    isOn,
    brightness,
    hue,
    saturation,
    kelvin,
    uiMode,
    canUseTemperature,
    canUseSpectrum,
    selectedColorHue,
    onModeChange,
    onControlsChange,
    onControlInteractionStart,
    onControlInteractionEnd,
    padVisualStyle,
    onPadVisualStyleChange,
    isDiscoMode,
    discoSpeedMs,
    onDiscoSpeedChange,
    onDiscoModeTrigger,
    onDiscoModeExit,
    onPadMarkerSelect,
    onFormationIndicatorSelect,
    onPadDoubleSelect,
    onToggle,
    groupedLights,
    groupedLightMarkers,
    groupRelativeFormationIndicator,
    controlScope,
    controlledLightEntityId,
    onControlScopeChange,
    onGroupedLightSelect,
    onGroupedLightRelease,
    onGroupedLightToggle,
    getGroupedLightChipStyle,
    onClose,
    sheet,
}: HomeCoreControllerProps) {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const viewportWidth = useViewportWidth();
    const isOver = sheet.isSheet || viewportWidth < SIDE_BY_SIDE_MIN_WIDTH;
    const chosenEntityId = controlScope !== 'group' ? controlledLightEntityId ?? null : null;
    const padIsOn =
        isOn ||
        (controlScope === 'individual' &&
            groupedLightMarkers.some((marker) => marker.entityId !== controlledLightEntityId && marker.isOn));

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (isSettingsOpen) {
                setIsSettingsOpen(false);
            } else {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSettingsOpen, onClose]);

    const handleLightTap = (light: GroupedLightOption) => {
        if (light.isMuted) return;
        // Tapping the chosen light again goes back to the group.
        if (chosenEntityId === light.entityId) {
            if (controlScope === 'group-relative') {
                onFormationIndicatorSelect?.();
            } else {
                onGroupedLightRelease?.();
            }
            return;
        }
        onGroupedLightSelect?.(light.entityId);
    };

    // Group shows as chosen while one light is chosen, so pressing it lets go of that light. From Group relative,
    // pressing Group still brings every light to one point, as before.
    const handleScopeChange = (scope: 'group' | 'group-relative') => {
        if (scope === 'group' && controlScope === 'individual') {
            onGroupedLightRelease?.();
            return;
        }
        if (scope === 'group' && controlScope === 'group') return;
        if (scope === 'group-relative' && controlScope === 'group-relative') {
            if (controlledLightEntityId) onFormationIndicatorSelect?.();
            return;
        }
        onControlScopeChange?.(scope);
    };

    const stopDrag = sheet.isSheet ? (event: React.PointerEvent) => event.stopPropagation() : undefined;
    const backdropOpacity = sheet.isSheet ? Math.max(0.1, 0.45 - sheet.dragOffset / 900) : 0.45;

    return (
        <div
            className={`hc hcBackdrop${sheet.isSheet ? ' is-sheet' : ''}${isDarkMode ? ' hc--dark' : ''}`}
            style={{ background: `rgba(0, 0, 0, ${backdropOpacity})` }}
            onClick={onClose}
        >
            <div
                className={`hcPair${isSettingsOpen ? ' is-settings' : ''}${isOver ? ' is-over' : ''}`}
                onClick={(event) => event.stopPropagation()}
                style={
                    sheet.isSheet
                        ? {
                              transform: `translateY(${sheet.dragOffset}px)`,
                              transition: sheet.isDragging
                                  ? 'none'
                                  : `transform ${sheet.isClosing ? '0.42s cubic-bezier(0.22, 1, 0.36, 1)' : '0.22s ease'}`,
                          }
                        : undefined
                }
            >
                <section className="hcCtl" role="dialog" aria-modal="true" aria-label={title}>
                    <div
                        className="hcHead"
                        onPointerDown={sheet.isSheet ? sheet.onDragStart : undefined}
                        onPointerMove={sheet.isSheet ? sheet.onDragMove : undefined}
                        onPointerUp={sheet.isSheet ? sheet.onDragEnd : undefined}
                        onPointerCancel={sheet.isSheet ? sheet.onDragEnd : undefined}
                    >
                        <button
                            type="button"
                            className={`hcChip${isOn ? ' is-on' : ''}`}
                            aria-label={`${isOn ? 'Turn off' : 'Turn on'} ${title}`}
                            aria-pressed={isOn}
                            onPointerDown={stopDrag}
                            onClick={onToggle}
                        >
                            <HcGlyph icon={icon} />
                        </button>
                        <h2 className="hcHeadTitle">{title}</h2>
                        <button
                            type="button"
                            className="hcIconBtn"
                            aria-label="Settings"
                            aria-expanded={isSettingsOpen}
                            onPointerDown={stopDrag}
                            onClick={() => setIsSettingsOpen((open) => !open)}
                        >
                            <HcSettingsIcon />
                        </button>
                        <button
                            type="button"
                            className="hcIconBtn"
                            aria-label="Close"
                            onPointerDown={stopDrag}
                            onClick={onClose}
                        >
                            <HcCloseIcon />
                        </button>
                    </div>

                    <div className="hcNow" aria-live="polite">
                        <div className="hcNowValue">{isOn ? `${Math.round(brightness)}%` : 'Off'}</div>
                        {isOn ? <div className="hcNowSub">{nowSubText(uiMode, kelvin, hue, chosenLightName)}</div> : null}
                    </div>

                    <div className="hcPad">
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

                    <Segmented
                        label="Pad"
                        value={uiMode}
                        onChange={onModeChange}
                        options={[
                            { value: 'temperature', label: 'Temperature', disabled: !canUseTemperature },
                            { value: 'spectrum', label: 'Colour', disabled: !canUseSpectrum },
                        ]}
                    />

                    {groupedLights.length ? (
                        <>
                            <Segmented
                                label="Lights move"
                                value={controlScope === 'group-relative' ? 'group-relative' : 'group'}
                                onChange={handleScopeChange}
                                options={[
                                    { value: 'group', label: 'Group' },
                                    { value: 'group-relative', label: 'Group relative' },
                                ]}
                            />

                            <div className="hcLights">
                                <div className="hcLabel">Lights</div>
                                <div className="hcLightTiles">
                                    {groupedLights.map((light) => (
                                        <div
                                            key={light.entityId}
                                            className={`hcLight${chosenEntityId === light.entityId ? ' is-chosen' : ''}${
                                                light.isMuted ? ' is-muted' : ''
                                            }`}
                                        >
                                            <button
                                                type="button"
                                                className={`hcChip${light.isOn ? ' is-on' : ''}`}
                                                style={light.isOn ? getGroupedLightChipStyle(light) : undefined}
                                                aria-label={`${light.isOn ? 'Turn off' : 'Turn on'} ${light.name}`}
                                                aria-pressed={light.isOn}
                                                disabled={light.isMuted}
                                                onClick={() => onGroupedLightToggle?.(light.entityId)}
                                            >
                                                <HcGlyph icon={light.icon} />
                                            </button>
                                            <button
                                                type="button"
                                                className="hcName"
                                                aria-pressed={chosenEntityId === light.entityId}
                                                disabled={light.isMuted}
                                                onClick={() => handleLightTap(light)}
                                            >
                                                <span className="hcTitle">{light.name}</span>
                                                <span className="hcValue">{light.value}</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : null}
                </section>

                <aside className="hcSide" inert={!isSettingsOpen}>
                    <div className="hcSideInner">
                        <div className="hcHead">
                            <button
                                type="button"
                                className="hcIconBtn"
                                aria-label="Back"
                                onClick={() => setIsSettingsOpen(false)}
                            >
                                <HcBackIcon />
                            </button>
                            <h2 className="hcHeadTitle">Settings</h2>
                        </div>
                        <div>
                            <div className="hcLabel">Controller style</div>
                            <Segmented
                                label="Controller style"
                                value={padVisualStyle}
                                onChange={(style) => onPadVisualStyleChange?.(style)}
                                options={CONTROLLER_STYLES.map((option) => ({ value: option.style, label: option.label }))}
                            />
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    );
}

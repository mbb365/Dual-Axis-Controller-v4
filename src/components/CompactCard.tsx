import { useEffect, useRef, useState } from 'react';
import compactCardStyles from './CompactCard.css?inline';
import type { HaloMarker, HaloVisualStyle } from './Halo';
import { CompactView } from './compact-card/CompactView';
import {
    buildCompactBackground,
    buildGroupedCompactBackground,
    buildIconBackground,
    buildIconForeground,
    formatStatus,
    getRgbText,
} from './compact-card/display-utils';
import { ExpandedCard } from './compact-card/ExpandedCard';

export type CardLayout = 'compact' | 'expanded';

export interface SceneOption {
    entityId: string;
    name: string;
}

export interface ColorOption {
    hue: number;
    label: string;
}

export interface GroupedLightOption {
    entityId: string;
    isOn: boolean;
    name: string;
    value: string;
    previewBrightness: number;
    previewHue: number;
    previewMode: 'temperature' | 'spectrum';
    previewSaturation: number;
}

interface CompactCardProps {
    layout: CardLayout;
    isDarkMode?: boolean;
    lightName: string;
    expandedAreaName?: string | null;
    expandedPrimaryName?: string;
    expandedSecondaryName?: string | null;
    icon: string;
    isOn: boolean;
    hue: number;
    saturation: number;
    brightness: number;
    kelvin: number | null;
    uiMode: 'temperature' | 'spectrum';
    canUseTemperature: boolean;
    canUseSpectrum: boolean;
    onModeChange: (mode: 'temperature' | 'spectrum') => void;
    onControlsChange: (h: number, s: number, b: number) => void;
    selectedColorHue?: number | null;
    onColorSelect?: (hue: number) => void;
    padVisualStyle?: HaloVisualStyle;
    onPadVisualStyleChange?: (style: HaloVisualStyle) => void;
    onControlInteractionStart?: () => void;
    onControlInteractionEnd?: () => void;
    isDiscoMode?: boolean;
    onDiscoModeTrigger?: () => void;
    onDiscoModeExit?: () => void;
    onPadMarkerSelect?: (entityId: string) => void;
    onPadDoubleSelect?: (h: number, s: number, b: number) => void;
    onToggle: () => void;
    sceneOptions?: SceneOption[];
    selectedSceneName?: string | null;
    sceneFeedbackMessage?: string | null;
    groupedLights?: GroupedLightOption[];
    groupedLightMarkers?: HaloMarker[];
    controlScope?: 'group' | 'group-relative' | 'individual';
    controlledLightEntityId?: string | null;
    onControlScopeChange?: (scope: 'group' | 'group-relative') => void;
    onGroupedLightSelect?: (entityId: string) => void;
    onGroupedLightToggle?: (entityId: string) => void;
    onSceneSelect?: (sceneEntityId: string) => void;
    onTapAction?: () => void;
    onHoldAction?: () => void;
    onDoubleTapAction?: () => void;
}

export function CompactCard({
    layout,
    isDarkMode = false,
    lightName,
    expandedAreaName,
    expandedPrimaryName,
    expandedSecondaryName,
    icon: _icon,
    isOn,
    hue,
    saturation,
    brightness,
    kelvin,
    uiMode,
    canUseTemperature,
    canUseSpectrum,
    onModeChange,
    onControlsChange,
    selectedColorHue,
    onColorSelect,
    padVisualStyle = 'plotter',
    onPadVisualStyleChange,
    onControlInteractionStart,
    onControlInteractionEnd,
    isDiscoMode,
    onDiscoModeTrigger,
    onDiscoModeExit,
    onPadMarkerSelect,
    onPadDoubleSelect,
    onToggle,
    groupedLights = [],
    groupedLightMarkers = [],
    controlScope = 'group',
    controlledLightEntityId,
    onControlScopeChange,
    onGroupedLightSelect,
    onGroupedLightToggle,
    onTapAction,
    onHoldAction,
    onDoubleTapAction,
}: CompactCardProps) {
    const holdTimer = useRef<number | null>(null);
    const tapTimer = useRef<number | null>(null);
    const holdTriggered = useRef(false);
    const [isGroupListOpen, setIsGroupListOpen] = useState(false);

    useEffect(() => {
        return () => {
            if (holdTimer.current) window.clearTimeout(holdTimer.current);
            if (tapTimer.current) window.clearTimeout(tapTimer.current);
        };
    }, []);

    const leadingValue =
        uiMode === 'temperature' && kelvin ? `${kelvin.toLocaleString()}K` : getRgbText(hue, saturation, brightness);
    const statusText =
        uiMode === 'temperature'
            ? formatStatus(isOn, brightness, kelvin, uiMode)
            : isOn
              ? `${Math.round(brightness)}% at ${leadingValue}`
              : 'Off';
    const compactBackground =
        buildGroupedCompactBackground(groupedLights, isDarkMode) ??
        buildCompactBackground(isOn, hue, saturation, brightness, uiMode, isDarkMode);
    const displayExpandedPrimaryName = expandedPrimaryName ?? lightName;
    const displayExpandedAreaName =
        expandedAreaName && expandedAreaName !== displayExpandedPrimaryName ? expandedAreaName : null;
    const displayExpandedSecondaryName =
        expandedSecondaryName && expandedSecondaryName !== displayExpandedPrimaryName ? expandedSecondaryName : null;
    const getGroupedLightToggleStyle = (groupedLight: GroupedLightOption) => ({
        background: buildIconBackground(
            groupedLight.isOn,
            groupedLight.previewHue,
            groupedLight.previewSaturation,
            groupedLight.previewBrightness,
            groupedLight.previewMode
        ),
        color: buildIconForeground(
            groupedLight.isOn,
            groupedLight.previewSaturation,
            groupedLight.previewBrightness,
            groupedLight.previewMode
        ),
    });

    const clearHold = () => {
        if (holdTimer.current) {
            window.clearTimeout(holdTimer.current);
            holdTimer.current = null;
        }
    };

    const handlePointerDown = () => {
        if (layout !== 'compact' || !onHoldAction) return;

        holdTriggered.current = false;
        clearHold();
        holdTimer.current = window.setTimeout(() => {
            holdTriggered.current = true;
            onHoldAction();
        }, 500);
    };

    const handlePointerEnd = () => {
        clearHold();
    };

    const handleClick = () => {
        if (layout !== 'compact' || !onTapAction) return;
        if (holdTriggered.current) {
            holdTriggered.current = false;
            return;
        }

        if (onDoubleTapAction) {
            if (tapTimer.current) {
                window.clearTimeout(tapTimer.current);
                tapTimer.current = null;
                onDoubleTapAction();
                return;
            }

            tapTimer.current = window.setTimeout(() => {
                tapTimer.current = null;
                onTapAction();
            }, 250);
            return;
        }

        onTapAction();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (layout !== 'compact' || !onTapAction) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onTapAction();
    };

    const handleIconPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        clearHold();
    };

    const handleIconClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        onToggle();
    };

    if (layout === 'compact') {
        return (
            <>
                <style>{compactCardStyles}</style>
                <CompactView
                    isDarkMode={isDarkMode}
                    lightName={lightName}
                    isOn={isOn}
                    compactBackground={compactBackground}
                    iconBackground={buildIconBackground(isOn, hue, saturation, brightness, uiMode)}
                    iconForeground={buildIconForeground(isOn, saturation, brightness, uiMode)}
                    statusText={statusText}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerEnd}
                    onPointerLeave={handlePointerEnd}
                    onPointerCancel={handlePointerEnd}
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    onIconPointerDown={handleIconPointerDown}
                    onIconClick={handleIconClick}
                    hasTapAction={Boolean(onTapAction)}
                />
            </>
        );
    }

    return (
        <>
            <style>{compactCardStyles}</style>
            <ExpandedCard
                isDarkMode={isDarkMode}
                displayExpandedAreaName={displayExpandedAreaName}
                displayExpandedPrimaryName={displayExpandedPrimaryName}
                displayExpandedSecondaryName={displayExpandedSecondaryName}
                leadingValue={leadingValue}
                brightness={brightness}
                hue={hue}
                saturation={saturation}
                kelvin={kelvin}
                isOn={isOn}
                uiMode={uiMode}
                canUseTemperature={canUseTemperature}
                canUseSpectrum={canUseSpectrum}
                onModeChange={onModeChange}
                onControlsChange={onControlsChange}
                selectedColorHue={selectedColorHue}
                onColorSelect={onColorSelect}
                padVisualStyle={padVisualStyle}
                onPadVisualStyleChange={onPadVisualStyleChange}
                onControlInteractionStart={onControlInteractionStart}
                onControlInteractionEnd={onControlInteractionEnd}
                isDiscoMode={isDiscoMode}
                onDiscoModeTrigger={onDiscoModeTrigger}
                onDiscoModeExit={onDiscoModeExit}
                onPadMarkerSelect={onPadMarkerSelect}
                onPadDoubleSelect={onPadDoubleSelect}
                onToggle={onToggle}
                lightName={lightName}
                groupedLights={groupedLights}
                groupedLightMarkers={groupedLightMarkers}
                controlScope={controlScope}
                controlledLightEntityId={controlledLightEntityId}
                isGroupListOpen={isGroupListOpen}
                onGroupListToggle={() => setIsGroupListOpen((current) => !current)}
                onGroupListClose={() => setIsGroupListOpen(false)}
                onControlScopeChange={onControlScopeChange}
                onGroupedLightSelect={onGroupedLightSelect}
                onGroupedLightToggle={onGroupedLightToggle}
                getGroupedLightToggleStyle={getGroupedLightToggleStyle}
            />
        </>
    );
}

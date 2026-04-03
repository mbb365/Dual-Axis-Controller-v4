import type { GroupedLightOption } from '../components/CompactCard';
import type { HaloMarker } from '../components/Halo';
import { getLightState } from '../services/ha-connection';
import {
    controlValuesFromPosition,
    formatGroupedLightValue,
    getMarkerControlValues,
    kelvinFromXPosition,
    supportsSpectrumForLight,
    type ControlScope,
    type GroupRelativeSnapshot,
    xFractionFromHueSat,
} from './control-state';

type HassLike = any;
type LightState = ReturnType<typeof getLightState>;

export function buildGroupedAggregateControlState(
    hass: HassLike,
    groupedLightIds: string[],
    uiMode: 'temperature' | 'spectrum',
    fallbackLight: NonNullable<LightState>,
    lockedSpectrumHue?: number | null
) {
    if (!groupedLightIds.length) {
        const values = getMarkerControlValues(fallbackLight, uiMode);
        const x =
            uiMode === 'spectrum' && lockedSpectrumHue != null
                ? Math.max(0, Math.min(1, values.saturation / 100))
                : xFractionFromHueSat(values.hue, values.saturation, uiMode);

        return {
            isOn: fallbackLight.state === 'on',
            brightness: values.brightness,
            hue: uiMode === 'spectrum' && lockedSpectrumHue != null ? lockedSpectrumHue : values.hue,
            saturation: uiMode === 'spectrum' && lockedSpectrumHue != null ? Math.round(x * 100) : values.saturation,
            kelvin:
                uiMode === 'temperature'
                    ? fallbackLight.attributes.color_temp_kelvin ||
                      (fallbackLight.attributes.color_temp != null
                          ? Math.round(1000000 / fallbackLight.attributes.color_temp)
                          : kelvinFromXPosition(x, fallbackLight))
                    : null,
        };
    }

    const members = groupedLightIds
        .map((memberId) => {
            const memberState = getLightState(hass, memberId);
            if (!memberState) return null;

            const values = getMarkerControlValues(memberState, uiMode);
            return {
                isOn: memberState.state === 'on',
                brightness: values.brightness,
                x:
                    uiMode === 'spectrum' && lockedSpectrumHue != null
                        ? Math.max(0, Math.min(1, values.saturation / 100))
                        : xFractionFromHueSat(values.hue, values.saturation, uiMode),
            };
        })
        .filter(
            (
                member
            ): member is {
                isOn: boolean;
                brightness: number;
                x: number;
            } => member != null
        );

    if (!members.length) {
        return buildGroupedAggregateControlState(hass, [], uiMode, fallbackLight, lockedSpectrumHue);
    }

    const averageX = members.reduce((total, member) => total + member.x, 0) / members.length;
    const averageBrightness = members.reduce((total, member) => total + member.brightness, 0) / members.length;
    const averagedValues =
        uiMode === 'spectrum' && lockedSpectrumHue != null
            ? {
                  brightness: averageBrightness,
                  hue: lockedSpectrumHue,
                  saturation: Math.round(averageX * 100),
              }
            : controlValuesFromPosition(averageX, averageBrightness, uiMode);

    return {
        isOn: members.some((member) => member.isOn),
        brightness: averageBrightness,
        hue: averagedValues.hue,
        saturation: averagedValues.saturation,
        kelvin: uiMode === 'temperature' ? kelvinFromXPosition(averageX, fallbackLight) : null,
    };
}

export function buildGroupedLights(hass: HassLike, groupedLightIds: string[]): GroupedLightOption[] {
    return groupedLightIds
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
}

export function buildGroupedLightMarkers(
    hass: HassLike,
    groupedLightIds: string[],
    uiMode: 'temperature' | 'spectrum',
    controlScope: ControlScope,
    controlledLightEntityId: string | null | undefined,
    relativeLayout: GroupRelativeSnapshot | null,
    lockedSpectrumHue?: number | null
): HaloMarker[] {
    if (relativeLayout?.mode === uiMode) {
        return relativeLayout.members.map((member) => ({
            entityId: member.entityId,
            isOn: member.brightness > 0,
            isActive: controlScope === 'group-relative' && controlledLightEntityId === member.entityId,
            ...(uiMode === 'spectrum' && lockedSpectrumHue != null
                ? {
                      brightness: member.brightness,
                      hue: lockedSpectrumHue,
                      saturation: Math.round(member.x * 100),
                  }
                : controlValuesFromPosition(member.x, member.brightness, uiMode)),
        }));
    }

    return groupedLightIds.reduce<HaloMarker[]>((markers, memberId) => {
        const memberState = getLightState(hass, memberId);
        if (!memberState) return markers;

        const controlValues = getMarkerControlValues(memberState, uiMode);

        markers.push({
            entityId: memberId,
            isOn: memberState.state === 'on',
            isActive: controlScope === 'individual' && controlledLightEntityId === memberId,
            ...(uiMode === 'spectrum' && lockedSpectrumHue != null
                ? {
                      brightness: controlValues.brightness,
                      hue: lockedSpectrumHue,
                      saturation: controlValues.saturation,
                  }
                : controlValues),
        });

        return markers;
    }, []);
}

export function buildGroupRelativeSnapshot(
    hass: HassLike,
    groupedLightIds: string[],
    uiMode: 'temperature' | 'spectrum',
    lockedSpectrumHue?: number | null
): GroupRelativeSnapshot | null {
    const members = groupedLightIds
        .map((memberId) => {
            const memberLight = getLightState(hass, memberId);
            if (!memberLight) return null;

            const values = getMarkerControlValues(memberLight, uiMode);
            return {
                entityId: memberId,
                light: memberLight,
                x:
                    uiMode === 'spectrum' && lockedSpectrumHue != null
                        ? Math.max(0, Math.min(1, values.saturation / 100))
                        : xFractionFromHueSat(values.hue, values.saturation, uiMode),
                brightness: values.brightness,
            };
        })
        .filter(
            (
                member
            ): member is {
                entityId: string;
                light: NonNullable<LightState>;
                x: number;
                brightness: number;
            } => member != null
        );

    if (!members.length) {
        return null;
    }

    return {
        mode: uiMode,
        averageX: members.reduce((total, member) => total + member.x, 0) / members.length,
        averageBrightness: members.reduce((total, member) => total + member.brightness, 0) / members.length,
        members,
    };
}

export function buildCompactCardState({
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
}: {
    hass: HassLike;
    groupLight: NonNullable<LightState>;
    groupedLightIds: string[];
    entityId: string;
    name?: string;
    uiMode: 'temperature' | 'spectrum';
    lightName: string;
    groupedLights: GroupedLightOption[];
    controlScope: ControlScope;
    controlledLightEntityId: string | null | undefined;
}) {
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
    const compactAggregate = buildGroupedAggregateControlState(hass, groupedLightIds, compactUiMode, groupLight);

    return {
        compactLightName,
        compactUiMode,
        compactBrightness: compactAggregate.brightness,
        compactHue: compactAggregate.hue,
        compactSaturation: compactAggregate.saturation,
        compactKelvin: compactAggregate.kelvin,
        compactIsOn: compactAggregate.isOn,
        expandedPrimaryName: groupedLights.length ? compactLightName : lightName,
        expandedSecondaryName: groupedLights.length
            ? controlScope === 'group'
                ? null
                : groupedLights.find((groupedLight) => groupedLight.entityId === controlledLightEntityId)?.name ?? null
            : null,
    };
}

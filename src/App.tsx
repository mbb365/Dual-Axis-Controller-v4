import { useState, useEffect, useRef, useCallback } from 'react';
import { getLightState, callLightService } from './services/ha-connection';
import { CompactCard } from './components/CompactCard.tsx';

export interface CardAppProps {
  hass: any;
  entityId: string;
}

export function CardApp({ hass, entityId }: CardAppProps) {
  const light = getLightState(hass, entityId);
  const lightName = light?.attributes.friendly_name || entityId;

  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [brightness, setBrightness] = useState(50);
  const [kelvin, setKelvin] = useState<number | null>(null);
  const [isOn, setIsOn] = useState(false);
  const [uiMode, setUiMode] = useState<'temperature' | 'spectrum'>('temperature');

  const lastCommandTime = useRef(0);
  const isUserInteracting = useRef(false);
  const interactionTimeout = useRef<number | null>(null);

  // Sync UI state from hass whenever Home Assistant updates the entity
  useEffect(() => {
    const light = getLightState(hass, entityId);
    if (!light || isUserInteracting.current) return;

    setIsOn(light.state === 'on');

    if (light.attributes.brightness !== undefined) {
      setBrightness(Math.round((light.attributes.brightness / 255) * 100));
    }
    if (light.attributes.hs_color) {
      setHue(light.attributes.hs_color[0]);
      setSaturation(light.attributes.hs_color[1]);
    }

    if (light.attributes.color_temp_kelvin != null || light.attributes.color_temp != null) {
      const k = light.attributes.color_temp_kelvin || Math.round(1000000 / light.attributes.color_temp!);
      setKelvin(k);

      // If in temperature mode, we need to sync our Hue/Saturation state to match the Kelvin value
      // so the indicator on the trackpad is in the right place.
      const minM = light.attributes.min_mireds || 153;
      const maxM = light.attributes.max_mireds || 500;
      const lightMireds = light.attributes.color_temp || (1000000 / k);

      // Map mireds [minM, maxM] to x [0, 1]
      const x = (lightMireds - minM) / (maxM - minM);
      const clampedX = Math.max(0, Math.min(1, x));

      if (clampedX < 0.5) {
        setHue(200); // Cool
        setSaturation(Math.round((0.5 - clampedX) * 2 * 100));
      } else {
        setHue(30); // Warm
        setSaturation(Math.round((clampedX - 0.5) * 2 * 100));
      }
    } else if (light.attributes.hs_color) {
      const [h, s] = light.attributes.hs_color;
      let x = 0.5;
      const isCool = Math.abs(h - 200) < Math.abs(h - 30);
      if (isCool) {
        x = 0.5 - (s / 200);
      } else {
        x = 0.5 + (s / 200);
      }
      x = Math.max(0, Math.min(1, x));
      const minM = light.attributes.min_mireds || 153;
      const maxM = light.attributes.max_mireds || 500;
      const mireds = Math.round(minM + x * (maxM - minM));
      setKelvin(Math.round(1000000 / mireds));
    }

    // Auto-detect color mode
    setUiMode(prev => {

      const isColorMode = ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].includes(light.attributes.color_mode || '');

      if (light.attributes.color_mode === 'color_temp') {
        return 'temperature';
      }

      if (isColorMode) {
        // If already in spectrum, stay there as long as the light is in a color mode
        if (prev === 'spectrum') return 'spectrum';

        // Auto-switch to spectrum only if color is distinctly saturated
        if (light.attributes.hs_color) {
          const [h, s] = light.attributes.hs_color;
          const isWhiteish = s < 8;
          const isCoolOrWarm = Math.abs(h - 200) < 20 || Math.abs(h - 35) < 20;
          if (!isWhiteish && !isCoolOrWarm && s > 15) return 'spectrum';
        }
      }

      return 'temperature';
    });
  }, [hass, entityId]);

  const handleControlsChange = useCallback((h: number, s: number, b: number) => {
    isUserInteracting.current = true;
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = window.setTimeout(() => { isUserInteracting.current = false; }, 500);

    setHue(h);
    setSaturation(s);
    setBrightness(b);

    const now = Date.now();
    if (now - lastCommandTime.current < 200) return; // throttle to ~5 commands/sec
    lastCommandTime.current = now;

    const serviceParams: any = {
      brightness: b,
      hs_color: [h, s]
    };

    if (uiMode === 'temperature') {
      // Still estimate Kelvin for immediate UI feedback
      let x = 0.5;
      const isCool = Math.abs(h - 200) < Math.abs(h - 30);
      if (isCool) {
        x = 0.5 - (s / 200);
      } else {
        x = 0.5 + (s / 200);
      }
      const minM = light?.attributes.min_mireds || 153;
      const maxM = light?.attributes.max_mireds || 500;
      const mireds = Math.round(minM + x * (maxM - minM));
      setKelvin(Math.round(1000000 / mireds));
      // Note: We send hs_color instead of color_temp for maximum compatibility across multiple light types
    }

    callLightService(hass, entityId, b > 0, serviceParams);
  }, [hass, entityId, uiMode, light?.attributes.min_mireds, light?.attributes.max_mireds]);

  const handleToggle = useCallback(() => {
    const newState = !isOn;
    setIsOn(newState);
    isUserInteracting.current = true;
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = window.setTimeout(() => { isUserInteracting.current = false; }, 1000);
    callLightService(hass, entityId, newState);
  }, [hass, entityId, isOn]);

  // Debug: Log whenever the card renders
  console.log('[DualControllerCard] Render', { entityId, lightFound: !!light, isOn });

  if (!light) {
    return (
      <div style={{ padding: '20px', color: '#ffb3b3', background: '#1a1a1a', borderRadius: '12px', border: '1px solid #ff4d4d' }}>
        <strong>Light not found:</strong> {entityId}<br />
        <small style={{ opacity: 0.7 }}>Ensure the entity ID is correct and starts with "light."</small>
      </div>
    );
  }

  return (
    <>
      <CompactCard
        lightName={lightName}
        isOn={isOn}
        hue={hue}
        saturation={saturation}
        brightness={brightness}
        kelvin={kelvin}
        uiMode={uiMode}
        onToggle={handleToggle}
        onModeChange={(mode: 'temperature' | 'spectrum') => {
          setUiMode(mode);
          isUserInteracting.current = true;
          if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
          interactionTimeout.current = window.setTimeout(() => { isUserInteracting.current = false; }, 3000);
        }}
        onControlsChange={handleControlsChange}
      />
    </>
  );
}

export default CardApp;

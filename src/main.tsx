import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CardApp } from './App';

function MockHomeAssistant() {
    const [mockState, setMockState] = useState<any>({
        state: 'on',
        attributes: {
            friendly_name: 'Virtual Preview Light',
            brightness: 128, // 50%
            color_mode: 'color_temp',
            color_temp: 250, // 4000K
            color_temp_kelvin: 4000,
            min_mireds: 153,
            max_mireds: 500,
            hs_color: [30, 50]
        }
    });

    const hass = React.useMemo(() => ({
        states: {
            'light.preview': mockState
        },
        callService: async (domain: string, service: string, serviceData: any) => {
            console.log(`[Mock HA] ${domain}.${service}`, serviceData);
            if (domain === 'light') {
                setMockState((prev: any) => {
                    const next = { ...prev };
                    const attrs = { ...prev.attributes };
                    
                    if (service === 'turn_on') {
                        next.state = 'on';
                        if (serviceData.brightness !== undefined) {
                            attrs.brightness = serviceData.brightness;
                        }
                        if (serviceData.hs_color !== undefined) {
                            attrs.hs_color = serviceData.hs_color;
                            attrs.color_mode = 'hs';
                            // Clear temp when hs_color is set
                            attrs.color_temp = null;
                            attrs.color_temp_kelvin = null;
                        }
                        if (serviceData.color_temp !== undefined) {
                            attrs.color_temp = serviceData.color_temp;
                            attrs.color_temp_kelvin = Math.round(1000000 / serviceData.color_temp);
                            attrs.color_mode = 'color_temp';
                        }
                    } else if (service === 'turn_off') {
                        next.state = 'off';
                    }
                    
                    next.attributes = attrs;
                    return next;
                });
            }
        }
    }), [mockState]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100vw',
            height: '100vh',
            backgroundColor: '#efefef',
            padding: '24px',
            boxSizing: 'border-box'
        }}>
            <div style={{ maxWidth: '600px', width: '100%' }}>
               <CardApp hass={hass} entityId="light.preview" />
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<MockHomeAssistant />);
}

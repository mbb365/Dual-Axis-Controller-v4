window.process ??= { env: { NODE_ENV: 'production' } };

import { createRoot } from 'react-dom/client';
import { CardApp } from './App';
import type { CardLayout } from './components/CompactCard';

interface ActionConfig {
    action: string;
    [key: string]: unknown;
}

interface DualControllerConfig {
    type: string;
    entity: string;
    name?: string;
    icon?: string;
    layout?: CardLayout | 'auto';
    tap_action?: ActionConfig;
    hold_action?: ActionConfig;
    double_tap_action?: ActionConfig;
}

class DualControllerCard extends HTMLElement {
    private _root: ReturnType<typeof createRoot> | null = null;
    private _hass: any = null;
    private _config: DualControllerConfig | null = null;

    public setConfig(config: DualControllerConfig) {
        if (!config.entity) {
            throw new Error('Dual Axis Controller: please define an "entity" in the card config.');
        }

        if (config.layout && !['compact', 'expanded', 'auto'].includes(config.layout)) {
            throw new Error('Dual Axis Controller: layout must be "compact", "expanded", or "auto".');
        }

        this._config = config;
        this._render();
    }

    public set hass(hass: any) {
        this._hass = hass;
        this._render();
    }

    public connectedCallback() {
        this._render();
    }

    public disconnectedCallback() {
        if (this._root) {
            this._root.unmount();
            this._root = null;
        }
    }

    public getCardSize() {
        return this._config?.layout === 'expanded' ? 7 : 1;
    }

    public getGridOptions() {
        if (this._config?.layout === 'expanded') {
            return {
                rows: 7,
                columns: 6,
                min_rows: 6,
                min_columns: 4,
            };
        }

        return {
            rows: 1,
            columns: 6,
            min_rows: 1,
            max_rows: 1,
            min_columns: 6,
        };
    }

    static getStubConfig(hass: any): DualControllerConfig {
        const lightEntity = Object.keys(hass.states).find((entityId) => entityId.startsWith('light.'));

        return {
            type: 'custom:dual-controller-v3',
            entity: lightEntity || 'light.my_light',
            layout: 'compact',
        };
    }

    private _dispatchAction(action: 'tap' | 'hold' | 'double_tap') {
        if (!this._config) return;

        if (action === 'hold' && !this._config.hold_action) return;
        if (action === 'double_tap' && !this._config.double_tap_action) return;

        const event = new Event('hass-action', {
            bubbles: true,
            composed: true,
        }) as Event & {
            detail: {
                config: DualControllerConfig;
                action: 'tap' | 'hold' | 'double_tap';
            };
        };

        event.detail = {
            config: {
                ...this._config,
                tap_action: this._config.tap_action ?? { action: 'more-info' },
            },
            action,
        };

        this.dispatchEvent(event);
    }

    private _render() {
        if (!this._config || !this._hass) return;

        if (!this._root) {
            const shadow = this.attachShadow({ mode: 'open' });
            const card = document.createElement('ha-card');
            card.style.background = 'none';
            card.style.border = 'none';
            card.style.boxShadow = 'none';
            card.style.display = 'block';
            card.style.width = '100%';
            card.style.height = 'auto';
            card.style.overflow = 'visible';
            shadow.appendChild(card);
            this._root = createRoot(card);
        }

        this._root.render(
            <CardApp
                hass={this._hass}
                entityId={this._config.entity}
                icon={this._config.icon}
                name={this._config.name}
                layout={this._config.layout ?? 'compact'}
                onTapAction={this._config.tap_action ? () => this._dispatchAction('tap') : undefined}
                onHoldAction={this._config.hold_action ? () => this._dispatchAction('hold') : undefined}
                onDoubleTapAction={
                    this._config.double_tap_action ? () => this._dispatchAction('double_tap') : undefined
                }
            />
        );
    }
}

if (!customElements.get('dual-controller-v3')) {
    customElements.define('dual-controller-v3', DualControllerCard);
}

const customCards = (window.customCards ??= []);
if (!customCards.some((card) => card.type === 'dual-controller-v3')) {
    customCards.push({
        type: 'dual-controller-v3',
        name: 'Dual Axis Controller',
        description: 'Compact dashboard launcher and expanded light controller for Home Assistant.',
        preview: true,
        documentationURL: 'https://developers.home-assistant.io/docs/frontend/custom-ui/custom-card/',
    });
}

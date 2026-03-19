// @ts-ignore
window.process = { env: { NODE_ENV: 'production' } };

import { createRoot } from 'react-dom/client';
import { CardApp } from './App';

/**
 * DualControllerCard — Home Assistant Custom Card
 *
 * Configuration:
 *   type: custom:dual-controller-card
 *   entity: light.your_light_entity
 */
class DualControllerCard extends HTMLElement {
    private _root: ReturnType<typeof createRoot> | null = null;
    private _hass: any = null;
    private _config: any = null;

    setConfig(config: any) {
        if (!config.entity) {
            throw new Error('Dual Controller Card: please define an "entity" in your card config.');
        }
        this._config = config;
        this._render();
    }

    set hass(hass: any) {
        this._hass = hass;
        this._render();
    }

    connectedCallback() {
        this._render();
    }

    disconnectedCallback() {
        if (this._root) {
            this._root.unmount();
            this._root = null;
        }
    }

    private _render() {
        if (!this._config || !this._hass) return;

        if (!this._root) {
            // Restore Shadow DOM explicitly here so we don't bleed React elements globally
            // Halo.tsx handles its internal styling by rendering `<style>` inside this root safely.
            const shadow = this.attachShadow({ mode: 'open' });
            const card = document.createElement('ha-card');
            card.style.background = 'none';
            card.style.border = 'none';
            card.style.boxShadow = 'none';
            card.style.display = 'block';
            card.style.width = '100%';
            card.style.height = 'auto';
            card.style.minHeight = 'auto';
            card.style.overflow = 'visible';
            shadow.appendChild(card);
            this._root = createRoot(card);
            console.log('[DualControllerCard] Web Component mounted inside a secure Shadow DOM');
        }

        this._root.render(
            <CardApp hass={this._hass} entityId={this._config.entity} />
        );
    }

    getCardSize() {
        return 2;
    }

    static getConfigElement() {
        // For future visual config editor support
        return document.createElement('div');
    }

    static getStubConfig(hass: any) {
        // Try to find the first available light entity for auto-config
        const lightEntity = Object.keys(hass.states).find(e => e.startsWith('light.'));
        return { entity: lightEntity || 'light.my_light' };
    }
}

if (!customElements.get('dual-controller-v3')) {
    customElements.define('dual-controller-v3', DualControllerCard);
}

# Dual Axis Controller

<p align="center">
  <img src="./icon.png" alt="Dual Axis Controller icon" width="180" />
</p>

A Home Assistant custom dashboard card for lights with a single adaptive layout.

The card automatically uses a compact dashboard presentation and opens the larger 2D controller when needed, so users no longer need to choose between separate `compact` and `expanded` layout modes in YAML.

## Features

- Adaptive dashboard card with compact presentation and built-in expanded controller
- Built-in compact-to-expanded popup flow when no `tap_action` override is configured
- Standard Home Assistant card actions via `tap_action`, `hold_action`, and `double_tap_action`
- Home Assistant-aware sizing through `getCardSize()` and `getGridOptions()`
- HACS-compatible repository structure and release workflow

## Install With HACS

1. Open HACS and go to **Dashboard**.
2. Open the three-dot menu and choose **Custom repositories**.
3. Add `https://github.com/mbb365/Dual-Axis-Controller-v4` as a **Dashboard** repository.
4. Download the repository in HACS.
5. Reload Home Assistant.

For testing the latest in-development version, choose the `main` branch in HACS when downloading. HACS supports downloading the default branch for custom repositories, and if releases exist it can also offer recent releases alongside that branch.

## YAML

Recommended card configuration:

```yaml
type: custom:dual-controller-v3
entity: light.living_room
layout: auto
```

## Notes

- `layout: auto` is the supported layout option.
- The card handles compact presentation and expanded control flow automatically.
- Tapping the compact card opens the built-in expanded popup by default.
- If `tap_action`, `hold_action`, or `double_tap_action` are configured, the card fires those standard Home Assistant actions instead.
- Branding assets are included as [icon.png](/Users/MattOpenHomeFoundation/Desktop/Dual Axis Controller/DAC Version 4/dual-halo-controller/icon.png) and [brand/icon.png](/Users/MattOpenHomeFoundation/Desktop/Dual Axis Controller/DAC Version 4/dual-halo-controller/brand/icon.png).
- The bundled file produced for Home Assistant is `dual-axis-controller-v4.js`.

# Dual Axis Controller

A Home Assistant custom dashboard card for lights with two HA-native layouts:

- `compact` for the dashboard
- `expanded` for popup or detail views

The compact card is designed to feel like a standard Home Assistant card: a clean state summary that can open the expanded controller by default or honor normal Home Assistant card actions when configured. The expanded card provides the larger 2D light control surface.

## Features

- Compact dashboard card with name, icon, and light status
- Expanded controller layout for popup or detail use
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

Compact dashboard card:

```yaml
type: custom:dual-controller-v3
entity: light.living_room
layout: compact
tap_action:
  action: more-info
```

Expanded card:

```yaml
type: custom:dual-controller-v3
entity: light.living_room
layout: expanded
```

Automatic layout selection based on available width:

```yaml
type: custom:dual-controller-v3
entity: light.living_room
layout: auto
```

## Notes

- `layout: compact` is the recommended dashboard default.
- `layout: expanded` is intended for popup or detail contexts.
- In compact mode, tapping opens the built-in expanded popup by default.
- If `tap_action`, `hold_action`, or `double_tap_action` are configured, the card fires those standard Home Assistant actions instead.
- The bundled file produced for Home Assistant is `dual-axis-controller-v4.js`.

# Dual Axis Controller Feature Guide

This is a short reference for what the controller can do today, with a simple note on whether each capability is inherited from the older controller model or is a newer feature added during this project iteration.

## Inherited Core Features

These are the controller behaviors that already existed in the older `v8.0.16` model, or are direct restorations of that approach.

- `Group` control: move the whole group together as a single target.
- `Group Relative` control: move the formation while preserving each light's offset from the group.
- `Individual` control: select one member light and control that light directly.
- Group aggregation: the card reads grouped lights as one controller state for power, brightness, and position summaries.
- Controller styles: `Standard`, `Matrix`, and `Brick`.
- Group member list: select lights from the group list and view per-light state in grouped control.
- Last-lit restore behavior: turning a light or group back on restores the previous usable output instead of always coming back at zero.

## Newer Features Added In This Project

These are features we introduced or significantly expanded during this recent round of work.

- Shared favourites across devices using Home Assistant scenes, rather than only browser-local storage.
- Built-in `Candlelight` preset at `2200K` and `60%`.
- Built-in `Circadian` preset that follows sunrise and sunset when `sun.sun` is available.
- Five-slot favourites model: user favourites plus permanent built-in presets.
- Inline favourite editing flow with dedicated edit controls instead of relying only on top-level settings.
- Extra settings menu in the top-right corner for controller-style switching and preset editing.
- Auto-switch into `Group Relative` when multiple lights are clearly separated from the group.
- Persistent `Group Relative` formation picker that stays visible while moving an individual light.
- Reposition workflow inside `Group Relative`: pick a member light, move it, then return to the formation control point.
- Remember controller context across reopening and power cycles, including controller style and active control scope.
- Group-relative power-cycle cleanup so the temporary moved-light selection is cleared when the whole group is turned off and back on.
- Compact-card power behavior fixes so the compact toggle follows the live displayed state more reliably.
- Home Assistant card lifecycle hardening to reduce reconnect-related dashboard configuration errors.

## Notes On "Invented" Features

If you want a quick rule of thumb:

- Not new: the core `Group / Group Relative / Individual` control model and the three controller styles.
- New: the modern favourites system, the cross-device sharing, the built-in presets, the auto-relative behavior for split scenes, and most of the newer workflow polish around the settings menu and relative-light repositioning.

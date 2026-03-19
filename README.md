# Dual Axis Controller 🎮

A premium, fluid side-by-side Lovelace card for Home Assistant, designed for maximum aesthetic control over your smart lights. 

## ✨ Features
- **Responsive Trackpad**: An interactive 2D color and brightness control surface that fluidly scales to fit any dashboard layout without breaking boundaries.
- **Dual Modes**: Seamlessly switch between precise Kelvin Color Temperature control and full-range Hue/Saturation Spectrum mode.
- **Side-by-Side Design**: Eliminates awkward vertical stacking by clustering quick-action mode buttons alongside the main trackpad.
- **Shadow DOM Isolation**: Guarantees that global Home Assistant themes and unpredictable dashboard updates will never accidentally squash or break your card's layout.
- **Live Peer Indicators**: Trackpad displays the real-time position of other active lights.

## 📦 Installation via HACS
1. Open HACS and navigate to **Frontend**.
2. Click the three dots in the top right -> **Custom repositories**.
3. Add this repository URL and select category **Lovelace**.
4. Click **Download** and reload your browser window.

## ⚙️ Configuration
Add the custom card to your dashboard using the following YAML:

```yaml
type: custom:dual-controller-v3
entity: light.your_light_entity
```

*(Note: Ensure your light entity supports `color_temp` or `hs_color` features for the trackpad to function).*

# Dual Axis Controller

A Home Assistant custom dashboard card for lights with a single adaptive layout.

Just say no to using two inputs to control one output!!!

## Features

- Group relative lighting control. Keep the lights at the consistant relative tone and the lumins (subjective brightness) the same.
- Single input for lighting tone and brightness.

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

- I am looking for feedback on performed vs. expected bahaviour

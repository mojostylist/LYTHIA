# Project-Specific Instructions for LYTHIA

## Image & Visual Generation Rule
- **3D Quality Rendering Terms**: When generating visual or image prompts, always incorporate professional 3D rendering terms including `OctaneRender, raytraced caustics, subsurface scattering, 85mm lens depth of field, and PBR material textures` to ensure photorealistic and lifelike output.

## Publishing Constraints
- **Version Code Rule**: For every new publish/build attempt, if a publish fails due to versioning issues, the `versionCode` and `versionName` in `/app/build.gradle.kts` must be strictly incremented (e.g., must be greater than the previous version, currently set at `versionCode = 26` / `versionName = "26.0"`).
- Always ensure that both `versionCode` and `versionName` are in sync and updated incrementally before issuing final applet compiles or triggering publication actions.

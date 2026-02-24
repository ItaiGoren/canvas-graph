# Canvas Graph — Angular Example App

This is a demonstration application built with Angular, utilizing the `@canvas-graph/ng-canvas-graph` integration and `@canvas-graph/mock-server` to render high-performance time-series data using WebGL/Canvas APIs.

## Recent Changes (Agent Context)
- Removed the former top navigation toolbar.
- Centered the main `app-graph-view` canvas component.
- Implemented a stylish, premium radio button dial at the top to allow hot-swapping different mock data modes (`random-walk`, `variable-sine`, `pulse-wave`, `multi-wave`, `sparse-sine`).
- Augmented the `.app-container` with modern deep dark mode design.

## Technical Details
The app relies on the `MockServer` class to yield generated multi-point wave data which is then piped directly to the Canvas element via properties.

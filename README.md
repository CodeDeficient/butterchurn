# Butterchurn 3D Sphere Visualizer

This project takes the classic Butterchurn (Milkdrop-style) music visualizations and maps them onto a dynamic, audio-reactive 3D sphere using Three.js and React.

## Features

*   Real-time audio visualization using Butterchurn.
*   Visualizations mapped onto a 3D sphere rendered with Three.js.
*   Sphere geometry deforms based on audio frequency analysis (bass, mids, treble) for a "breathing" or "ferrofluid" effect.
*   Butterchurn presets can be selected via a dropdown menu.
*   Basic playback controls (Play/Pause).
*   Built with Vite for fast development and optimized builds.
*   Includes a Dev Container configuration for a consistent development environment.

## Running the Project

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/CodeDeficient/butterchurn.git
    cd butterchurn
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Run the Development Server:**
    ```bash
    npm run dev
    ```
4.  Open the provided local URL (usually `http://localhost:5173`) in your browser.

### Using the Dev Container (Recommended)

1.  Ensure you have Docker installed and running.
2.  Ensure you have the VS Code "Dev Containers" extension (or similar functionality in your editor, like Cursor).
3.  Open the cloned project folder in VS Code/Cursor.
4.  Click "Reopen in Container" when prompted, or use the command palette (`Ctrl/Cmd+Shift+P`) to run "Dev Containers: Rebuild and Reopen in Container".
5.  The container will build, dependencies will be installed automatically (`npm install`), and the environment will be ready.
6.  Run `npm run dev` inside the container's integrated terminal.

## Acknowledgements & Citations

This project builds upon several fantastic open-source libraries:

*   **Butterchurn:** The core WebGL Milkdrop implementation.
    *   Original Source: [jberg/butterchurn](https://github.com/jberg/butterchurn)
    *   This Project Fork: [CodeDeficient/butterchurn](https://github.com/CodeDeficient/butterchurn.git)
    *   Presets: Uses `butterchurn-presets`.
*   **Three.js:** Used for 3D rendering, geometry, materials, and shaders. [https://threejs.org/](https://threejs.org/)
*   **React:** Used for building the user interface components. [https://react.dev/](https://react.dev/)
*   **Vite:** Used as the development server and build tool. [https://vitejs.dev/](https://vitejs.dev/)

Special thanks to the creators of Milkdrop and the many preset authors whose work makes Butterchurn possible.

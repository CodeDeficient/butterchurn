import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
// import { FaPlay, FaPause } from 'react-icons/fa';
import butterchurn from 'butterchurn';
import butterchurnPresets from 'butterchurn-presets';
import * as THREE from 'three';

// --- GLSL Shader Code ---
const vertexShader = `
  uniform float uAudioLevel; // Overall average (optional)
  uniform float uTime;
  uniform float uBassLevel;
  uniform float uMidLevel;
  uniform float uTrebleLevel;
  
  varying vec2 vUv;

  // Basic noise function
  float noise(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 151.7182))) * 43758.5453);
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    // Slower noise evolution
    float baseNoiseFactor = noise(position + uTime * 0.08); 
    float midNoiseFactor = noise(position * 2.0 + uTime * 0.15);
    float trebleNoiseFactor = noise(position * 4.0 + uTime * 0.25);

    // Reduced displacement multipliers
    float bassDisplacement = baseNoiseFactor * uBassLevel * 0.25; 
    float midDisplacement = midNoiseFactor * uMidLevel * 0.15; 
    float trebleDisplacement = trebleNoiseFactor * uTrebleLevel * 0.1; 

    float totalDisplacement = bassDisplacement + midDisplacement + trebleDisplacement;
    
    // Optional clamping (can uncomment and adjust max value)
    // totalDisplacement = clamp(totalDisplacement, 0.0, 0.6); 

    pos += normal * totalDisplacement;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D tDiffuse; // Butterchurn texture
  varying vec2 vUv;

  void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
  }
`;

const clock = new THREE.Clock(); // Clock for uTime uniform

const ButterchurnVisualizer = () => {
    // --- Refs ---
    const mountRef = useRef(null);       // Ref for mounting Three.js canvas
    const canvasRef = useRef(null);      // Butterchurn's canvas (hidden)
    const audioElRef = useRef(null);     // Ref to hold the Audio element
    const visualizerRef = useRef(null);  // Ref to hold the visualizer instance
    const audioContextRef = useRef(null);// Ref to hold the AudioContext
    const analyserRef = useRef(null);    // Ref to hold the AnalyserNode
    const animationFrameIdRef = useRef(null);
    const isInitializedRef = useRef(false); // Flag to prevent re-initialization

    // --- Three.js Refs ---
    const rendererRef = useRef(null);
    const sceneRef = useRef(null);
    const cameraRef = useRef(null);
    const sphereRef = useRef(null);
    const textureRef = useRef(null);

    // --- Refs for Smoothing Audio Levels ---
    const smoothedBassRef = useRef(0.0);
    const smoothedMidRef = useRef(0.0);
    const smoothedTrebleRef = useRef(0.0);

    // --- State ---
    const [isPlaying, setIsPlaying] = useState(false);
    const [presets, setPresets] = useState({});
    const [presetKeys, setPresetKeys] = useState([]);
    const [currentPresetKey, setCurrentPresetKey] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [refsReady, setRefsReady] = useState(false); // State to track ref readiness

    // --- Constants ---
    const AUDIO_URL = '/audio_files/Lifes_Embrace.mp3';

    // --- Logging ---
    const log = useCallback((message) => {
        console.log(message); // Direct console logging is simpler for now
    }, []);

    // --- Initialization Function (Called once when refs are ready) ---
    const initialize = useCallback(() => {
        // Double-check initialization hasn't already run
        if (isInitializedRef.current) {
            log('Initialization already done, skipping.');
            return;
        }
        // Refs must be ready by the time this is called
        if (!mountRef.current || !canvasRef.current) {
            log('Initialization called but refs unexpectedly not ready!');
            setErrorMessage('Error: Component refs not found during init.');
            return;
        }
        log('Starting initialization (refs confirmed ready)...');

        try {
            // 1. Create Audio Element (if not already created)
            if (!audioElRef.current) {
                log(`Creating Audio element with URL: ${AUDIO_URL}`);
                audioElRef.current = new Audio(AUDIO_URL);
                audioElRef.current.preload = 'auto';
                audioElRef.current.crossOrigin = 'anonymous';
            }
            const audioEl = audioElRef.current;

            // 2. Setup Event Listeners for Audio Element
            const handleAudioPlayPause = () => {
                log(`Audio Event: ${!audioEl.paused ? 'play/playing' : 'pause/ended'}`);
                setIsPlaying(!audioEl.paused);
            };
            audioEl.addEventListener('play', handleAudioPlayPause);
            audioEl.addEventListener('playing', handleAudioPlayPause);
            audioEl.addEventListener('pause', handleAudioPlayPause);
            audioEl.addEventListener('ended', handleAudioPlayPause);

              audioEl.onerror = (e) => {
                  let errorDetails = 'Unknown error';
                  if (audioEl.error) {
                      switch (audioEl.error.code) {
                        case MediaError.MEDIA_ERR_ABORTED: errorDetails = 'Aborted'; break;
                          case MediaError.MEDIA_ERR_NETWORK: errorDetails = 'Network error'; break;
                          case MediaError.MEDIA_ERR_DECODE: errorDetails = 'Decode error'; break;
                          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: errorDetails = 'Source not supported'; break;
                          default: errorDetails = `Code ${audioEl.error.code}`;
                      }
                  }
                log(`Audio Element Error: ${errorDetails}. Event: ${e.type}`);
                setErrorMessage(`Audio Error: ${errorDetails}`);
                isInitializedRef.current = false; // Reset flag on error
            };

            // 3. Setup Visualizer after Audio Data Loads
            audioEl.onloadeddata = () => {
                log('Audio Element loaded data.');

                // Check init flag *again* inside async callback, plus context check
                if (isInitializedRef.current || audioContextRef.current) {
                    log('Visualizer setup skipped (already initialized or context exists).');
                    return;
                }

                try {
                    // --- Start Butterchurn/Audio Setup ---
                    log('Creating AudioContext...');
                    const newAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                    audioContextRef.current = newAudioContext;
                    log('AudioContext created.');

                    log('Creating MediaElementSource...');
                    const source = newAudioContext.createMediaElementSource(audioEl);
                    log('MediaElementSource created.');

                    log('Creating AnalyserNode...');
                    const newAnalyser = newAudioContext.createAnalyser();
                    newAnalyser.fftSize = 2048;
                    analyserRef.current = newAnalyser;
                    log('AnalyserNode created.');

                    source.connect(newAnalyser);
                    newAnalyser.connect(newAudioContext.destination);
                    log('Audio nodes connected.');

                    log('Initializing Butterchurn visualizer...');
                    const visualizerInstance = butterchurn.createVisualizer(
                        newAudioContext,
                        canvasRef.current, // Renders to hidden canvas
                        { width: 1024, height: 1024 } // Fixed texture size
                    );
                    visualizerRef.current = visualizerInstance;
                    log('Butterchurn visualizer instance created.');

                    visualizerInstance.connectAudio(newAnalyser);
                    log('Butterchurn visualizer connected to AnalyserNode.');

                    log('Loading presets...');
                    const allPresets = butterchurnPresets.getPresets();
                    const keys = Object.keys(allPresets);
                    setPresets(allPresets);
                    setPresetKeys(keys);
                    log(`Loaded ${keys.length} presets.`);

                    if (keys.length > 0) {
                        const firstPresetKey = keys[0];
                        log(`Loading initial preset: ${firstPresetKey}`);
                        visualizerInstance.loadPreset(allPresets[firstPresetKey], 0.0);
                        setCurrentPresetKey(firstPresetKey);
                    } else {
                        log('No presets found.');
                        setErrorMessage('No presets found.');
                    }
                    // --- End Butterchurn/Audio Setup ---

                    // --- Start Three.js Setup ---
                    log('Setting up Three.js scene...');
                    const mountPoint = mountRef.current;
                    const width = mountPoint.clientWidth;
                    const height = mountPoint.clientHeight;

                    sceneRef.current = new THREE.Scene();
                    cameraRef.current = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
                    cameraRef.current.position.z = 5;

                    rendererRef.current = new THREE.WebGLRenderer({ antialias: true });
                    rendererRef.current.setSize(width, height);
                    mountPoint.appendChild(rendererRef.current.domElement); // Add visible canvas

                    textureRef.current = new THREE.CanvasTexture(canvasRef.current); // Use hidden canvas
                    textureRef.current.wrapS = THREE.RepeatWrapping; // Repeat horizontally
                    textureRef.current.wrapT = THREE.RepeatWrapping; // Repeat vertically
                    textureRef.current.minFilter = THREE.LinearFilter;
                    textureRef.current.magFilter = THREE.LinearFilter;

                    const geometry = new THREE.SphereGeometry(2, 64, 64); // Increased segments for smoother deformation
                    // Use ShaderMaterial instead of MeshBasicMaterial
                    const material = new THREE.ShaderMaterial({
                        uniforms: {
                            tDiffuse: { value: textureRef.current },
                            uAudioLevel: { value: 0.0 },
                            uTime: { value: 0.0 },
                            uBassLevel: { value: 0.0 },
                            uMidLevel: { value: 0.0 },
                            uTrebleLevel: { value: 0.0 },
                        },
                        vertexShader: vertexShader,
                        fragmentShader: fragmentShader,
                    });
                    sphereRef.current = new THREE.Mesh(geometry, material);
                    sceneRef.current.add(sphereRef.current);

                    // Store audio data array reference
                    const audioDataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                    log('Created audio data array');

                    log('Three.js setup complete.');
                    // --- End Three.js Setup ---

                    // 3d. Start Combined Rendering Loop
                    const smoothingFactor = 0.08; // Adjust: Lower = smoother/slower, Higher = more responsive

                    const renderCombinedFrame = () => {
                        const analyser = analyserRef.current;
                        const visualizer = visualizerRef.current;
                        const renderer = rendererRef.current;
                        const scene = sceneRef.current;
                        const camera = cameraRef.current;
                        const texture = textureRef.current;
                        const sphere = sphereRef.current;

                        if (analyser && visualizer && renderer && scene && camera && texture && sphere) {
                            try {
                                // 1. Get Audio Data
                                analyser.getByteFrequencyData(audioDataArray);
                                const dataLen = audioDataArray.length;
                                
                                // --- Calculate Frequency Band Levels ---
                                // Example ranges (adjust based on fftSize and sampleRate if known)
                                const bassEnd = Math.floor(dataLen * 0.15); // ~0-15% of bins
                                const midEnd = Math.floor(dataLen * 0.4);  // ~15-40% of bins
                                // Treble is the rest

                                let bassSum = 0;
                                for (let i = 0; i < bassEnd; i++) {
                                    bassSum += audioDataArray[i];
                                }
                                const bassAvg = bassEnd > 0 ? bassSum / bassEnd : 0;

                                let midSum = 0;
                                for (let i = bassEnd; i < midEnd; i++) {
                                    midSum += audioDataArray[i];
                                }
                                const midAvg = (midEnd - bassEnd) > 0 ? midSum / (midEnd - bassEnd) : 0;

                                let trebleSum = 0;
                                const trebleStart = midEnd;
                                for (let i = trebleStart; i < dataLen; i++) {
                                    trebleSum += audioDataArray[i];
                                }
                                const trebleAvg = (dataLen - trebleStart) > 0 ? trebleSum / (dataLen - trebleStart) : 0;

                                // Normalize raw levels 
                                const normBassRaw = bassAvg / 128.0;
                                const normMidRaw = midAvg / 128.0;
                                const normTrebleRaw = trebleAvg / 128.0;

                                // --- Apply Smoothing ---
                                smoothedBassRef.current += (normBassRaw - smoothedBassRef.current) * smoothingFactor;
                                smoothedMidRef.current += (normMidRaw - smoothedMidRef.current) * smoothingFactor;
                                smoothedTrebleRef.current += (normTrebleRaw - smoothedTrebleRef.current) * smoothingFactor;
                                
                                // Use smoothed values for uniforms
                                const smoothedBass = smoothedBassRef.current;
                                const smoothedMid = smoothedMidRef.current;
                                const smoothedTreble = smoothedTrebleRef.current;
                                const smoothedOverallLevel = (smoothedBass + smoothedMid + smoothedTreble) / 3.0;

                                // 2. Update Shader Uniforms with SMOOTHED values
                                if (sphere.material instanceof THREE.ShaderMaterial) {
                                    sphere.material.uniforms.uAudioLevel.value = smoothedOverallLevel; // Use smoothed average
                                    sphere.material.uniforms.uTime.value = clock.getElapsedTime();
                                    sphere.material.uniforms.uBassLevel.value = smoothedBass;
                                    sphere.material.uniforms.uMidLevel.value = smoothedMid;
                                    sphere.material.uniforms.uTrebleLevel.value = smoothedTreble;
                                }

                                // 3. Render Butterchurn
                                visualizer.render(); 

                                // 4. Update Texture
                                texture.needsUpdate = true; 

                                // 5. Render 3D Scene
                                renderer.render(scene, camera);

                            } catch (renderError) {
                                log(`Error during combined rendering: ${renderError.message}`);
                                setErrorMessage(`Render Error: ${renderError.message}`);
                                if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
                                animationFrameIdRef.current = null;
                                isInitializedRef.current = false; // Stop on error
                            }
                        }
                        if (animationFrameIdRef.current !== null) {
                            animationFrameIdRef.current = requestAnimationFrame(renderCombinedFrame);
                        }
                    };
                    log('Starting combined render loop...');
                    animationFrameIdRef.current = requestAnimationFrame(renderCombinedFrame);
                    log('Combined render loop started.');

                    // SET FLAG HERE: Only after ALL setup is complete and render loop started
                    isInitializedRef.current = true;
                    log('Initialization successful.');

                } catch (setupError) {
                    log(`Error during audio/visualizer/3D setup: ${setupError.message}\n${setupError.stack}`);
                    setErrorMessage(`Setup Error: ${setupError.message}`);
                    isInitializedRef.current = false; // Reset flag on error
                }
            };

            audioEl.onstalled = () => log('Audio stalled.');
            audioEl.onsuspend = () => log('Audio suspended.');
            log('Audio element listeners attached.');

        } catch (error) {
            log(`Fatal Error during initial setup steps (before onloadeddata): ${error.message}\n${error.stack}`);
            setErrorMessage(`Fatal Setup Error: ${error.message}`);
            isInitializedRef.current = false; // Reset flag on error
        }
    }
    , [log]); // Dependency: log

    // --- Effect 1: Check if refs are populated ---
    useEffect(() => {
        log('Ref checking effect: Checking refs...');
        if (mountRef.current && canvasRef.current) {
            log('Refs found! Setting refsReady state.');
            setRefsReady(true);
        } else {
            log(`Refs not ready yet in effect: mountRef=${!!mountRef.current}, canvasRef=${!!canvasRef.current}`);
        }
    }, []); // Run once after initial mount/paint

    // --- Effect 2: Initialize when refs are ready ---
    useEffect(() => {
        if (refsReady && !isInitializedRef.current) {
            log('Initialize effect: refsReady is true, calling initialize().');
            initialize();
        } else if (refsReady && isInitializedRef.current) {
            log('Initialize effect: refsReady is true, but initialization already done/in progress.');
        } else {
            log('Initialize effect: Waiting for refsReady...');
        }

        // --- Cleanup Function ---
        return () => {
            // Only cleanup if initialization actually started/completed
            if (isInitializedRef.current) {
                 log('Initialize effect cleanup. Cleaning up resources...');

            if (animationFrameIdRef.current) {
                cancelAnimationFrame(animationFrameIdRef.current);
                    animationFrameIdRef.current = null;
                    log('Stopped rendering loop.');
            }

                // Three.js Cleanup
                log('Cleaning up Three.js resources...');
                if (rendererRef.current) {
                    rendererRef.current.dispose();
                    if (mountRef.current && rendererRef.current.domElement) {
                        try { mountRef.current.removeChild(rendererRef.current.domElement); } catch (e) { /* ignore */ }
                    }
                    rendererRef.current = null;
                }
                 if (sceneRef.current) {
                     sceneRef.current.traverse(object => {
                         if (object.geometry) object.geometry.dispose();
                         if (object.material) {
                            if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
                            else object.material.dispose();
                         }
                         if (object.texture) object.texture.dispose();
                     });
                     sceneRef.current = null;
                 }
                 if (textureRef.current) { textureRef.current.dispose(); textureRef.current = null; }
                 sphereRef.current = null;
                 cameraRef.current = null;

                // Audio cleanup
                const audioEl = audioElRef.current;
                if (audioEl) {
                    log('Cleaning up audio element...');
                    audioEl.pause();
                    audioEl.onloadeddata = null;
                    audioEl.onerror = null;
                    audioEl.onstalled = null;
                    audioEl.onsuspend = null;
                    // How to remove listeners added with addEventListener requires storing them.
                    // Setting src to '' helps stop network activity.
                    audioEl.src = '';
                    audioElRef.current = null;
                }
                const audioContext = audioContextRef.current;
            if (audioContext) {
                    log('Closing AudioContext.');
                 if (audioContext.state !== 'closed') {
                        audioContext.close().catch(err => log(`Error closing AudioContext: ${err.message}`));
                 }
                    audioContextRef.current = null;
                }

                // Butterchurn cleanup
                visualizerRef.current = null; // Let GC handle Butterchurn instance
                analyserRef.current = null;

                // Reset the initialization flag *after* cleanup
                isInitializedRef.current = false;
                log('Initialize effect cleanup finished.');
            } else {
                log('Initialize effect cleanup: Skipping resource cleanup as initialization did not complete.');
            }
        };
    }, [refsReady, initialize]); // Dependencies: run when refsReady changes or initialize callback updates

    // --- Playback Control Functions ---
    const handlePlay = useCallback(async () => {
        const audioEl = audioElRef.current;
        const audioContext = audioContextRef.current;
        if (!audioEl || !audioContext || !isInitializedRef.current) {
            log('Cannot play: Audio/Context not ready or not initialized.');
            setErrorMessage('Audio not ready. Please wait or refresh.');
            return;
        }
        try {
            if (audioContext.state === 'suspended') {
                log('Resuming AudioContext...');
                await audioContext.resume();
                log('AudioContext resumed.');
            } else if (audioContext.state === 'closed') {
                log('Cannot play: AudioContext is closed.');
                setErrorMessage('Audio system closed. Please refresh.');
                 return;
            }
            if (audioEl.paused) {
                log('Attempting to play audio element...');
                await audioEl.play();
                log('Playback initiated via play().');
                setErrorMessage('');
            } else {
                log('Audio is already playing.');
            }
        } catch (error) {
            log(`Error during play command: ${error.message}`);
            setErrorMessage(`Play Error: ${error.message}`);
            if (audioEl) setIsPlaying(!audioEl.paused);
        }
    }, [log]);

    const handlePause = useCallback(() => {
        const audioEl = audioElRef.current;
        if (!audioEl || !isInitializedRef.current) {
            log('Cannot pause: Audio element not ready or not initialized.');
            return;
        }
        try {
            if (!audioEl.paused) {
                log('Attempting to pause audio element...');
                audioEl.pause();
                log('Pause command issued.');
            } else {
                log('Audio is already paused.');
            }
        } catch (error) {
            log(`Error during pause command: ${error.message}`);
            setErrorMessage(`Pause Error: ${error.message}`);
            if (audioEl) setIsPlaying(!audioEl.paused);
        }
    }, [log]);

    // --- Preset Control Function ---
    const handlePresetChange = useCallback((event) => {
        const newKey = event.target.value;
        const visualizer = visualizerRef.current;
        if (visualizer && presets[newKey] && isInitializedRef.current) {
            log(`Changing preset to: ${newKey}`);
            try {
                visualizer.loadPreset(presets[newKey], 2.0);
                setCurrentPresetKey(newKey);
                setErrorMessage('');
            } catch (error) {
                log(`Error loading preset ${newKey}: ${error.message}`);
                setErrorMessage(`Preset Error: ${error.message}`);
            }
        } else {
            const reason = !visualizer ? 'Visualizer not ready' : (!presets[newKey] ? 'Preset not found' : 'Not initialized');
            log(`Cannot change preset: ${reason}`);
            setErrorMessage(`Preset Error: ${reason}`);
        }
    }, [presets, log]);

    // --- Resize Handler ---
    useEffect(() => {
        const handleResize = () => {
            const mountPoint = mountRef.current;
            log(`Resize handler: mountRef.current is ${mountPoint ? 'assigned' : 'null'}`);
            if (!mountPoint || !rendererRef.current || !cameraRef.current || !isInitializedRef.current) return;

            const width = mountPoint.clientWidth;
            const height = mountPoint.clientHeight;
            log(`Resizing view to ${width}x${height}`);

            cameraRef.current.aspect = width / height;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(width, height);

            // Optional: Decide if Butterchurn texture needs resizing or stays fixed
            // visualizerRef.current?.setRendererSize(width, height);
            // log(`Resized Butterchurn renderer to ${width}x${height}`);
        };

        window.addEventListener('resize', handleResize);
        const timeoutId = setTimeout(handleResize, 100);

        return () => {
            clearTimeout(timeoutId);
            window.removeEventListener('resize', handleResize);
        };
    }, [log]);

    // --- Styles ---
    const containerStyle = {
        position: 'relative', width: '100vw', height: '100vh',
        backgroundColor: 'black', overflow: 'hidden', color: 'white',
    };
    const butterchurnCanvasStyle = { display: 'none' }; // Style for HIDDEN canvas
    const controlsStyle = {
        position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
        backgroundColor: 'rgba(0, 0, 0, 0.7)', padding: '10px 15px', borderRadius: '8px',
        display: 'flex', alignItems: 'center', gap: '15px', zIndex: 10,
    };
    const buttonStyle = { /* Same */ };
    const selectStyle = { /* Same */ };
    const errorStyle = {
        position: 'absolute', top: '10px', left: '10px', right: '10px',
        backgroundColor: 'rgba(255, 0, 0, 0.7)', color: 'white',
        padding: '10px', borderRadius: '5px', zIndex: 20, textAlign: 'center',
    };

    // Log mountRef value just before render
    log(`Rendering: mountRef.current is ${mountRef.current ? 'assigned' : 'null'}`);

    // --- JSX ---
    return (
        <div ref={mountRef} style={containerStyle}>
            {errorMessage && <div style={errorStyle}>{errorMessage}</div>}
            {/* Hidden canvas for Butterchurn rendering */}
            <canvas ref={canvasRef} style={butterchurnCanvasStyle} />

            {/* Controls remain overlaid */}
            <div style={controlsStyle}>
                 <button
                     onClick={handlePlay}
                     style={buttonStyle}
                     disabled={!refsReady || !isInitializedRef.current || isPlaying}
                     title={!refsReady || !isInitializedRef.current ? "Initializing..." : (isPlaying ? "Playing" : "Play")}
                 >
                     Play
                 </button>
                 <button
                     onClick={handlePause}
                     style={buttonStyle}
                     disabled={!refsReady || !isInitializedRef.current || !isPlaying}
                     title={!refsReady || !isInitializedRef.current ? "Initializing..." : (!isPlaying ? "Paused" : "Pause")}
                 >
                     Pause
                 </button>
                 <select
                     value={currentPresetKey}
                     onChange={handlePresetChange}
                     style={selectStyle}
                     disabled={!refsReady || !isInitializedRef.current || presetKeys.length === 0}
                     title={!refsReady || !isInitializedRef.current ? "Initializing..." : "Select Preset"}
                 >
                     {!refsReady || !isInitializedRef.current || presetKeys.length === 0 ? (
                         <option>Loading...</option>
                     ) : (
                         presetKeys.map(key => (
                             <option key={key} value={key}>
                                 {key.length > 40 ? key.substring(0, 37) + '...' : key}
                             </option>
                         ))
                     )}
                 </select>
            </div>
        </div>
    );
};

export default ButterchurnVisualizer;
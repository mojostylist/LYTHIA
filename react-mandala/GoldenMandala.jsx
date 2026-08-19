import React, { useRef, useEffect, useState, useCallback } from 'react';

// VERTEX SHADER - Maps a full-screen quad and flips Y axis for texture coordinate alignment
const VS_SOURCE = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    v_texCoord = vec2(a_position.x * 0.5 + 0.5, 0.5 - a_position.y * 0.5);
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// FRAGMENT SHADER - Calculates refractive water ripples and adds a dynamic aqua water glow
const FS_SOURCE = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform vec3 u_rippleColor;

  #define MAX_RIPPLES 32
  uniform vec2 u_rippleCenters[MAX_RIPPLES];
  uniform float u_rippleRadii[MAX_RIPPLES];
  uniform float u_rippleStrengths[MAX_RIPPLES];
  uniform float u_rippleTimes[MAX_RIPPLES];
  uniform int u_numRipples;

  void main() {
    vec2 uv = v_texCoord;
    vec2 displacement = vec2(0.0);
    float aspect = u_resolution.x / u_resolution.y;
    
    for (int i = 0; i < MAX_RIPPLES; i++) {
      if (i >= u_numRipples) break;
      
      vec2 center = u_rippleCenters[i];
      float radius = u_rippleRadii[i];
      float strength = u_rippleStrengths[i];
      float age = u_rippleTimes[i];
      
      // Correct for aspect ratio to keep ripples circular
      vec2 diff = uv - center;
      diff.x *= aspect;
      
      float dist = length(diff);
      
      if (dist < radius) {
        float progress = radius - dist;
        float width = 0.18; // Width of the wave packet
        
        if (progress < width) {
          // Envelope shape to fade out at wave limits
          float envelope = sin((progress / width) * 3.14159265);
          // High-frequency oscillating wave pattern
          float wave = sin((progress / 0.025) - age * 15.0);
          
          vec2 dir = normalize(diff);
          if (dist == 0.0) dir = vec2(1.0, 0.0);
          
          // Decay based on age (fade out) and distance from epicenter
          float decay = strength * envelope * (1.0 - age) * (1.0 - dist * 1.5);
          decay = max(0.0, decay);
          
          displacement += dir * wave * decay * 0.03;
        }
      }
    }
    
    vec2 distortedUv = uv - displacement;
    distortedUv = clamp(distortedUv, 0.001, 0.999);
    
    vec4 baseColor = texture2D(u_texture, distortedUv);
    
    // Add subtle color-reactive glow shift proportional to ripple displacement
    float shift = length(displacement);
    if (shift > 0.0) {
      baseColor.rgb = mix(baseColor.rgb, baseColor.rgb + u_rippleColor * shift * 2.8, min(1.0, shift * 22.0));
    }
    
    gl_FragColor = baseColor;
  }
`;

const createShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
};

const createProgram = (gl, vsSource, fsSource) => {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
};

/**
 * GoldenMandala - An interactive, animated golden sacred geometry mandala component
 * utilizing WebGL shader textures for realistic liquid water ripples and 3D pointer tilts.
 */
const GoldenMandala = () => {
  const canvasRef = useRef(null);
  const offscreenCanvasRef = useRef(null);
  
  // Customization State
  const [mandalaType, setMandalaType] = useState('metatron'); // 'metatron', 'seedOfLife', 'starGlow'
  const [colorTheme, setColorTheme] = useState('solarGold'); // 'solarGold', 'aquaResonance', 'cosmicIndigo'
  const [rotationSpeed, setRotationSpeed] = useState(1); // 0 to 3 multiplier
  const [lastNonZeroSpeed, setLastNonZeroSpeed] = useState(1); // Keep track of speed before pausing
  const [glowIntensity, setGlowIntensity] = useState(1.5); // 0.5 to 3
  const [interactionMode, setInteractionMode] = useState('both'); // 'gravity', 'particles', 'both', 'none'
  const [showControls, setShowControls] = useState(true);
  
  // Snapshots State
  const [snapshots, setSnapshots] = useState([]);
  const [previewImage, setPreviewImage] = useState(null);

  // History Log State
  const [historyLog, setHistoryLog] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const isInitialMount = useRef(true);
  const lastStateRef = useRef({ colorTheme: 'solarGold', rotationSpeed: 1 });

  // Browser tactile haptic vibration feedback helper
  const triggerHaptic = useCallback((pattern) => {
    if (typeof window !== 'undefined' && window.navigator && typeof window.navigator.vibrate === 'function') {
      try {
        window.navigator.vibrate(pattern);
      } catch (e) {
        console.warn('Vibration feedback failed:', e);
      }
    }
  }, []);

  // Microphone / Web Audio State
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const voiceAmplitudeRef = useRef(0);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const voicePeakDebounceRef = useRef(0);

  // Speech Transcription / AI Companion State & Refs
  const [liveTranscription, setLiveTranscription] = useState('');
  const recognitionRef = useRef(null);
  const isMicEnabledRef = useRef(false);
  const textRipplesRef = useRef([]);

  // Ambient Soundscape State & Refs
  const [isSoundscapeEnabled, setIsSoundscapeEnabled] = useState(false);
  const soundscapeContextRef = useRef(null);
  const soundscapeNodesRef = useRef(null);

  // Interactive Live State
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0, isHovering: false });
  const ripplesRef = useRef([]); // Active WebGL ripples
  const particlesRef = useRef([]); // Active spark particle objects
  const orbitingMotesRef = useRef([]); // Active orbiting motes
  const lastMousePosRef = useRef({ x: 0, y: 0, time: 0 });

  // Load Saved Snapshots on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('lithia_mandala_snapshots');
      if (stored) {
        setSnapshots(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error reading snapshots from localStorage:', e);
    }
  }, []);

  // Load Saved History Log on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('lithia_mandala_history');
      if (stored) {
        setHistoryLog(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error reading history from localStorage:', e);
    }
  }, []);

  // Track state changes and record history of configurations
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastStateRef.current = { colorTheme, rotationSpeed };
      return;
    }

    const prevTheme = lastStateRef.current.colorTheme;
    const prevSpeed = lastStateRef.current.rotationSpeed;

    // Log the configuration we are transitioning away from if theme or speed has changed
    if (colorTheme !== prevTheme || rotationSpeed !== prevSpeed) {
      const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const entry = {
        id: `hist_${Date.now()}`,
        colorTheme: prevTheme,
        rotationSpeed: prevSpeed,
        timestamp
      };

      setHistoryLog(prev => {
        // Prevent duplicate consecutive entries to keep history clean
        if (prev.length > 0 && prev[0].colorTheme === entry.colorTheme && prev[0].rotationSpeed === entry.rotationSpeed) {
          return prev;
        }
        const updated = [entry, ...prev].slice(0, 25); // Keep last 25 states
        try {
          localStorage.setItem('lithia_mandala_history', JSON.stringify(updated));
        } catch (e) {
          console.error('Failed to save history to localStorage:', e);
        }
        return updated;
      });

      // Update ref to current state
      lastStateRef.current = { colorTheme, rotationSpeed };
    }
  }, [colorTheme, rotationSpeed]);

  // Revert to a past configuration
  const revertToHistory = (entry) => {
    if (!entry) return;
    triggerHaptic(20);
    setColorTheme(entry.colorTheme);
    setRotationSpeed(entry.rotationSpeed);
    if (entry.rotationSpeed > 0) {
      setLastNonZeroSpeed(entry.rotationSpeed);
    }
    // Update ref so that reverting itself is marked as our starting point for subsequent transitions
    lastStateRef.current = { colorTheme: entry.colorTheme, rotationSpeed: entry.rotationSpeed };
  };

  // Clear configuration history log
  const clearHistory = () => {
    triggerHaptic([30, 80, 30]); // Warning vib
    if (!confirm('Are you sure you want to clear your configurations history?')) return;
    setHistoryLog([]);
    try {
      localStorage.removeItem('lithia_mandala_history');
    } catch (e) {
      console.error('Failed to clear history from localStorage:', e);
    }
  };

  // Set up Speech Recognition for transcription text ripples and live companion overlay
  useEffect(() => {
    isMicEnabledRef.current = isMicEnabled;
    
    if (isMicEnabled) {
      setLiveTranscription('LISTENING FOR GEOMETRIC SOUNDS...');
      const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognitionClass) {
        console.warn("Speech Recognition not supported in this browser.");
        setLiveTranscription('TRANSCRIPTION UNSUPPORTED');
        return;
      }
      
      const rec = new SpeechRecognitionClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      
      let lastSpokenText = '';
      
      rec.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        const currentText = (finalTranscript || interimTranscript).trim();
        if (currentText) {
          setLiveTranscription(currentText);
          
          if (currentText !== lastSpokenText) {
            let newText = '';
            if (currentText.toLowerCase().startsWith(lastSpokenText.toLowerCase())) {
              newText = currentText.substring(lastSpokenText.length).trim();
            } else {
              newText = currentText;
            }
            
            if (newText.length > 0) {
              // Split longer transcript inputs to flow as distinct poetic bubbles
              const words = newText.split(/\s+/);
              if (words.length > 4) {
                for (let w = 0; w < words.length; w += 3) {
                  const chunk = words.slice(w, w + 3).join(' ');
                  if (chunk) {
                    setTimeout(() => {
                      if (isMicEnabledRef.current) addTextRipple(chunk);
                    }, w * 180);
                  }
                }
              } else {
                addTextRipple(newText);
              }
            }
            lastSpokenText = currentText;
          }
        }
      };
      
      rec.onend = () => {
        if (isMicEnabledRef.current) {
          try {
            rec.start();
          } catch (e) {
            console.error("Speech recognition restart error:", e);
          }
        }
      };
      
      rec.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          isMicEnabledRef.current = false;
          setIsMicEnabled(false);
          setLiveTranscription('MIC ACCESS DENIED');
        }
      };
      
      recognitionRef.current = rec;
      try {
        rec.start();
      } catch (err) {
        console.error("Speech recognition start failed:", err);
      }
    } else {
      setLiveTranscription('');
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
        recognitionRef.current = null;
      }
    }
    
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
    };
  }, [isMicEnabled, addTextRipple]);

  // Capture current state of the mandala
  const captureSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      // Create a temporary canvas to resize and compress the WebGL render
      const tempCanvas = document.createElement('canvas');
      const targetWidth = 600;
      const aspectRatio = canvas.height / canvas.width;
      tempCanvas.width = targetWidth;
      tempCanvas.height = Math.round(targetWidth * aspectRatio);
      
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(canvas, 0, 0, tempCanvas.width, tempCanvas.height);
      
      const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.85);

      const timestamp = new Date().toISOString();
      const dateString = new Date().toLocaleString();
      const themeNames = { 
        solarGold: 'Solar', 
        aquaResonance: 'Resonance', 
        cosmicIndigo: 'Cosmic', 
        emeraldForest: 'Emerald' 
      };
      const themeLabel = themeNames[colorTheme] || 'Solar';
      const geometryLabel = mandalaType === 'metatron' ? "Metatron" : mandalaType === 'seedOfLife' ? "Flower" : "Star";
      const defaultName = `${geometryLabel} (${themeLabel})`;
      
      const promptName = prompt("Enter a name for this Mandala snapshot:", defaultName);
      if (promptName === null) return; // cancelled

      const name = promptName.trim() || defaultName;

      const newSnapshot = {
        id: `snap_${Date.now()}`,
        name,
        image: dataUrl,
        timestamp,
        dateString,
        settings: {
          mandalaType,
          colorTheme,
          rotationSpeed,
          glowIntensity,
          interactionMode
        }
      };

      const updatedSnapshots = [newSnapshot, ...snapshots];
      setSnapshots(updatedSnapshots);
      localStorage.setItem('lithia_mandala_snapshots', JSON.stringify(updatedSnapshots));
      triggerHaptic([15, 45, 15]); // Camera shutter shutter vibration
    } catch (err) {
      console.error('Failed to capture and save mandala snapshot:', err);
      alert('Could not capture image. Please try again.');
    }
  };

  // Load snapshot settings
  const loadSnapshot = (snap) => {
    if (!snap || !snap.settings) return;
    triggerHaptic(20); // Settings change vibration
    const { settings } = snap;
    if (settings.mandalaType) setMandalaType(settings.settingsMandalaType || settings.mandalaType);
    if (settings.colorTheme) setColorTheme(settings.colorTheme);
    if (settings.rotationSpeed !== undefined) setRotationSpeed(settings.rotationSpeed);
    if (settings.glowIntensity !== undefined) setGlowIntensity(settings.glowIntensity);
    if (settings.interactionMode) setInteractionMode(settings.interactionMode);
  };

  // Delete saved snapshot
  const deleteSnapshot = (id) => {
    triggerHaptic([30, 80, 30]); // Warning vib
    if (!confirm('Are you sure you want to delete this snapshot?')) return;
    const updated = snapshots.filter(s => s.id !== id);
    setSnapshots(updated);
    localStorage.setItem('lithia_mandala_snapshots', JSON.stringify(updated));
  };

  // Toggle mandala rotation play/pause
  const handleTogglePlayPause = () => {
    if (rotationSpeed > 0) {
      setLastNonZeroSpeed(rotationSpeed);
      setRotationSpeed(0);
    } else {
      setRotationSpeed(lastNonZeroSpeed || 1.0);
    }
  };

  // Web Audio Microphone Integration Callback
  const toggleMicrophone = async () => {
    if (isMicEnabled) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      streamRef.current = null;
      audioContextRef.current = null;
      analyserRef.current = null;
      voiceAmplitudeRef.current = 0;
      setIsMicEnabled(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContextClass();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);
        
        streamRef.current = stream;
        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
        setIsMicEnabled(true);
      } catch (err) {
        console.error('Microphone access denied or error:', err);
        alert('Could not access microphone. Please ensure microphone permissions are granted.');
      }
    }
  };

  // Get ambient frequencies for the themes
  const getChordFrequencies = (theme) => {
    switch (theme) {
      case 'solarGold':
        // Warm gold frequencies: A2 (110Hz), E3 (164.8Hz), A3 (220Hz), C#4 (277.18Hz)
        return [110.00, 164.81, 220.00, 277.18];
      case 'cosmicIndigo':
        // Cosmic Indigo: Deep space minor 7th chord (C2, G2, Eb3, Bb3)
        return [65.41, 98.00, 155.56, 233.08];
      case 'emeraldForest':
        // Emerald Forest: Beautiful open F Major 7th chord (F2, C3, F3, A3)
        return [87.31, 130.81, 174.61, 220.00];
      case 'aquaResonance':
      default:
        // Aqua Resonance: Shimmering water notes (G2, D3, G3, B3)
        return [98.00, 146.83, 196.00, 246.94];
    }
  };

  // Start soundscape ambient engine
  const startSoundscape = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContextClass();
      soundscapeContextRef.current = ctx;

      // Main gain control
      const mainGain = ctx.createGain();
      mainGain.gain.setValueAtTime(0, ctx.currentTime);
      mainGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 1.5); // Smooth fade in

      // Resonant biquad filter
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 5.0;
      filter.frequency.setValueAtTime(320, ctx.currentTime);

      filter.connect(mainGain);
      mainGain.connect(ctx.destination);

      // Create chord oscillators
      const freqs = getChordFrequencies(colorTheme);
      const oscillators = freqs.map((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = i === 0 ? 'sine' : 'triangle'; // warm sine bottom, gentle triangle top
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        const oscGain = ctx.createGain();
        const baseVolume = i === 0 ? 0.28 : 0.12; // blend levels
        oscGain.gain.setValueAtTime(baseVolume, ctx.currentTime);

        osc.connect(oscGain);
        oscGain.connect(filter);
        osc.start();

        return { osc, oscGain };
      });

      soundscapeNodesRef.current = {
        mainGain,
        filter,
        oscillators
      };

      // Set initial resonance configurations
      updateSoundscapeHarmonics(colorTheme);
    } catch (err) {
      console.error('Failed to start soundscape audio:', err);
    }
  };

  // Smoothly update soundscape resonance based on the selected theme
  const updateSoundscapeHarmonics = (theme) => {
    const nodes = soundscapeNodesRef.current;
    const ctx = soundscapeContextRef.current;
    if (!nodes || !ctx || ctx.state === 'closed') return;

    const freqs = getChordFrequencies(theme);
    const now = ctx.currentTime;

    // Smoothly glide frequencies
    nodes.oscillators.forEach((oscObj, i) => {
      if (oscObj && oscObj.osc && freqs[i]) {
        oscObj.osc.frequency.cancelScheduledValues(now);
        oscObj.osc.frequency.setValueAtTime(oscObj.osc.frequency.value, now);
        oscObj.osc.frequency.exponentialRampToValueAtTime(freqs[i], now + 1.2);
      }
    });

    // Adapt the filters to project the palette's sonic vibe
    nodes.filter.frequency.cancelScheduledValues(now);
    nodes.filter.frequency.setValueAtTime(nodes.filter.frequency.value, now);
    nodes.filter.Q.cancelScheduledValues(now);
    nodes.filter.Q.setValueAtTime(nodes.filter.Q.value, now);

    switch (theme) {
      case 'solarGold':
        nodes.filter.type = 'lowpass';
        nodes.filter.frequency.exponentialRampToValueAtTime(450, now + 1.2);
        nodes.filter.Q.exponentialRampToValueAtTime(4.0, now + 1.2);
        break;
      case 'cosmicIndigo':
        nodes.filter.type = 'peaking';
        nodes.filter.frequency.exponentialRampToValueAtTime(180, now + 1.2);
        nodes.filter.Q.exponentialRampToValueAtTime(8.0, now + 1.2);
        break;
      case 'emeraldForest':
        nodes.filter.type = 'bandpass';
        nodes.filter.frequency.exponentialRampToValueAtTime(500, now + 1.2);
        nodes.filter.Q.exponentialRampToValueAtTime(3.5, now + 1.2);
        break;
      case 'aquaResonance':
      default:
        nodes.filter.type = 'lowpass';
        nodes.filter.frequency.exponentialRampToValueAtTime(320, now + 1.2);
        nodes.filter.Q.exponentialRampToValueAtTime(6.0, now + 1.2);
        break;
    }
  };

  // Stop soundscape smoothly
  const stopSoundscape = () => {
    const nodes = soundscapeNodesRef.current;
    const ctx = soundscapeContextRef.current;

    if (nodes && nodes.mainGain && ctx) {
      try {
        const now = ctx.currentTime;
        nodes.mainGain.gain.cancelScheduledValues(now);
        nodes.mainGain.gain.setValueAtTime(nodes.mainGain.gain.value, now);
        nodes.mainGain.gain.linearRampToValueAtTime(0, now + 0.5);

        setTimeout(() => {
          try {
            if (nodes.oscillators) {
              nodes.oscillators.forEach(oscObj => {
                if (oscObj && oscObj.osc) oscObj.osc.stop();
              });
            }
            if (ctx && ctx.state !== 'closed') {
              ctx.close();
            }
          } catch (e) {
            console.error('Error closing soundscape nodes on deactivate:', e);
          }
          soundscapeNodesRef.current = null;
          soundscapeContextRef.current = null;
        }, 600);
      } catch (err) {
        console.error('Error during soundscape shutdown:', err);
      }
    }
  };

  // Trigger Soundscape state-effect
  useEffect(() => {
    if (isSoundscapeEnabled) {
      startSoundscape();
    } else {
      stopSoundscape();
    }
  }, [isSoundscapeEnabled]);

  // Handle color palette shifts dynamically on active soundscape
  useEffect(() => {
    if (isSoundscapeEnabled) {
      updateSoundscapeHarmonics(colorTheme);
    }
  }, [colorTheme]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      // Clean up Soundscape context
      if (soundscapeContextRef.current && soundscapeContextRef.current.state !== 'closed') {
        try {
          if (soundscapeNodesRef.current && soundscapeNodesRef.current.oscillators) {
            soundscapeNodesRef.current.oscillators.forEach(o => {
              if (o && o.osc) o.osc.stop();
            });
          }
          soundscapeContextRef.current.close();
        } catch (e) {
          console.error('Error cleaning up soundscape on unmount:', e);
        }
      }
    };
  }, []);

  // Theme Constants
  const themes = {
    solarGold: {
      primary: '#FFD700',      // Golden
      secondary: '#DAA520',    // Goldenrod
      accent: '#FFFFFF',       // White Core
      ripple: '#00F0FF',       // Aqua Ripple Accent
      background: 'radial-gradient(circle at center, #140d02 0%, #050401 100%)',
      glowColor: 'rgba(218, 165, 32, 0.4)'
    },
    aquaResonance: {
      primary: '#00F0FF',      // Electric Cyan
      secondary: '#008B8B',    // Dark Cyan
      accent: '#FFD700',       // Gold Core Accent
      ripple: '#FFD700',       // Gold Ripple
      background: 'radial-gradient(circle at center, #021217 0%, #000405 100%)',
      glowColor: 'rgba(0, 240, 255, 0.35)'
    },
    cosmicIndigo: {
      primary: '#BD93F9',      // Royal Purple
      secondary: '#6272A4',    // Indigo Slate
      accent: '#50FA7B',       // Cosmic Green Spark
      ripple: '#FF79C6',       // Hot Pink Ripple
      background: 'radial-gradient(circle at center, #0B0717 0%, #010003 100%)',
      glowColor: 'rgba(189, 147, 249, 0.3)'
    },
    emeraldForest: {
      primary: '#10B981',      // Emerald Green
      secondary: '#047857',    // Deep Emerald/Forest
      accent: '#FBBF24',       // Amber/Gold Core
      ripple: '#34D399',       // Mint Ripple
      background: 'radial-gradient(circle at center, #01140e 0%, #000403 100%)',
      glowColor: 'rgba(16, 185, 129, 0.35)'
    }
  };

  const currentTheme = themes[colorTheme] || themes.solarGold;

  // Add ripple helper
  const addRipple = useCallback((x, y, strengthMultiplier = 1.0) => {
    if (ripplesRef.current.length >= 32) {
      ripplesRef.current.shift(); // Remove the oldest active ripple to keep it bounded
    }
    ripplesRef.current.push({
      x,
      y,
      time: 0.0,
      speed: 0.9 + Math.random() * 0.4,
      strength: 0.16 * strengthMultiplier
    });
  }, []);

  // Add floating translucent text ripple helper
  const addTextRipple = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    
    // Spawn at random angle
    const angle = Math.random() * Math.PI * 2;
    // Set start distance slightly outside core but within inner rings
    const startDist = 70 + Math.random() * 90;
    
    // Select color based on current theme to harmonize beautifully
    const colors = [currentTheme.primary, currentTheme.accent, '#FFFFFF'];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];
    
    textRipplesRef.current.push({
      id: `text_rip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      text: trimmed.toUpperCase(), // uppercase for elegant, sacred geometric aesthetic
      angle,
      distance: startDist,
      speed: 0.7 + Math.random() * 0.9,
      spin: (Math.random() - 0.5) * 0.006, // slow drift rotation
      alpha: 0.0,
      scale: 0.7,
      color: chosenColor,
      size: 12 + Math.floor(Math.random() * 8), // 12px to 20px
      life: 0.0, // progress 0.0 to 1.0
      decay: 0.0035 + Math.random() * 0.003 // elegant lifespan
    });
    
    // Also trigger a gentle physical WebGL water ripple at that spot!
    const canvas = canvasRef.current;
    if (canvas) {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const centerX = width / 2;
      const centerY = height / 2;
      
      const rx = centerX + Math.cos(angle) * startDist;
      const ry = centerY + Math.sin(angle) * startDist;
      
      // Calculate normalized coordinates for shader (0.0 to 1.0)
      addRipple(rx / width, ry / height, 0.45);
    }
  }, [currentTheme, addRipple]);

  // Track Mouse Movement and Emit Fluid Trail Ripples
  const handleMouseMove = useCallback((e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Track targets for 3D Tilt Effect
    const mouseX = e.clientX - rect.left - rect.width / 2;
    const mouseY = e.clientY - rect.top - rect.height / 2;
    mouseRef.current.targetX = mouseX;
    mouseRef.current.targetY = mouseY;
    mouseRef.current.isHovering = true;

    // Spawn trail ripples if we have moved enough
    const lastPos = lastMousePosRef.current;
    const dist = Math.hypot(x - lastPos.x, y - lastPos.y);
    const now = Date.now();

    if (dist > 0.035 && (now - lastPos.time > 50)) {
      if (interactionMode === 'both' || interactionMode === 'particles') {
        addRipple(x, y, 0.45); // Gentle ripple wake

        // Add small trail spark particles
        const particleCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < particleCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.5 + Math.random() * 1.5;
          particlesRef.current.push({
            x: mouseX,
            y: mouseY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 1 + Math.random() * 2,
            color: Math.random() > 0.4 ? currentTheme.primary : currentTheme.accent,
            alpha: 0.8,
            decay: 0.02 + Math.random() * 0.02,
            spin: (Math.random() - 0.5) * 0.02
          });
        }
      }
      lastMousePosRef.current = { x, y, time: now };
    }
  }, [interactionMode, currentTheme, addRipple]);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current.targetX = 0;
    mouseRef.current.targetY = 0;
    mouseRef.current.isHovering = false;
  }, []);

  // Click Canvas to Trigger Wave Ripples and Star Burst Sparks
  const handleCanvasClick = useCallback((e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    triggerHaptic(15); // Light tap vibe on mouse click

    if (interactionMode === 'particles' || interactionMode === 'both') {
      // Add strong physical WebGL ripple
      addRipple(x, y, 1.25);

      // Add major Golden Spark Particles
      const clickX = e.clientX - rect.left - rect.width / 2;
      const clickY = e.clientY - rect.top - rect.height / 2;
      const particleCount = 24 + Math.floor(Math.random() * 16);
      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.5;
        particlesRef.current.push({
          x: clickX,
          y: clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1 + Math.random() * 3,
          color: Math.random() > 0.3 ? currentTheme.primary : currentTheme.accent,
          alpha: 1.0,
          decay: 0.012 + Math.random() * 0.015,
          spin: (Math.random() - 0.5) * 0.05
        });
      }
    }
  }, [interactionMode, currentTheme, addRipple, triggerHaptic]);

  // Handle Mobile Touch Start
  const handleTouchStart = useCallback((e) => {
    if (!canvasRef.current || e.touches.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;

    triggerHaptic(20); // Tactile tap vibration

    if (interactionMode === 'particles' || interactionMode === 'both') {
      addRipple(x, y, 1.25);

      const clickX = touch.clientX - rect.left - rect.width / 2;
      const clickY = touch.clientY - rect.top - rect.height / 2;
      const particleCount = 20 + Math.floor(Math.random() * 15);
      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 4.0;
        particlesRef.current.push({
          x: clickX,
          y: clickY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1 + Math.random() * 2.5,
          color: Math.random() > 0.3 ? currentTheme.primary : currentTheme.accent,
          alpha: 1.0,
          decay: 0.012 + Math.random() * 0.018,
          spin: (Math.random() - 0.5) * 0.05
        });
      }
    }
  }, [interactionMode, currentTheme, addRipple, triggerHaptic]);

  // Handle Mobile Touch Move
  const handleTouchMove = useCallback((e) => {
    if (!canvasRef.current || e.touches.length === 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const x = (touch.clientX - rect.left) / rect.width;
    const y = (touch.clientY - rect.top) / rect.height;

    const mouseX = touch.clientX - rect.left - rect.width / 2;
    const mouseY = touch.clientY - rect.top - rect.height / 2;
    mouseRef.current.targetX = mouseX;
    mouseRef.current.targetY = mouseY;
    mouseRef.current.isHovering = true;

    const lastPos = lastMousePosRef.current;
    const dist = Math.hypot(x - lastPos.x, y - lastPos.y);
    const now = Date.now();

    if (dist > 0.035 && (now - lastPos.time > 50)) {
      triggerHaptic(8); // Ultra-light drag trail feedback

      if (interactionMode === 'both' || interactionMode === 'particles') {
        addRipple(x, y, 0.45);

        const particleCount = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < particleCount; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.5 + Math.random() * 1.5;
          particlesRef.current.push({
            x: mouseX,
            y: mouseY,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: 1 + Math.random() * 2,
            color: Math.random() > 0.4 ? currentTheme.primary : currentTheme.accent,
            alpha: 0.8,
            decay: 0.02 + Math.random() * 0.02,
            spin: (Math.random() - 0.5) * 0.02
          });
        }
      }
      lastMousePosRef.current = { x, y, time: now };
    }
  }, [interactionMode, currentTheme, addRipple, triggerHaptic]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Initialize WebGL context
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true }) || canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true });
    if (!gl) {
      console.error('WebGL not supported on this platform');
      return;
    }

    // Create memory-resident offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreenCanvasRef.current = offscreen;
    const oCtx = offscreen.getContext('2d');

    // Create shader program
    const program = createProgram(gl, VS_SOURCE, FS_SOURCE);
    if (!program) return;
    gl.useProgram(program);

    // Geometry position Buffer (Full-screen quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]), gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Create texture buffer for offscreen canvas uploading
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    // Uniform mappings
    const resolutionLoc = gl.getUniformLocation(program, 'u_resolution');
    const numRipplesLoc = gl.getUniformLocation(program, 'u_numRipples');
    const rippleCentersLoc = gl.getUniformLocation(program, 'u_rippleCenters');
    const rippleRadiiLoc = gl.getUniformLocation(program, 'u_rippleRadii');
    const rippleStrengthsLoc = gl.getUniformLocation(program, 'u_rippleStrengths');
    const rippleTimesLoc = gl.getUniformLocation(program, 'u_rippleTimes');
    const rippleColorLoc = gl.getUniformLocation(program, 'u_rippleColor');

    let animationFrameId;
    let time = 0;
    let breathingPhase = 0;

    // Handle High DPI displays
    const resizeCanvas = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);

      offscreen.width = width * dpr;
      offscreen.height = height * dpr;
      oCtx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
      oCtx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // DRAWING HELPERS FOR 2D OFFSCREEN CANVAS (Modulated dynamically by voice input)
    let dynamicGlow = glowIntensity;
    
    const drawGlowRing = (x, y, radius, strokeColor, shadowColor, width = 1) => {
      oCtx.save();
      oCtx.beginPath();
      oCtx.arc(x, y, radius, 0, Math.PI * 2);
      oCtx.strokeStyle = strokeColor;
      oCtx.lineWidth = width;
      oCtx.shadowBlur = 10 * dynamicGlow;
      oCtx.shadowColor = shadowColor;
      oCtx.stroke();
      oCtx.restore();
    };

    const drawLine = (x1, y1, x2, y2, color, width = 1, alpha = 1) => {
      oCtx.beginPath();
      oCtx.moveTo(x1, y1);
      oCtx.lineTo(x2, y2);
      oCtx.strokeStyle = color;
      oCtx.globalAlpha = alpha;
      oCtx.lineWidth = width;
      oCtx.stroke();
      oCtx.globalAlpha = 1.0;
    };

    // Main Rendering Loop
    const draw = () => {
      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const centerX = width / 2;
      const centerY = height / 2;

      // Extract real-time Web Audio API Microphone Voice Amplitude
      let voiceAmp = 0;
      if (analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        voiceAmp = avg / 255; // Normalize 0.0 to 1.0
        
        // Dynamic temporal smoothing (lerp)
        voiceAmplitudeRef.current += (voiceAmp - voiceAmplitudeRef.current) * 0.25;
      } else {
        voiceAmplitudeRef.current += (0 - voiceAmplitudeRef.current) * 0.15;
      }
      const currentVoiceAmp = voiceAmplitudeRef.current;

      // Derive audio-reactive physical scales, rotation velocities, and glowing matrices
      const voiceScaleFactor = 1.0 + currentVoiceAmp * 0.55;
      
      // Update breathing phase smoothly based on voice input
      // Soft breathing rate during silence, synchronizing and speeding up during vocal intensity
      const baseBreathingSpeed = 0.015;
      const activeBreathingSpeed = baseBreathingSpeed * (1.0 + currentVoiceAmp * 3.5);
      breathingPhase += activeBreathingSpeed;

      // Slow periodic breathing cycle (sine wave oscillation)
      const breathingCycle = Math.sin(breathingPhase);

      // Breathing depth/amplitude softening during silence and expanding with audio gain
      const breathingDepth = 0.02 + currentVoiceAmp * 0.15; // base 2% subtle variation up to 17%

      // Global breathing scale modifier
      const breathingScaleFactor = 1.0 + breathingCycle * breathingDepth;

      // Apply breathing factor to dynamic glow and scale
      const breathingGlowFactor = 1.0 + breathingCycle * (breathingDepth * 0.7);
      dynamicGlow = glowIntensity * (1.0 + currentVoiceAmp * 1.8) * breathingGlowFactor;
      
      const dynamicRotationSpeed = rotationSpeed * (1.0 + currentVoiceAmp * 3.5);

      time += 0.005 * dynamicRotationSpeed;

      // Clear offscreen 2D context with faint trail to maintain glow fields
      oCtx.fillStyle = 'rgba(5, 4, 3, 0.15)';
      oCtx.fillRect(0, 0, width, height);

      // Smooth Mouse Interpolation (Ease to Target)
      const mouse = mouseRef.current;
      mouse.x += (mouse.targetX - mouse.x) * 0.08;
      mouse.y += (mouse.targetY - mouse.y) * 0.08;

      oCtx.save();
      
      // Apply Centering and 3D Tilt Effect to Offscreen render
      oCtx.translate(centerX, centerY);
      if (interactionMode === 'gravity' || interactionMode === 'both') {
        const tiltX = mouse.x * 0.0015;
        const tiltY = mouse.y * 0.0015;
        oCtx.transform(1, tiltY, tiltX, 1, mouse.x * 0.15, mouse.y * 0.15);
      }

      // 1. Draw Star / Ray Field Background Layer
      oCtx.save();
      oCtx.globalCompositeOperation = 'lighter';
      const numRays = 24;
      for (let i = 0; i < numRays; i++) {
        const angle = (i * Math.PI * 2) / numRays + time * 0.1;
        const opacity = (Math.sin(time * 2 + i) + 1) * 0.12 * dynamicGlow;
        oCtx.beginPath();
        oCtx.moveTo(0, 0);
        oCtx.lineTo(Math.cos(angle) * Math.max(width, height) * 0.8, Math.sin(angle) * Math.max(width, height) * 0.8);
        oCtx.strokeStyle = currentTheme.primary;
        oCtx.globalAlpha = opacity;
        oCtx.lineWidth = 0.5;
        oCtx.stroke();
      }
      oCtx.restore();

      // Determine Base Mandala Sizes (Modulated with Voice Resonance and subtle global breathing alignment)
      const baseRadius = Math.min(width, height) * 0.18 * voiceScaleFactor * breathingScaleFactor;

      // 2. Render Mandala Base Geometry
      if (mandalaType === 'metatron') {
        renderMetatron(oCtx, baseRadius, time, currentTheme, drawLine, dynamicGlow);
      } else if (mandalaType === 'seedOfLife') {
        renderSeedOfLife(oCtx, baseRadius, time, currentTheme);
      } else {
        renderStarGlow(oCtx, baseRadius, time, currentTheme, dynamicGlow);
      }

      // 3. Draw Intricate Concentric Astrolabe Rings
      oCtx.save();
      oCtx.globalCompositeOperation = 'screen';
      
      // Ring A - Static Outer Boundary
      drawGlowRing(0, 0, baseRadius * 1.8, currentTheme.secondary, currentTheme.glowColor, 1.5);
      
      // Ring B - Rapidly ticking interior glyph rim
      oCtx.rotate(-time * 0.4);
      drawGlowRing(0, 0, baseRadius * 1.7, currentTheme.primary, currentTheme.glowColor, 0.7);
      
      // Ticks/Rays along Rim B
      const numTicks = 64;
      oCtx.strokeStyle = currentTheme.primary;
      oCtx.lineWidth = 1;
      for (let i = 0; i < numTicks; i++) {
        oCtx.rotate((Math.PI * 2) / numTicks);
        oCtx.beginPath();
        oCtx.moveTo(baseRadius * 1.7, 0);
        oCtx.lineTo(baseRadius * (i % 8 === 0 ? 1.75 : 1.72), 0);
        oCtx.stroke();
      }
      oCtx.restore();

      oCtx.save();
      oCtx.rotate(time * 0.25);
      // Ring C - Secondary Outer Frame
      drawGlowRing(0, 0, baseRadius * 1.5, currentTheme.secondary, currentTheme.glowColor, 1);
      
      // Star Poly-burst
      oCtx.beginPath();
      const vertices = 12;
      for (let i = 0; i <= vertices; i++) {
        const r = i % 2 === 0 ? baseRadius * 1.5 : baseRadius * 1.25;
        const angle = (i * Math.PI * 2) / vertices;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) oCtx.moveTo(x, y);
        else oCtx.lineTo(x, y);
      }
      oCtx.strokeStyle = currentTheme.primary;
      oCtx.globalAlpha = 0.5;
      oCtx.lineWidth = 0.8;
      oCtx.stroke();
      oCtx.restore();

      // Auto-generate dynamic vocal spark emissions when voice peak exceeds threshold
      if (currentVoiceAmp > 0.08 && Math.random() < 0.35) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.0 + currentVoiceAmp * 6.0;
        particlesRef.current.push({
          x: 0, // launch outwards from Core Singularity
          y: 0,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 1 + Math.random() * (2 + currentVoiceAmp * 3),
          color: Math.random() > 0.45 ? currentTheme.primary : currentTheme.accent,
          alpha: 0.9,
          decay: 0.012 + Math.random() * 0.015,
          spin: (Math.random() - 0.5) * 0.05
        });
      }

      // Auto-generate dynamic orbiting motes (ambient + active voice-driven spawning)
      const moteSpawnProb = currentVoiceAmp > 0.05 ? (0.15 + currentVoiceAmp * 0.4) : 0.03;
      if (Math.random() < moteSpawnProb) {
        const isAccent = Math.random() > 0.4;
        const moteColor = isAccent ? currentTheme.accent : currentTheme.primary;
        orbitingMotesRef.current.push({
          angle: Math.random() * Math.PI * 2,
          orbitRadiusFactor: 0.4 + Math.random() * 1.4, // spans from inner to outer mandala rings
          angularSpeed: (0.005 + Math.random() * 0.015) * (Math.random() > 0.5 ? 1 : -1),
          radius: 1.5 + Math.random() * 3.0,
          color: moteColor,
          glowColor: currentTheme.glowColor || '#FFFFFF',
          alpha: 0.85,
          decay: 0.002 + Math.random() * 0.005, // live longer for full orbital paths
          phase: Math.random() * Math.PI * 2
        });
      }

      // Voice Wave Ripple Propagation (Auto-trigger circular WebGL water waves on voice peaks!)
      if (currentVoiceAmp > 0.35) {
        const now = Date.now();
        if (now - voicePeakDebounceRef.current > 450) {
          // Emit sound waves from center of viewport (0.5, 0.5 in shader coordinates)
          addRipple(0.5, 0.5, currentVoiceAmp * 1.6);
          voicePeakDebounceRef.current = now;
        }
      }

      // 4. Render Floating Spark Particles (drawn directly on texture, gets refracted!)
      oCtx.save();
      oCtx.globalCompositeOperation = 'lighter';
      particlesRef.current = particlesRef.current.filter((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02; // slight gravity pull
        p.alpha -= p.decay;

        // Apply a bit of swirling force
        const radialAngle = Math.atan2(p.y, p.x);
        p.x += Math.cos(radialAngle + Math.PI / 2) * p.spin * 15;
        p.y += Math.sin(radialAngle + Math.PI / 2) * p.spin * 15;

        oCtx.beginPath();
        oCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        oCtx.fillStyle = p.color;
        oCtx.globalAlpha = Math.max(0, p.alpha);
        oCtx.fill();

        return p.alpha > 0;
      });
      oCtx.restore();

      // 4b. Render and Update Orbiting Motes (reactive to microphone)
      oCtx.save();
      oCtx.globalCompositeOperation = 'lighter';
      orbitingMotesRef.current = orbitingMotesRef.current.filter((mote) => {
        // Accelerate orbital speed dynamically under loud voice levels
        const speedFactor = 1.0 + currentVoiceAmp * 4.5;
        mote.angle += mote.angularSpeed * speedFactor;
        
        // Decay the mote lifecycle
        mote.alpha -= mote.decay;

        // Orbital radius expands with central mandala scale and voice resonance waves
        const wave = Math.sin(time * 3 + mote.phase) * (8 + currentVoiceAmp * 25);
        const dynamicRadius = baseRadius * mote.orbitRadiusFactor + wave;

        const mx = Math.cos(mote.angle) * dynamicRadius;
        const my = Math.sin(mote.angle) * dynamicRadius;

        // Draw outer fuzzy halo glow
        oCtx.beginPath();
        oCtx.arc(mx, my, mote.radius * (2.2 + currentVoiceAmp * 2.8), 0, Math.PI * 2);
        oCtx.fillStyle = mote.glowColor;
        oCtx.globalAlpha = Math.max(0, mote.alpha * 0.25);
        oCtx.fill();

        // Draw solid inner core
        oCtx.beginPath();
        oCtx.arc(mx, my, mote.radius, 0, Math.PI * 2);
        oCtx.fillStyle = mote.color;
        oCtx.globalAlpha = Math.max(0, mote.alpha);
        oCtx.fill();

        return mote.alpha > 0;
      });
      oCtx.restore();

      // 5. Draw glowing Core Singularity (Driven by Dynamic Voice Pulse Alignment)
      oCtx.save();
      const corePulse = ((Math.sin(time * 4) + 1.2) * 0.3 + 0.8) * (1.0 + currentVoiceAmp * 0.7);
      const coreGrad = oCtx.createRadialGradient(0, 0, 0, 0, 0, baseRadius * 0.15 * corePulse);
      coreGrad.addColorStop(0, '#FFFFFF');
      coreGrad.addColorStop(0.2, currentTheme.accent);
      coreGrad.addColorStop(0.5, currentTheme.primary);
      coreGrad.addColorStop(1, 'transparent');
      
      oCtx.fillStyle = coreGrad;
      oCtx.beginPath();
      oCtx.arc(0, 0, baseRadius * 0.15 * corePulse, 0, Math.PI * 2);
      oCtx.fill();
      oCtx.restore();

      // 5b. Render and Update Translucent Floating Text Ripples (Project Lithia Speech Transcription)
      oCtx.save();
      oCtx.globalCompositeOperation = 'screen';
      textRipplesRef.current = textRipplesRef.current.filter((ripple) => {
        // Progress life and expand radius
        ripple.life += ripple.decay;
        ripple.distance += ripple.speed * (1.0 + currentVoiceAmp * 1.5); // expand faster with voice intensity
        ripple.angle += ripple.spin;
        
        // Custom smooth fade-in and fade-out based on lifespan
        if (ripple.life < 0.15) {
          ripple.alpha = ripple.life / 0.15;
        } else {
          ripple.alpha = Math.max(0, 1.0 - (ripple.life - 0.15) / 0.85);
        }
        
        ripple.scale = 0.75 + ripple.life * 0.45;
        
        const tx = Math.cos(ripple.angle) * ripple.distance;
        const ty = Math.sin(ripple.angle) * ripple.distance;
        
        oCtx.save();
        oCtx.translate(tx, ty);
        
        // Subtle text rotation towards/away from center
        let textRotation = ripple.angle;
        if (textRotation > Math.PI / 2 && textRotation < (3 * Math.PI) / 2) {
          textRotation += Math.PI; // Keep it readable and upright
        }
        oCtx.rotate(textRotation * 0.15); // gentle angle tilt
        
        oCtx.scale(ripple.scale, ripple.scale);
        
        // Text Typography configuration
        oCtx.font = `bold ${ripple.size}px "JetBrains Mono", "Space Grotesk", monospace`;
        oCtx.textAlign = 'center';
        oCtx.textBaseline = 'middle';
        
        // Outer glowing halo blur
        oCtx.shadowBlur = 10 * dynamicGlow;
        oCtx.shadowColor = ripple.color;
        
        // Translucent fill
        oCtx.fillStyle = ripple.color;
        oCtx.globalAlpha = Math.max(0, ripple.alpha * 0.75);
        oCtx.fillText(ripple.text, 0, 0);
        
        oCtx.restore();
        
        return ripple.life < 1.0;
      });
      oCtx.restore();

      oCtx.restore(); // Restore center coordinates translation

      // 6. Update WebGL Ripples State
      ripplesRef.current = ripplesRef.current.filter((ripple) => {
        ripple.time += 0.012 * ripple.speed; // progress wave expansion
        return ripple.time < 1.0;
      });

      // 7. Bind Texture, Upload Offscreen Canvas, & Render WebGL Quad
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, offscreen);

      gl.uniform2f(resolutionLoc, width, height);
      gl.uniform1i(numRipplesLoc, ripplesRef.current.length);

      // Convert the currentTheme ripple color (hex string) to normalized float RGB values
      const ripColor = currentTheme.ripple || '#00F0FF';
      const ripClean = ripColor.replace('#', '');
      let ripR = 0.0, ripG = 0.85, ripB = 1.0;
      if (ripClean.length === 3) {
        ripR = parseInt(ripClean[0] + ripClean[0], 16) / 255;
        ripG = parseInt(ripClean[1] + ripClean[1], 16) / 255;
        ripB = parseInt(ripClean[2] + ripClean[2], 16) / 255;
      } else if (ripClean.length === 6) {
        ripR = parseInt(ripClean.substring(0, 2), 16) / 255;
        ripG = parseInt(ripClean.substring(2, 4), 16) / 255;
        ripB = parseInt(ripClean.substring(4, 6), 16) / 255;
      }
      gl.uniform3f(rippleColorLoc, ripR, ripG, ripB);

      // Prepare Shader Uniform arrays
      const centers = new Float32Array(32 * 2);
      const radii = new Float32Array(32);
      const strengths = new Float32Array(32);
      const timesArr = new Float32Array(32);

      for (let i = 0; i < ripplesRef.current.length; i++) {
        const ripple = ripplesRef.current[i];
        centers[i * 2] = ripple.x;
        centers[i * 2 + 1] = ripple.y;
        radii[i] = ripple.time * 0.85; // ripple radius wave front size
        strengths[i] = ripple.strength;
        timesArr[i] = ripple.time;
      }

      gl.uniform2fv(rippleCentersLoc, centers);
      gl.uniform1fv(rippleRadiiLoc, radii);
      gl.uniform1fv(rippleStrengthsLoc, strengths);
      gl.uniform1fv(rippleTimesLoc, timesArr);

      // Render WebGL view
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      animationFrameId = requestAnimationFrame(draw);
    };

    // Trigger frame rendering loop
    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [mandalaType, colorTheme, rotationSpeed, glowIntensity, interactionMode, currentTheme, isMicEnabled]);

  // MANDALA DESIGN A: METATRON'S CUBE DRAWING LOGIC
  const renderMetatron = (ctx, baseRadius, time, theme, drawLine, currentGlow) => {
    ctx.save();
    ctx.rotate(time * 0.1);

    const circles = [];
    circles.push({ x: 0, y: 0, r: baseRadius * 0.45 }); // Center Node

    // 6 Inner Circle Nodes
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * baseRadius * 0.55;
      const y = Math.sin(angle) * baseRadius * 0.55;
      circles.push({ x, y, r: baseRadius * 0.45 });
    }

    // 6 Outer Circle Nodes
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * baseRadius * 1.1;
      const y = Math.sin(angle) * baseRadius * 1.1;
      circles.push({ x, y, r: baseRadius * 0.45 });
    }

    // Draw Metatron's Cube connecting line grid (layers of cosmic structure)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 13; i++) {
      const c1 = circles[i];
      if (!c1) continue;
      for (let j = i + 1; j < 13; j++) {
        const c2 = circles[j];
        if (!c2) continue;
        
        // Vary line transparency depending on length to make it layered
        const dist = Math.hypot(c2.x - c1.x, c2.y - c1.y);
        const maxDist = baseRadius * 2.2;
        const lineAlpha = (1.0 - dist / maxDist) * 0.4 * currentGlow;

        drawLine(c1.x, c1.y, c2.x, c2.y, theme.secondary, 0.75, lineAlpha);
      }
    }
    ctx.restore();

    // Render nodes as glowing beads/stars
    circles.forEach((circle, index) => {
      ctx.beginPath();
      ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = index === 0 ? 2 : 1.2;
      ctx.globalAlpha = 0.65;
      ctx.stroke();

      // Little star core inside each circle node
      ctx.beginPath();
      ctx.arc(circle.x, circle.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = theme.accent;
      ctx.globalAlpha = 0.8;
      ctx.fill();
    });

    ctx.restore();
  };

  // MANDALA DESIGN B: FLOWER / SEED OF LIFE DRAWING LOGIC
  const renderSeedOfLife = (ctx, baseRadius, time, theme) => {
    ctx.save();
    ctx.rotate(time * 0.12);

    const r = baseRadius * 0.75;
    
    // Draw Center Circle
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 1.8;
    ctx.globalAlpha = 0.8;
    ctx.stroke();

    // Draw 6 interlocking petals of the seed
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = theme.secondary;
      ctx.lineWidth = 1.2;
      ctx.globalAlpha = 0.45;
      ctx.stroke();

      // Additional concentric interlocking geometry (Flower layer Expansion)
      const outerX = Math.cos(angle + Math.PI / 6) * r * Math.sqrt(3);
      const outerY = Math.sin(angle + Math.PI / 6) * r * Math.sqrt(3);
      ctx.beginPath();
      ctx.arc(outerX, outerY, r, 0, Math.PI * 2);
      ctx.strokeStyle = theme.primary;
      ctx.lineWidth = 0.8;
      ctx.globalAlpha = 0.25;
      ctx.stroke();
    }

    // Outer framing interlocking hexagon
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * r * 1.5;
      const y = Math.sin(angle) * r * 1.5;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = theme.primary;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  };

  // MANDALA DESIGN C: STAR GLOW (NESTED STAR POLYGONS / SRI YANTRA ACCENT)
  const renderStarGlow = (ctx, baseRadius, time, theme, currentGlow) => {
    ctx.save();
    
    // Multiple overlapping star polygons spinning in opposite directions
    const layers = [
      { points: 8, radius: baseRadius * 1.3, speed: time * 0.15, scale: 1, stroke: theme.primary },
      { points: 6, radius: baseRadius * 1.0, speed: -time * 0.25, scale: 0.85, stroke: theme.secondary },
      { points: 12, radius: baseRadius * 0.7, speed: time * 0.35, scale: 0.6, stroke: theme.primary },
      { points: 5, radius: baseRadius * 0.45, speed: -time * 0.1, scale: 0.4, stroke: theme.accent }
    ];

    layers.forEach((layer) => {
      ctx.save();
      ctx.rotate(layer.speed);
      
      ctx.beginPath();
      const angleStep = (Math.PI * 2) / layer.points;
      
      // Draw interlocking rays
      for (let i = 0; i < layer.points * 2; i++) {
        const angle = i * (angleStep / 2);
        const r = i % 2 === 0 ? layer.radius : layer.radius * 0.45;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.75;
      ctx.shadowBlur = 12 * currentGlow;
      ctx.shadowColor = theme.glowColor;
      ctx.stroke();
      
      // Draw small nodes on the star vertices
      for (let i = 0; i < layer.points * 2; i += 2) {
        const angle = i * (angleStep / 2);
        const x = Math.cos(angle) * layer.radius;
        const y = Math.sin(angle) * layer.radius;
        
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = theme.accent;
        ctx.globalAlpha = 0.9;
        ctx.fill();
      }
      
      ctx.restore();
    });

    ctx.restore();
  };

  return (
    <div 
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{ background: currentTheme.background }}
    >
      {/* Title Header */}
      <div className="absolute top-8 left-1/2 transform -translate-x-1/2 text-center pointer-events-none z-10">
        <h1 
          className="text-2xl md:text-3xl font-extrabold tracking-widest uppercase transition-colors duration-500"
          style={{ 
            color: currentTheme.primary, 
            fontFamily: 'monospace',
            textShadow: `0 0 10px ${currentTheme.glowColor}`
          }}
        >
          Project Lithia Mandala
        </h1>
        <p className="text-xs text-gray-400 mt-1 uppercase tracking-wider font-mono">
          Interactive WebGL Aqua Ripple Resonance
        </p>
      </div>

      {/* Main High-Performance Interaction Canvas (WebGL Shader Target) */}
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCanvasClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        className="block w-full h-full cursor-crosshair"
      />

      {/* Real-time speech transcription HUD overlay */}
      {isMicEnabled && liveTranscription && (
        <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 w-11/12 md:w-auto max-w-lg px-6 py-2.5 bg-black bg-opacity-75 backdrop-blur-md border rounded-full text-center z-10 pointer-events-none transition-all duration-300 animate-fade-in flex items-center gap-3 justify-center shadow-lg"
          style={{ borderColor: currentTheme.primary }}
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
          </span>
          <span className="text-3xs md:text-2xs font-mono text-gray-400 uppercase tracking-widest">
            AI COMPANION COHERENCE:
          </span>
          <span className="text-2xs md:text-xs font-mono text-white tracking-wider max-w-[280px] md:max-w-md truncate">
            {liveTranscription}
          </span>
        </div>
      )}

      {/* Canvas Interaction Prompt Footer */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center pointer-events-none z-10">
        <p className="text-xs text-gray-500 uppercase tracking-widest font-mono animate-pulse">
          Click or slide to trigger WebGL aqua water ripples and sparks
        </p>
      </div>

      {/* Collapsible History Panel (Left Side-Panel Drawer) */}
      <div className="absolute top-4 left-4 z-20">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="px-4 py-2 bg-black bg-opacity-70 border rounded-md text-xs font-mono text-white transition-all hover:bg-opacity-90 active:scale-95 flex items-center gap-2 shadow-lg"
          style={{ borderColor: currentTheme.secondary }}
        >
          <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {showHistory ? '◀ HIDE HISTORY' : '▶ SHOW HISTORY'}
        </button>

        {showHistory && (
          <div 
            className="mt-2 w-80 p-5 bg-black bg-opacity-80 backdrop-blur-md rounded-lg border flex flex-col gap-4 text-white font-mono text-xs transition-all duration-300 shadow-2xl max-h-[80vh] overflow-y-auto"
            style={{ borderColor: currentTheme.secondary }}
          >
            <div className="flex justify-between items-center border-b border-gray-800 pb-2">
              <span className="text-gray-400 font-bold uppercase tracking-wider text-2xs">RESONANCE HISTORY</span>
              {historyLog.length > 0 && (
                <button 
                  onClick={clearHistory}
                  className="text-4xs text-red-500 hover:text-red-400 uppercase tracking-widest font-black border border-red-950 px-1.5 py-0.5 rounded bg-red-950 bg-opacity-10 hover:bg-opacity-30"
                >
                  CLEAR LOG
                </button>
              )}
            </div>

            {historyLog.length === 0 ? (
              <div className="text-center py-10 text-3xs text-gray-500 uppercase tracking-widest leading-relaxed border border-dashed border-gray-850 rounded">
                No past coherence logs.<br />Adjust palette or speed to begin recording.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="text-4xs text-gray-400 uppercase tracking-widest text-center leading-relaxed italic mb-1">
                  Click a configuration below to revert the mandala to that alignment state
                </div>
                {historyLog.map((entry) => {
                  const themeName = entry.colorTheme === 'solarGold' ? 'Golden Sun' 
                                  : entry.colorTheme === 'cosmicIndigo' ? 'Deep Space Indigo' 
                                  : entry.colorTheme === 'emeraldForest' ? 'Emerald Forest' 
                                  : 'Aqua Resonance';
                  return (
                    <div 
                      key={entry.id}
                      onClick={() => revertToHistory(entry)}
                      className="group p-3 bg-gray-950 bg-opacity-65 border border-gray-900 rounded hover:border-yellow-400 cursor-pointer transition-all flex flex-col gap-2 hover:bg-gray-900 shadow-sm hover:shadow-md"
                    >
                      <div className="flex justify-between items-center text-4xs font-bold">
                        <span className="text-gray-500">{entry.timestamp}</span>
                        <span className="text-yellow-400 group-hover:text-white border border-yellow-400/20 px-1 py-0.2 rounded uppercase transition-colors">
                          REVERT ALIGNMENT
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-gray-900 text-3xs">
                        <div className="flex flex-col">
                          <span className="text-gray-500 uppercase text-4xs">Palette</span>
                          <span className="text-gray-200 font-bold truncate">{themeName}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-gray-500 uppercase text-4xs">Rotation Speed</span>
                          <span className="text-gray-200 font-bold">
                            {entry.rotationSpeed === 0 ? 'PAUSED' : `${entry.rotationSpeed.toFixed(1)}x`}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collapsible Control Panel */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => setShowControls(!showControls)}
          className="px-4 py-2 bg-black bg-opacity-70 border rounded-md text-xs font-mono text-white transition-all hover:bg-opacity-90 active:scale-95"
          style={{ borderColor: currentTheme.secondary }}
        >
          {showControls ? '▲ HIDE SETTINGS' : '▼ SHOW SETTINGS'}
        </button>

        {showControls && (
          <div 
            className="mt-2 w-80 p-5 bg-black bg-opacity-80 backdrop-blur-md rounded-lg border flex flex-col gap-4 text-white font-mono text-xs transition-all duration-300 shadow-2xl"
            style={{ borderColor: currentTheme.secondary }}
          >
            {/* Mandala Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-gray-400">SACRED GEOMETRY SEED</label>
              <div className="grid grid-cols-3 gap-1">
                {['metatron', 'seedOfLife', 'starGlow'].map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setMandalaType(type);
                      triggerHaptic(15);
                    }}
                    className={`py-1.5 border rounded capitalize ${
                      mandalaType === type 
                        ? 'text-black bg-white font-bold border-white' 
                        : 'bg-transparent text-gray-300 border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {type === 'seedOfLife' ? 'Flower' : type === 'starGlow' ? 'Star' : type}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme Presets */}
            <div className="flex flex-col gap-2">
              <label className="text-gray-400">COHERENCE THEME PRESET</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'solarGold', name: 'Golden Sun' },
                  { id: 'cosmicIndigo', name: 'Deep Space Indigo' },
                  { id: 'emeraldForest', name: 'Emerald Forest' },
                  { id: 'aquaResonance', name: 'Aqua Resonance' }
                ].map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => {
                      setColorTheme(theme.id);
                      triggerHaptic(20);
                    }}
                    className={`py-1.5 px-1 border rounded text-3xs font-bold uppercase tracking-wider transition-all ${
                      colorTheme === theme.id 
                        ? 'text-black bg-white border-white shadow-lg' 
                        : 'bg-transparent text-gray-400 border-gray-800 hover:border-gray-600 hover:text-white'
                    }`}
                  >
                    {theme.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Rotation Speed Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-gray-400">
                <span className="flex items-center gap-1.5">
                  ROTATION VELOCITY
                  <button
                    onClick={() => {
                      handleTogglePlayPause();
                      triggerHaptic(15);
                    }}
                    className="p-1 rounded bg-gray-950 hover:bg-gray-900 border border-gray-800 hover:border-gray-700 active:scale-95 transition-all text-white hover:text-yellow-400 flex items-center justify-center"
                    title={rotationSpeed > 0 ? "Pause Animation" : "Resume Animation"}
                  >
                    {rotationSpeed > 0 ? (
                      <svg className="w-3.5 h-3.5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5 text-gray-400 hover:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </span>
                <span className="text-white font-bold">{rotationSpeed === 0 ? "PAUSED" : `${rotationSpeed.toFixed(1)}x`}</span>
              </div>
              <input
                type="range"
                min="0"
                max="3"
                step="0.1"
                value={rotationSpeed}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setRotationSpeed(val);
                  if (val > 0) {
                    setLastNonZeroSpeed(val);
                  }
                  triggerHaptic(10);
                }}
                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-white"
              />
              {/* Presets / Accelerate control buttons */}
              <div className="grid grid-cols-4 gap-1 mt-0.5">
                {[
                  { label: 'Pause', val: 0 },
                  { label: '1.0x', val: 1.0 },
                  { label: '2.0x', val: 2.0 },
                  { label: 'Warp', val: 3.0 }
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => {
                      setRotationSpeed(preset.val);
                      if (preset.val > 0) {
                        setLastNonZeroSpeed(preset.val);
                      }
                      triggerHaptic(15);
                    }}
                    className={`py-1 rounded text-4xs font-bold uppercase transition-all ${
                      rotationSpeed === preset.val 
                        ? 'bg-yellow-400 text-black shadow-inner font-black' 
                        : 'bg-gray-950 text-gray-400 hover:text-white hover:bg-gray-900 border border-gray-900'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Glow Intensity Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-gray-400">
                <span>GLOW FIELD QUANTUM</span>
                <span className="text-white font-bold">{glowIntensity.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={glowIntensity}
                onChange={(e) => {
                  setGlowIntensity(parseFloat(e.target.value));
                  triggerHaptic(10);
                }}
                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-white"
              />
            </div>

            {/* Interaction Options */}
            <div className="flex flex-col gap-2">
              <label className="text-gray-400">RESONANCE INTERACTION</label>
              <div className="grid grid-cols-2 gap-1">
                {['both', 'gravity', 'particles', 'none'].map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setInteractionMode(mode);
                      triggerHaptic(15);
                    }}
                    className={`py-1.5 border rounded capitalize ${
                      interactionMode === mode 
                        ? 'text-black bg-white font-bold border-white' 
                        : 'bg-transparent text-gray-300 border-gray-700 hover:border-gray-500'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Microphone Alignment Options */}
            <div className="flex flex-col gap-2 border-t border-gray-800 pt-3">
              <label className="text-gray-400">DYNAMIC VOICE ALIGNMENT</label>
              <button
                onClick={() => {
                  toggleMicrophone();
                  triggerHaptic(25);
                }}
                className={`py-2 px-3 border rounded font-bold transition-all flex items-center justify-center gap-2 ${
                  isMicEnabled
                    ? 'text-black bg-yellow-400 border-yellow-400 hover:bg-yellow-300'
                    : 'bg-transparent text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white'
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${isMicEnabled ? 'bg-black animate-ping' : 'bg-gray-600'}`} />
                {isMicEnabled ? 'MIC CAPTURE: ON' : 'CONNECT MICROPHONE'}
              </button>
              {isMicEnabled && (
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex justify-between text-3xs text-gray-400 font-bold">
                    <span>MIC SIGNAL VALUE:</span>
                    <span>{(voiceAmplitudeRef.current * 100).toFixed(0)}%</span>
                  </div>
                  <div className="bg-gray-900 h-1.5 rounded overflow-hidden">
                    <div 
                      className="bg-yellow-400 h-full transition-all duration-75"
                      style={{ width: `${Math.min(100, voiceAmplitudeRef.current * 100 * 2.5)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Ambient Soundscape Alignment */}
            <div className="flex flex-col gap-2 border-t border-gray-800 pt-3">
              <label className="text-gray-400">AMBIENT RESONANCE SOUNDSCAPE</label>
              <button
                onClick={() => {
                  setIsSoundscapeEnabled(!isSoundscapeEnabled);
                  triggerHaptic(25);
                }}
                className={`py-2 px-3 border rounded font-bold transition-all flex items-center justify-center gap-2 ${
                  isSoundscapeEnabled
                    ? 'text-black bg-emerald-500 border-emerald-500 hover:bg-emerald-400'
                    : 'bg-transparent text-gray-300 border-gray-700 hover:border-gray-500 hover:text-white'
                }`}
              >
                <svg className={`w-4 h-4 ${isSoundscapeEnabled ? 'animate-pulse text-black' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
                {isSoundscapeEnabled ? 'SOUNDSCAPE: EMBEDDED' : 'PLAY AMBIENT SOUNDSCAPE'}
              </button>
              {isSoundscapeEnabled && (
                <div className="text-4xs text-gray-400 italic text-center uppercase tracking-widest mt-1">
                  Chords and resonant filter adapt seamlessly to the {colorTheme === 'solarGold' ? 'Golden Sun' : colorTheme === 'cosmicIndigo' ? 'Deep Space Indigo' : colorTheme === 'emeraldForest' ? 'Emerald Forest' : 'Aqua Resonance'} palette
                </div>
              )}
            </div>

            {/* Snap Archives / Gallery Section */}
            <div className="flex flex-col gap-2 border-t border-gray-800 pt-3">
              <div className="flex justify-between items-center">
                <label className="text-gray-400">SNAP ARCHIVES</label>
                <button
                  onClick={captureSnapshot}
                  className="px-2 py-1 text-2xs bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded flex items-center gap-1 active:scale-95 transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  CAPTURE LIVE
                </button>
              </div>

              {snapshots.length === 0 ? (
                <div className="text-center py-4 border border-dashed border-gray-800 rounded text-3xs text-gray-500 uppercase tracking-widest">
                  No saved snapshots yet
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {snapshots.map((snap) => (
                    <div 
                      key={snap.id} 
                      className="group relative bg-gray-950 rounded border border-gray-800 hover:border-gray-600 transition-all overflow-hidden flex flex-col justify-between"
                    >
                      {/* Image Thumbnail with Overlay Actions */}
                      <div className="relative aspect-video w-full overflow-hidden bg-black">
                        <img 
                          src={snap.image} 
                          alt={snap.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => loadSnapshot(snap)}
                            className="p-1 bg-white text-black hover:bg-yellow-400 rounded-full shadow-lg transition-colors"
                            title="Load Theme & Settings"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 12H16" />
                            </svg>
                          </button>
                          <button
                            onClick={() => setPreviewImage(snap)}
                            className="p-1 bg-white text-black hover:bg-yellow-400 rounded-full shadow-lg transition-colors"
                            title="Zoom Image"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          </button>
                          <a
                            href={snap.image}
                            download={`${snap.name.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`}
                            className="p-1 bg-white text-black hover:bg-yellow-400 rounded-full shadow-lg transition-colors"
                            title="Download Image"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          </a>
                          <button
                            onClick={() => deleteSnapshot(snap.id)}
                            className="p-1 bg-red-600 text-white hover:bg-red-500 rounded-full shadow-lg transition-colors"
                            title="Delete Snapshot"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {/* Name / Date labels */}
                      <div className="p-1 bg-gray-950 flex flex-col gap-0.5">
                        <span className="text-3xs text-gray-200 font-bold truncate block" title={snap.name}>{snap.name}</span>
                        <span className="text-4xs text-gray-500">{snap.dateString.split(',')[0]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Visual Diagnostics Data */}
            <div className="pt-3 border-t border-gray-800 flex flex-col gap-1 text-2xs text-gray-500">
              <div className="flex justify-between">
                <span>ACTIVE SPARKS:</span>
                <span className="text-gray-300 font-bold">{particlesRef.current.length}</span>
              </div>
              <div className="flex justify-between">
                <span>ACTIVE SHADER RIPPLES:</span>
                <span className="text-gray-300 font-bold">{ripplesRef.current.length} / 32</span>
              </div>
              <div className="flex justify-between">
                <span>MOUSE GRAVITY TILT:</span>
                <span className="text-gray-300 font-bold">
                  {interactionMode === 'both' || interactionMode === 'gravity' ? 'ACTIVE' : 'MUTED'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Snapshot Preview Lightbox Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-95 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 transition-all duration-300"
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-lg w-full bg-gray-950 border rounded-lg overflow-hidden flex flex-col shadow-2xl animate-fade-in"
            style={{ borderColor: currentTheme.secondary }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-black bg-opacity-50">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white tracking-wider uppercase font-mono">{previewImage.name}</span>
                <span className="text-4xs text-gray-400 font-mono mt-0.5">{previewImage.dateString}</span>
              </div>
              <button 
                onClick={() => setPreviewImage(null)}
                className="text-gray-400 hover:text-white font-mono text-sm active:scale-90"
              >
                [CLOSE]
              </button>
            </div>

            {/* Img Container */}
            <div className="relative aspect-video w-full bg-black flex items-center justify-center">
              <img 
                src={previewImage.image} 
                alt={previewImage.name} 
                className="max-h-96 max-w-full object-contain"
              />
            </div>

            {/* Snapshot Specifications Grid */}
            <div className="p-4 bg-black bg-opacity-40 border-t border-gray-900 grid grid-cols-2 gap-2 text-3xs font-mono text-gray-400">
              <div>
                GEOMETRY: <span className="text-white font-bold uppercase">{previewImage.settings.mandalaType}</span>
              </div>
              <div>
                THEME: <span className="text-white font-bold uppercase">{previewImage.settings.colorTheme}</span>
              </div>
              <div>
                ROTATION SPEED: <span className="text-white font-bold">{previewImage.settings.rotationSpeed}x</span>
              </div>
              <div>
                GLOW FIELD: <span className="text-white font-bold">{previewImage.settings.glowIntensity}x</span>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex gap-2 p-3 bg-gray-950 border-t border-gray-900 justify-end">
              <button
                onClick={() => {
                  loadSnapshot(previewImage);
                  setPreviewImage(null);
                }}
                className="px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-black font-bold text-2xs rounded tracking-widest font-mono uppercase active:scale-95 transition-all"
              >
                APPLY SETTINGS
              </button>
              <a
                href={previewImage.image}
                download={`${previewImage.name.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`}
                className="px-3 py-1.5 border border-gray-700 hover:border-gray-500 text-white font-bold text-2xs rounded tracking-widest font-mono uppercase active:scale-95 transition-all flex items-center gap-1"
              >
                DOWNLOAD
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoldenMandala;


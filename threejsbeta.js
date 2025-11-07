(function(Scratch){
  'use strict';

  // Utility: load an external script once
  const loadScriptOnce = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-loaded-src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.loadedSrc = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(s);
  });

  class ThreeJSExtension {
    constructor(runtime){
      this.runtime = runtime;

      this.THREE = null;
      this.initialized = false;

      // objects registry by id
      this.objects = new Map();
      // imported models library (name -> {geometry, material})
      this.library = new Map();
      // materials library (name -> THREE.Material)
      this.materials = new Map();
      // player handle
      this.player = null;
      // post-processing
      this._composer = null;
      this._renderPass = null;
      this._ssaoPass = null;
      this._fxaaPass = null;
      this._postEnabled = false;
      this._postSSAO = false;
      this._postFXAA = false;
      this._postQuality = 'medium';

      // render loop
      this._animHandle = null;
      this._renderLoopEnabled = false;

      // default viewer size (will auto-sync to stage)
      this.width = 480;
      this.height = 360;

      // default camera settings
      this._fov = 60;
      this._near = 0.1;
      this._far = 1000;

      // Mixers for animations
      this.mixers = new Map();
      this._clips = new Map();
      this._clock = null;

      // Environment map for all PBR materials
      this._envMapSize = 256; // Default environment map size
      
      // Debug mode state
      this._debugMode = 'none'; // 'none', 'flat', 'normals', 'bounds'
      this._originalMaterials = new Map(); // Store original materials for debug toggling
      this.renderer = null;
      this.canvas = null;
      this.container = null; // no longer used, kept for backwards compatibility

      // Texture quality (mipmap) config: 0..3
      // 0 = Off (LinearFilter), 1 = NearestMipmapNearest, 2 = NearestMipmapLinear, 3 = LinearMipmapLinear
      this.mipmapLevel = 3;

      // Bind methods used as callbacks
      this._loop = this._loop.bind(this);
      this._syncSizeToStage = this._syncSizeToStage.bind(this);
      this._syncPositionToStage = this._syncPositionToStage.bind(this);

      // Shadows config
      this.shadowsEnabled = true;
      this.shadowMapSize = 1024;

      // Assume THREE.GLTFLoader is available globally (no external imports)
      this.GLTFLoader = null;
    }

    getInfo(){
      return {
        id: 'threejsviewer',
        name: 'Three.js Viewer',
        color1: '#678cd1ff',
        color2: '#0848bf',
        docsURI: 'https://threejs.org/',
        blocks: [
          // Materials
          { blockType: Scratch.BlockType.LABEL, text: 'Materials' },
          {
            opcode: 'createMaterialFromSVG',
            blockType: Scratch.BlockType.COMMAND,
            text: 'create material [MNAME] from SVG [SVGTEXT]',
            arguments: {
              MNAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'mat1' },
              SVGTEXT: { type: Scratch.ArgumentType.STRING, defaultValue: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="red"/></svg>' },
            }
          },
          {
            opcode: 'createPBRMaterialFromSVG',
            blockType: Scratch.BlockType.COMMAND,
            text: 'create PBR material [MNAME] base [BASE] normal [NORMAL] rough [ROUGH] metal [METAL] ao [AO]',
            arguments: {
              MNAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'pbr1' },
              BASE: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
              NORMAL: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
              ROUGH: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
              METAL: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
              AO: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
            }
          },
          {
            opcode: 'setMipmapLevel',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set mipmap level [LEVEL] (0-3)',
            arguments: { LEVEL: { type: Scratch.ArgumentType.STRING, menu: 'mipmapLevelMenu' } }
          },
          // Models
          { blockType: Scratch.BlockType.LABEL, text: 'Models' },
          {
            opcode: 'importOBJ',
            blockType: Scratch.BlockType.COMMAND,
            text: 'import object [NAME] data [DATA] material [MAT]',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'model1' },
              DATA: { type: Scratch.ArgumentType.STRING, defaultValue: '["v 0 0 0","f 1 1 1"]' },
              MAT: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
            }
          },
          {
            opcode: 'spawnObject',
            blockType: Scratch.BlockType.COMMAND,
            text: 'spawn object [NAME] as [ID] at x [X] y [Y] z [Z] rot x [RX] y [RY] z [RZ] (deg)',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'model1' },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'instance1' },
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              RX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              RY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              RZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            }
          },
          {
            opcode: 'transformModel',
            blockType: Scratch.BlockType.COMMAND,
            text: 'transform model [ID] by x [DX] y [DY] z [DZ] rot x [DRX] y [DRY] z [DRZ] (deg)',
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'instance1' },
              DX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DRX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DRY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DRZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            }
          },
          {
            opcode: 'setModelAttributeBool',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set attribute [ATTR] of model [ID] to [VAL]',
            arguments: {
              ATTR: { type: Scratch.ArgumentType.STRING, menu: 'attributesMenu' },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'instance1' },
              VAL: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu' },
            }
          },
          {
            opcode: 'despawnModel',
            blockType: Scratch.BlockType.COMMAND,
            text: 'despawn model [ID]',
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'instance1' },
            }
          },
          {
            opcode: 'clearLibrary',
            blockType: Scratch.BlockType.COMMAND,
            text: 'clear library',
          },
          // Lighting
          { blockType: Scratch.BlockType.LABEL, text: 'Lighting' },
          {
            opcode: 'addPointLight',
            blockType: Scratch.BlockType.COMMAND,
            text: 'add point light x [LX] y [LY] z [LZ] color [LC] intensity [LI]',
            arguments: {
              LX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              LY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              LZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 2 },
              LC: { type: Scratch.ArgumentType.COLOR, defaultValue: '#ffffff' },
              LI: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
            }
          },
          {
            opcode: 'enableSkyLight',
            blockType: Scratch.BlockType.COMMAND,
            text: 'enable sky light [VAL]',
            arguments: { VAL: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu' } }
          },
          // Shadows
          { blockType: Scratch.BlockType.LABEL, text: 'Shadows' },
          {
            opcode: 'enableShadows',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set global shadows [VAL]',
            arguments: { VAL: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu' } }
          },
          {
            opcode: 'setShadowMapSize',
            blockType: Scratch.BlockType.COMMAND,
            text: 'shadow map size [SIZE]',
            arguments: { SIZE: { type: Scratch.ArgumentType.STRING, menu: 'shadowSizeMenu' } }
          },
          {
            opcode: 'setModelCastShadows',
            blockType: Scratch.BlockType.COMMAND,
            text: 'model [ID] cast shadows [VAL]',
            arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'instance1' }, VAL: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu' } }
          },
          {
            opcode: 'setModelReceiveShadows',
            blockType: Scratch.BlockType.COMMAND,
            text: 'model [ID] receive shadows [VAL]',
            arguments: { ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'instance1' }, VAL: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu' } }
          },
          {
            opcode: 'setPointLightsCastShadows',
            blockType: Scratch.BlockType.COMMAND,
            text: 'point lights cast shadows [VAL]',
            arguments: { VAL: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu' } }
          },
          // Camera
          { blockType: Scratch.BlockType.LABEL, text: 'Camera' },
          {
            opcode: 'setCameraPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set camera x [X] y [Y] z [Z]',
            arguments: {
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Z: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
            }
          },
          {
            opcode: 'setCameraRotation',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set camera rotation x [RX] y [RY] z [RZ] (deg)',
            arguments: {
              RX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              RY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              RZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            }
          },
          // Rendering
          { blockType: Scratch.BlockType.LABEL, text: 'Rendering' },
          {
            opcode: 'renderFrame',
            blockType: Scratch.BlockType.COMMAND,
            text: 'render frame',
          },
          {
            opcode: 'setPostProcessing',
            blockType: Scratch.BlockType.COMMAND,
            text: 'post fx ssao [SSAO] quality [Q] fxaa [FXAA]',
            arguments: {
              SSAO: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu', defaultValue: 'true' },
              Q: { type: Scratch.ArgumentType.STRING, menu: 'ssaoQualityMenu', defaultValue: 'medium' },
              FXAA: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu', defaultValue: 'true' },
            }
          },
          {
            opcode: 'setReflectionSize',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set environment map size [SIZE]',
            arguments: { 
              SIZE: { 
                type: Scratch.ArgumentType.STRING, 
                menu: 'reflectionSizeMenu',
                defaultValue: '256'
              } 
            }
          },
          // Scene
          { blockType: Scratch.BlockType.LABEL, text: 'Scene' },
          {
            opcode: 'resetScene',
            blockType: Scratch.BlockType.COMMAND,
            text: 'reset scene',
          },
          // Player
          { blockType: Scratch.BlockType.LABEL, text: 'Player' },
          {
            opcode: 'initPlayer',
            blockType: Scratch.BlockType.COMMAND,
            text: 'init player at x [PX] y [PY] z [PZ]',
            arguments: {
              PX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              PY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              PZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            }
          },
          {
            opcode: 'setPlayerPosition',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set player position x [PX] y [PY] z [PZ]',
            arguments: {
              PX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              PY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              PZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            }
          },
          {
            opcode: 'setPlayerVisible',
            blockType: Scratch.BlockType.COMMAND,
            text: 'show player mesh [VAL]',
            arguments: {
              VAL: { type: Scratch.ArgumentType.STRING, menu: 'boolMenu' }
            }
          },
          {
            opcode: 'playerPosX',
            blockType: Scratch.BlockType.REPORTER,
            text: 'player x',
          },
          {
            opcode: 'playerPosY',
            blockType: Scratch.BlockType.REPORTER,
            text: 'player y',
          },
          {
            opcode: 'playerPosZ',
            blockType: Scratch.BlockType.REPORTER,
            text: 'player z',
          },
          {
            opcode: 'playerIntersections',
            blockType: Scratch.BlockType.REPORTER,
            text: 'player intersects meshes',
          },
          // Debug
          { blockType: Scratch.BlockType.LABEL, text: 'Debug' },
          {
            opcode: 'setDebugMode',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set debug mode [MODE]',
            arguments: {
              MODE: { 
                type: Scratch.ArgumentType.STRING, 
                menu: 'debugModeMenu',
                defaultValue: 'none'
              }
            }
          },
          // Utilities
          { blockType: Scratch.BlockType.LABEL, text: 'Utilities' },
          {
            opcode: 'vramUsageMB',
            blockType: Scratch.BlockType.REPORTER,
            text: 'VRAM usage (MB)',
          },
          { blockType: Scratch.BlockType.LABEL, text: '3D Objects' },
          {
            opcode: 'loadGLB',
            blockType: Scratch.BlockType.COMMAND,
            text: 'load GLB url [URL] as [NAME]',
            arguments: {
              URL: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'model1' },
            }
          },
          {
            opcode: 'playAnimation',
            blockType: Scratch.BlockType.COMMAND,
            text: 'play animation [ANIM] on mesh [ID]',
            arguments: {
              ANIM: { type: Scratch.ArgumentType.STRING, defaultValue: '' },
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'model1' },
            }
          },
          {
            opcode: 'availableAnimations',
            blockType: Scratch.BlockType.REPORTER,
            text: 'available animations of [ID]',
            arguments: {
              ID: { type: Scratch.ArgumentType.STRING, defaultValue: 'model1' },
            }
          },
        ],
        menus: {
          attributesMenu: {
            acceptReporters: true,
            items: [
              { text: 'smooth shading', value: 'smoothShading' },
            ]
          },
          boolMenu: {
            acceptReporters: true,
            items: [
              { text: 'true', value: 'true' },
              { text: 'false', value: 'false' },
            ]
          },
          reflectionSizeMenu: {
            acceptReporters: true,
            items: [
              { text: '128', value: '128' },
              { text: '256', value: '256' },
              { text: '512', value: '512' },
              { text: '1024', value: '1024' }
            ]
          },
          mipmapLevelMenu: {
            acceptReporters: true,
            items: [
              { text: '0 (Off)', value: '0' },
              { text: '1', value: '1' },
              { text: '2', value: '2' },
              { text: '3 (Best)', value: '3' },
            ]
          },
          shadowSizeMenu: {
            acceptReporters: true,
            items: [
              { text: '512', value: '512' },
              { text: '1024', value: '1024' },
              { text: '2048', value: '2048' },
            ]
          },
          debugModeMenu: {
            acceptReporters: true,
            items: [
              { text: 'None', value: 'none' },
              { text: 'Flat White', value: 'flat' },
              { text: 'Show Normals', value: 'normals' },
              { text: 'Show Bounding Boxes', value: 'bounds' }
            ]
          },
          ssaoQualityMenu: {
            acceptReporters: true,
            items: [
              { text: 'low', value: 'low' },
              { text: 'medium', value: 'medium' },
              { text: 'high', value: 'high' }
            ]
          },
        }
      };
    }

    async _ensureInitialized(){
      if (this.initialized) return;
      // Load Three.js from CDN
      await loadScriptOnce('https://unpkg.com/three@0.149.0/build/three.min.js');
      // eslint-disable-next-line no-undef
      this.THREE = window.THREE;
      if (!this.THREE) throw new Error('Three.js failed to load');

      // Find the TurboWarp/Scratch stage container using the runtime's renderer
      const stageCanvas = this.runtime && this.runtime.renderer && this.runtime.renderer.canvas;
      if (!stageCanvas || !stageCanvas.parentElement){
        throw new Error('Unable to locate stage canvas from runtime');
      }
      const stageContainer = stageCanvas.parentElement;

      // Create overlay canvas attached to the stage
      this.canvas = document.createElement('canvas');
      this.canvas.style.position = 'absolute';
      this.canvas.style.left = '0';
      this.canvas.style.top = '0';
      this.canvas.style.zIndex = '10';
      this.canvas.style.pointerEvents = 'none'; // do not block stage interactions
      this.canvas.style.display = 'none'; // hidden until initialized/shown
      // Ensure the stage container can host absolutely positioned children
      const prevPos = getComputedStyle(stageContainer).position;
      if (prevPos === 'static') {
        stageContainer.style.position = 'relative';
      }
      stageContainer.appendChild(this.canvas);

      // Three core
      this.renderer = new this.THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
      // Size will be synced to stage below
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.shadowMap.enabled = this.shadowsEnabled;
      this.renderer.shadowMap.type = this.THREE.PCFSoftShadowMap;

      this.scene = new this.THREE.Scene();
      this.scene.background = null; // transparent

      this.camera = new this.THREE.PerspectiveCamera(this._fov, 1, this._near, this._far);
      // Neutral default: straight on, centered
      this.camera.position.set(0, 0, 5);
      this.camera.lookAt(0, 0, 0);

      // Simple default light
      const ambient = new this.THREE.AmbientLight(0xffffff, 0.7);
      this.scene.add(ambient);
      this._dirLight = new this.THREE.DirectionalLight(0xffffff, 0.8);
      this._dirLight.position.copy(this.camera.position);
      this._dirLight.target = new this.THREE.Object3D();
      this._dirLight.target.position.set(0, 0, 0);
      this.scene.add(this._dirLight.target);
      this.scene.add(this._dirLight);
      // No shadows on default directional light to keep cost down unless enabled globally

      // Observe stage size and sync
      this._resizeObserver = new (window.ResizeObserver || class { constructor(cb){ this._cb=cb;} observe(){ window.addEventListener('resize',()=>this._cb([])); } disconnect(){} })(this._syncSizeToStage);
      this._observedTarget = stageCanvas;
      if (this._resizeObserver.observe) this._resizeObserver.observe(stageCanvas);
      this._syncSizeToStage();
      this._syncPositionToStage();

      this.initialized = true;
    }

    _syncSizeToStage(){
      try{
        const stageCanvas = this.runtime && this.runtime.renderer && this.runtime.renderer.canvas;
        if (!stageCanvas) return;
        const rect = stageCanvas.getBoundingClientRect();
        const displayW = Math.max(1, Math.floor(rect.width));
        const displayH = Math.max(1, Math.floor(rect.height));
        const internalW = Math.max(1, stageCanvas.width);
        const internalH = Math.max(1, stageCanvas.height);
        this.width = internalW; this.height = internalH;
        // CSS size matches displayed size
        this.canvas.style.width = displayW + 'px';
        this.canvas.style.height = displayH + 'px';
        // Renderer uses internal pixel size of the stage
        this.renderer.setSize(internalW, internalH, false);
        if (this.camera && this.camera.isPerspectiveCamera){
          this.camera.aspect = internalW / internalH;
          this.camera.updateProjectionMatrix();
        }
        // Post FX resize
        if (this._composer && this._postEnabled){
          this._composer.setSize(internalW, internalH);
          if (this._fxaaPass && this._fxaaPass.material && this._fxaaPass.material.uniforms && this._fxaaPass.material.uniforms['resolution']){
            this._fxaaPass.material.uniforms['resolution'].value.set(1/internalW, 1/internalH);
          }
          if (this._ssaoPass && this._ssaoPass.setSize){ this._ssaoPass.setSize(internalW, internalH); }
        }
      }catch(e){ /* ignore */ }
    }

    _syncPositionToStage(){
      try{
        const stageCanvas = this.runtime && this.runtime.renderer && this.runtime.renderer.canvas;
        if (!stageCanvas) return;
        // Align to the stage canvas within its parent container
        const left = stageCanvas.offsetLeft;
        const top = stageCanvas.offsetTop;
        this.canvas.style.left = left + 'px';
        this.canvas.style.top = top + 'px';
      }catch(e){ /* ignore */ }
    }

    // Blocks implementations
    async renderFrame(){
      await this._ensureInitialized();
      this.canvas.style.display = '';
      this.renderOnce();
    }

    _estimateVRAMBytes(){
      const T = this.THREE;
      let bytes = 0;
      const geometries = new Set();
      const buffers = new Set(); // underlying ArrayBuffers to avoid double counting
      const textures = new Set();

      this.scene.traverse(obj => {
        if (obj.isMesh || obj.isPoints || obj.isLine){
          const g = obj.geometry;
          if (g && !geometries.has(g)){
            geometries.add(g);
            // Attributes
            const attribs = g.attributes || {};
            for (const key in attribs){
              const attr = attribs[key];
              if (attr && attr.array && attr.array.buffer && !buffers.has(attr.array.buffer)){
                buffers.add(attr.array.buffer);
                bytes += attr.array.byteLength;
              }
            }
            // Index
            const idx = g.index;
            if (idx && idx.array && idx.array.buffer && !buffers.has(idx.array.buffer)){
              buffers.add(idx.array.buffer);
              bytes += idx.array.byteLength;
            }
            // Morph attributes
            const morph = g.morphAttributes || {};
            for (const mkey in morph){
              const arr = morph[mkey];
              if (Array.isArray(arr)){
                for (const attr of arr){
                  if (attr && attr.array && attr.array.buffer && !buffers.has(attr.array.buffer)){
                    buffers.add(attr.array.buffer);
                    bytes += attr.array.byteLength;
                  }
                }
              }
            }
          }

          // Materials -> textures
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats){
            if (!mat) continue;
            for (const prop in mat){
              const val = mat[prop];
              if (val && val.isTexture && !textures.has(val)){
                textures.add(val);
                const img = val.image;
                let w = 0, h = 0;
                if (img){
                  if (typeof img.width === 'number' && typeof img.height === 'number'){
                    w = img.width; h = img.height;
                  } else if (img.videoWidth && img.videoHeight){
                    w = img.videoWidth; h = img.videoHeight;
                  } else if (img.naturalWidth && img.naturalHeight){
                    w = img.naturalWidth; h = img.naturalHeight;
                  }
                }
                // Assume 4 bytes per pixel (RGBA8) and mipmaps (~1.33x)
                const bpp = 4;
                const factor = val.generateMipmaps !== false ? 4/3 : 1;
                bytes += Math.floor(w * h * bpp * factor);
              }
            }
          }
        }
      });

      return bytes;
    }

    async vramUsageMB(){
      await this._ensureInitialized();
      const bytes = this._estimateVRAMBytes();
      const mb = bytes / (1024 * 1024);
      return Number(mb.toFixed(2));
    }

    // Basic OBJ loader from JSON array of lines
    _parseOBJFromLines(lines){
      const T = this.THREE;
      const positions = [];
      const normals = [];
      const uvs = [];
      const outPositions = [];
      const outNormals = [];
      const outUVs = [];

      const addVertex = (vi, ti, ni) => {
        // Handle position
        const vIndex = (vi < 0 ? positions.length / 3 + vi : vi - 1) * 3;
        outPositions.push(
          positions[vIndex] || 0,
          positions[vIndex+1] || 0,
          positions[vIndex+2] || 0
        );
        
        // Handle UVs if present
        if (ti != null && !isNaN(ti) && uvs.length > 0) {
          const tIndex = (ti < 0 ? uvs.length / 2 + ti : ti - 1) * 2;
          if (tIndex >= 0 && tIndex + 1 < uvs.length) {
            outUVs.push(uvs[tIndex], uvs[tIndex+1]);
          } else {
            // Fallback to (0,0) if UV index is out of bounds
            outUVs.push(0, 0);
          }
        } else {
          // If no UVs or invalid, add default (0,0)
          outUVs.push(0, 0);
        }

        // Handle normals if present
        if (ni != null && !isNaN(ni) && normals.length > 0) {
          const nIndex = (ni < 0 ? normals.length / 3 + ni : ni - 1) * 3;
          if (nIndex >= 0 && nIndex + 2 < normals.length) {
            outNormals.push(normals[nIndex], normals[nIndex+1], normals[nIndex+2]);
          }
        }
      };

      // Parse the OBJ file
      for (let raw of lines) {
        if (!raw || typeof raw !== 'string') continue;
        const line = raw.trim();
        if (line === '' || line.startsWith('#')) continue;
        
        const parts = line.split(/\s+/);
        const type = parts[0];
        
        if (type === 'v') {
          // Vertex position
          positions.push(
            parseFloat(parts[1]) || 0,
            parseFloat(parts[2]) || 0,
            parseFloat(parts[3]) || 0
          );
        } else if (type === 'vn') {
          // Vertex normal
          normals.push(
            parseFloat(parts[1]) || 0,
            parseFloat(parts[2]) || 0,
            parseFloat(parts[3]) || 1  // Default to (0,0,1) if invalid
          );
        } else if (type === 'vt') {
          // Texture coordinate
          uvs.push(
            parseFloat(parts[1]) || 0,
            parseFloat(parts[2]) || 0
          );
        } else if (type === 'f') {
          // Face (triangulate fan)
          const verts = parts.slice(1).map(tok => {
            const indices = tok.split('/');
            return [
              parseInt(indices[0]) || 0,
              indices[1] !== undefined ? parseInt(indices[1]) : null,
              indices[2] !== undefined ? parseInt(indices[2]) : null
            ].map(x => isNaN(x) ? null : x);
          });

          // Triangulate polygon
          for (let i = 1; i + 1 < verts.length; i++) {
            const a = verts[0], b = verts[i], c = verts[i+1];
            addVertex(a[0], a[1], a[2]);
            addVertex(b[0], b[1], b[2]);
            addVertex(c[0], c[1], c[2]);
          }
        }
      }

      // Create geometry and set attributes
      const geom = new T.BufferGeometry();
      
      // Set positions
      geom.setAttribute('position', new T.BufferAttribute(
        new Float32Array(outPositions), 3));
      
      // Set normals if we have them, otherwise compute them
      if (outNormals.length === outPositions.length) {
        geom.setAttribute('normal', new T.BufferAttribute(
          new Float32Array(outNormals), 3));
      } else {
        geom.computeVertexNormals();
      }
      
      // Always set UVs, even if they're just zeros
      geom.setAttribute('uv', new T.BufferAttribute(
        new Float32Array(outUVs), 2));
      
      // Clean up and return
      geom.computeBoundingSphere();
      const mat = new T.MeshStandardMaterial({ 
        color: '#cccccc',
        side: T.DoubleSide  // Show both sides of faces
      });
      return new T.Mesh(geom, mat);
    }

    async importOBJ(args){
      await this._ensureInitialized();
      const name = String(args.NAME || 'model1');
      const matName = String(args.MAT || '').trim();
      let lines = [];
      try{
        const input = args.DATA;
        if (Array.isArray(input)){
          lines = input.map(x => String(x));
        } else if (typeof input === 'string'){
          lines = JSON.parse(input);
        }
      } catch(e){ /* ignore parse errors */ }
      if (!Array.isArray(lines)) return;

      // Replace in library if exists
      const prevLib = this.library.get(name);
      if (prevLib){
        if (prevLib.geometry) prevLib.geometry.dispose();
        if (prevLib.material){
          if (Array.isArray(prevLib.material)) prevLib.material.forEach(m => m.dispose && m.dispose());
          else if (prevLib.material.dispose) prevLib.material.dispose();
        }
      }

      const mesh = this._parseOBJFromLines(lines);
      // Store geometry and optional material reference name
      const geometry = mesh.geometry;
      const entry = { geometry };
      if (matName) entry.materialName = matName;
      this.library.set(name, entry);
      // Do not add to scene here
    }

    async loadGLB(args){
      await this._ensureInitialized();
      const url = String(args.URL || '').trim();
      const name = String(args.NAME || 'model1');
      if (!url) return;
      const T = this.THREE;
      const loader = this.GLTFLoader || (T && T.GLTFLoader ? new T.GLTFLoader() : null);
      if (!loader) throw new Error('GLTFLoader not available globally');
      await new Promise((resolve, reject) => {
        loader.load(url, (gltf) => {
          let root = gltf.scene || (gltf.scenes && gltf.scenes[0]);
          if (!root) { reject(new Error('No scene in GLB')); return; }
          root.name = name;
          // Shadows per global setting
          root.traverse(o => { if (o.isMesh){ o.castShadow = !!this.shadowsEnabled; o.receiveShadow = !!this.shadowsEnabled; } });
          this.scene.add(root);
          this.objects.set(name, root);
          // Animations
          if (gltf.animations && gltf.animations.length){
            const mixer = new T.AnimationMixer(root);
            this.mixers.set(name, mixer);
            this._clips.set(name, gltf.animations.slice());
          }
          this._fixSmoothShading();
          this.renderOnce();
          resolve();
        }, undefined, (err) => reject(err));
      });
    }

    async playAnimation(args){
      await this._ensureInitialized();
      const id = String(args.ID || 'model1');
      const animName = String(args.ANIM || '').trim();
      const root = this.objects.get(id);
      if (!root || !animName) return;
      const T = this.THREE;
      let mixer = this.mixers.get(id);
      if (!mixer){ mixer = new T.AnimationMixer(root); this.mixers.set(id, mixer); }
      const clips = this._clips.get(id) || [];
      const clip = clips.find(c => c && c.name === animName) || clips[0];
      if (!clip) return;
      const action = mixer.clipAction(clip, root);
      action.reset();
      action.setLoop(T.LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      action.enabled = true;
      action.play();
      this.renderOnce();
    }

    async availableAnimations(args){
      await this._ensureInitialized();
      const id = String(args.ID || 'model1');
      const clips = this._clips.get(id) || [];
      return clips.map(c => c && c.name ? c.name : '');
    }

    async spawnObject(args){
      await this._ensureInitialized();
      const name = String(args.NAME || 'model1');
      const id = String(args.ID || name);
      const lib = this.library.get(name);
      if (!lib) return;
      const T = this.THREE;
      // Replace any existing instance with same name in objects map
      const prev = this.objects.get(id);
      if (prev){
        this.scene.remove(prev);
        if (prev.geometry) prev.geometry.dispose();
        if (prev.material) {
          if (Array.isArray(prev.material)) prev.material.forEach(m => m.dispose && m.dispose());
          else if (prev.material.dispose) prev.material.dispose();
        }
      }
      // Resolve material to use
      let material = null;
      if (lib.materialName && this.materials.has(lib.materialName)){
        material = this.materials.get(lib.materialName);
      } else if (lib.material) {
        material = lib.material;
      }
      const useShared = material && material._twShared;
      const matToUse = useShared ? material : (material && material.clone ? material.clone() : (material || new T.MeshStandardMaterial({ color: '#cccccc' })));
      const clonedGeom = lib.geometry.clone();
      // If material uses aoMap and geometry lacks uv2, duplicate uv into uv2 for basic AO support
      const needsUv2 = matToUse && (matToUse.aoMap || (Array.isArray(matToUse) && matToUse.some(m => m && m.aoMap)));
      if (needsUv2 && !clonedGeom.getAttribute('uv2') && clonedGeom.getAttribute('uv')){
        clonedGeom.setAttribute('uv2', clonedGeom.getAttribute('uv'));
      }
      const mesh = new T.Mesh(clonedGeom, matToUse);
      const x = Number(args.X) || 0; const y = Number(args.Y) || 0; const z = Number(args.Z) || 0;
      const rx = Number(args.RX) || 0; const ry = Number(args.RY) || 0; const rz = Number(args.RZ) || 0;
      const d2r = Math.PI / 180;
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx * d2r, ry * d2r, rz * d2r);
      // Default shadow flags per global setting
      mesh.castShadow = !!this.shadowsEnabled;
      mesh.receiveShadow = !!this.shadowsEnabled;
      mesh.name = id;
      mesh.userData = mesh.userData || {};
      mesh.userData.modelName = name;
      this.scene.add(mesh);
      this.objects.set(id, mesh);
      // No auto-render
    }

    _applyMaterialToObject(obj, material){
      const T = this.THREE;
      if (!obj || !material) return;
      const useShared = material && material._twShared;
      const matToUse = useShared ? material : (material.clone ? material.clone() : material);
      // Ensure aoMap uv2 exists if needed
      const geom = obj.geometry;
      const needsUv2 = matToUse && (matToUse.aoMap || (Array.isArray(matToUse) && matToUse.some(m => m && m.aoMap)));
      if (geom && needsUv2 && !geom.getAttribute('uv2') && geom.getAttribute('uv')){
        geom.setAttribute('uv2', geom.getAttribute('uv'));
      }
      if (Array.isArray(obj.material)){
        obj.material.forEach(m => { if (m && !m._twShared && m.dispose) m.dispose(); });
        obj.material = [matToUse];
      } else {
        if (obj.material && !obj.material._twShared && obj.material.dispose) obj.material.dispose();
        obj.material = matToUse;
      }
    }

    async setModelAttributeBool(args){
      await this._ensureInitialized();
      const attr = String(args.ATTR || 'smoothShading');
      const id = String(args.ID || 'instance1');
      const valStr = String(args.VAL || 'true').toLowerCase();
      const on = valStr === 'true' || valStr === '1' || valStr === 'yes';
      const obj = this.objects.get(id);
      if (!obj) return;
      if (attr === 'smoothShading'){
        // Ensure per-instance material (clone if shared)
        const ensureLocalMaterial = (m) => {
          if (!m) return m;
          if (m._twShared && m.clone){
            const cloned = m.clone();
            // If original had a texture map, it is shared; keep shared map but that's okay
            cloned._twShared = false;
            return cloned;
          }
          return m;
        };
        if (Array.isArray(obj.material)){
          obj.material = obj.material.map(ensureLocalMaterial);
        } else {
          obj.material = ensureLocalMaterial(obj.material);
        }
        // In Three.js, flatShading=false means smooth shading ON
        const applyToMaterial = (m) => {
          if (!m) return;
          if ('flatShading' in m){
            m.flatShading = !on;
            m.needsUpdate = true;
          }
        };
        if (Array.isArray(obj.material)) obj.material.forEach(applyToMaterial);
        else applyToMaterial(obj.material);
      }
      // No auto-render
    }

    async transformModel(args){
      await this._ensureInitialized();
      const id = String(args.ID || 'instance1');
      const obj = this.objects.get(id);
      if (!obj) return;
      const dx = Number(args.DX) || 0; const dy = Number(args.DY) || 0; const dz = Number(args.DZ) || 0;
      const drx = Number(args.DRX) || 0; const dry = Number(args.DRY) || 0; const drz = Number(args.DRZ) || 0;
      const d2r = Math.PI / 180;
      obj.position.x += dx;
      obj.position.y += dy;
      obj.position.z += dz;
      obj.rotation.x += drx * d2r;
      obj.rotation.y += dry * d2r;
      obj.rotation.z += drz * d2r;
      // No auto-render
    }

    async despawnModel(args){
      await this._ensureInitialized();
      const id = String(args.ID || 'instance1');
      const obj = this.objects.get(id);
      if (!obj) return;
      
      // Clean up debug resources
      if (obj.boundingBoxHelper) {
        obj.remove(obj.boundingBoxHelper);
      }
      this._originalMaterials.delete(obj.uuid);
      
      this.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      const disposeMat = (m) => { if (m && !m._twShared && m.dispose) m.dispose(); };
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(disposeMat);
        else disposeMat(obj.material);
      }
      this.objects.delete(id);
      // Clean up animation data
      this.mixers.delete(id);
      this._clips.delete(id);
      // No auto-render
    }

    async clearLibrary(){
      await this._ensureInitialized();
      for (const [, asset] of this.library){
        if (asset.geometry) asset.geometry.dispose();
        // No materials stored in library are owned now; materials are in this.materials
      }
      this.library.clear();
      // No auto-render
    }

    async _textureFromSVG(svg){
      const T = this.THREE;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => { try { URL.revokeObjectURL(url); } catch(_){}; resolve(); };
        img.onerror = () => { try { URL.revokeObjectURL(url); } catch(_){}; reject(new Error('Failed to load SVG image')); };
        img.src = url;
      });
      const tex = new T.Texture(img);
      this._applyMipmapLevelToTexture(tex);
      tex.wrapS = T.RepeatWrapping;
      tex.wrapT = T.RepeatWrapping;
      return tex;
    }

    async _textureFromSVGWithImage(svg){
      const T = this.THREE;
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => { try { URL.revokeObjectURL(url); } catch(_){}; resolve(); };
        img.onerror = () => { try { URL.revokeObjectURL(url); } catch(_){}; reject(new Error('Failed to load SVG image')); };
        img.src = url;
      });
      const tex = new T.Texture(img);
      this._applyMipmapLevelToTexture(tex);
      tex.wrapS = T.RepeatWrapping;
      tex.wrapT = T.RepeatWrapping;
      return { tex, img };
    }

    _applyMipmapLevelToTexture(tex){
      const T = this.THREE;
      const lvl = Math.max(0, Math.min(3, parseInt(this.mipmapLevel) || 0));
      if (lvl === 0){
        tex.generateMipmaps = false;
        tex.minFilter = T.LinearFilter;
      } else if (lvl === 1){
        tex.generateMipmaps = true;
        tex.minFilter = T.NearestMipmapNearestFilter;
      } else if (lvl === 2){
        tex.generateMipmaps = true;
        tex.minFilter = T.NearestMipmapLinearFilter;
      } else {
        tex.generateMipmaps = true;
        tex.minFilter = T.LinearMipmapLinearFilter;
      }
      tex.magFilter = T.LinearFilter;
      tex.needsUpdate = true;
    }

    async createMaterialFromSVG(args){
      await this._ensureInitialized();
      const name = String(args.MNAME || 'mat1');
      const svg = String(args.SVGTEXT || '');
      const T = this.THREE;
      const tex = await this._textureFromSVG(svg);
      const mat = new T.MeshStandardMaterial({ map: tex, color: 0xffffff });
      mat._twShared = true;
      this.materials.set(name, mat);
      // Auto-apply to spawned instances that reference this material via their model
      for (const [id, obj] of this.objects){
        const modelName = obj && obj.userData && obj.userData.modelName;
        if (!modelName) continue;
        const lib = this.library.get(modelName);
        if (lib && lib.materialName === name){
          this._applyMaterialToObject(obj, mat);
        }
      }
      // No auto-render
    }

    async setMipmapLevel(args){
      await this._ensureInitialized();
      const lvl = Math.max(0, Math.min(3, parseInt(args.LEVEL)));
      this.mipmapLevel = lvl;
      // Apply to materials in library
      const applyToMat = (mat) => {
        if (!mat) return;
        const maps = ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap','bumpMap','displacementMap'];
        for (const key of maps){
          const tex = mat[key];
          if (tex && tex.isTexture){ this._applyMipmapLevelToTexture(tex); }
        }
      };
      for (const [, mat] of this.materials){ applyToMat(mat); }
      // Apply to live instances
      for (const [, obj] of this.objects){
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(applyToMat);
      }
      // No auto-render
    }

    async createPBRMaterialFromSVG(args){
      await this._ensureInitialized();
      const name = String(args.MNAME || 'pbr1');
      const base = String(args.BASE || '');
      const normal = String(args.NORMAL || '');
      const rough = String(args.ROUGH || '');
      const metal = String(args.METAL || '');
      const ao = String(args.AO || '');
      const T = this.THREE;
      const matParams = { color: 0xffffff };
      if (base) matParams.map = await this._textureFromSVG(base);
      if (normal) matParams.normalMap = await this._textureFromSVG(normal);
      // Use roughness and metalness maps directly for PBR shading
      if (rough){
        matParams.roughnessMap = await this._textureFromSVG(rough);
        matParams.roughness = 1; // let the map fully control roughness
      }
      if (metal){
        matParams.metalnessMap = await this._textureFromSVG(metal);
        matParams.metalness = 1; // let the map fully control metalness
      }
      if (ao) matParams.aoMap = await this._textureFromSVG(ao);
      const mat = new T.MeshStandardMaterial(matParams);
      // When using maps, Three.js will default roughness=1, metalness=0; maps modulate these values
      mat._twShared = true;
      this.materials.set(name, mat);
      // Auto-apply to spawned instances that reference this material via their model
      for (const [id, obj] of this.objects){
        const modelName = obj && obj.userData && obj.userData.modelName;
        if (!modelName) continue;
        const lib = this.library.get(modelName);
        if (lib && lib.materialName === name){
          this._applyMaterialToObject(obj, mat);
        }
      }
      // No auto-render
    }

    async resetScene(){
      await this._ensureInitialized();
      // Dispose meshes/materials/geometries and remove from scene
      const toRemove = [...this.scene.children];
      for (const obj of toRemove){
        this.scene.remove(obj);
        // Dispose mesh resources
        if (obj.isMesh){
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material){
            const disposeMat = (m) => { if (m && !m._twShared && m.dispose) m.dispose(); };
            if (Array.isArray(obj.material)) obj.material.forEach(disposeMat);
            else disposeMat(obj.material);
          }
        }
      }
      // Clear internal registries and references
      this.objects.clear();
      this.mixers.clear();
      this._clips.clear();
      this.player = null;
      // No auto-render
    }

    async initPlayer(args){
      await this._ensureInitialized();
      const T = this.THREE;
      const x = Number(args.PX) || 0; const y = Number(args.PY) || 0; const z = Number(args.PZ) || 0;
      // Remove previous player
      if (this.player){
        this.scene.remove(this.player);
        if (this.player.geometry) this.player.geometry.dispose();
        if (this.player.material && this.player.material.dispose) this.player.material.dispose();
        this.player = null;
      }
      // Build capsule (fallback if CapsuleGeometry missing)
      let mesh;
      const radius = 0.25; const height = 1.0; const seg = 8;
      if (T.CapsuleGeometry){
        const g = new T.CapsuleGeometry(radius, Math.max(0, height - 2*radius), seg, seg);
        const m = new T.MeshStandardMaterial({ color: 0xffffff });
        mesh = new T.Mesh(g, m);
      } else {
        const group = new T.Group();
        const cylH = Math.max(0, height - 2*radius);
        const mat = new T.MeshStandardMaterial({ color: 0xffffff });
        const cyl = new T.Mesh(new T.CylinderGeometry(radius, radius, Math.max(0.0001, cylH), seg), mat);
        cyl.position.y = 0;
        const sphTop = new T.Mesh(new T.SphereGeometry(radius, seg, seg), mat);
        sphTop.position.y = cylH/2 + radius;
        const sphBot = new T.Mesh(new T.SphereGeometry(radius, seg, seg), mat);
        sphBot.position.y = -(cylH/2 + radius);
        group.add(cyl, sphTop, sphBot);
        mesh = group;
      }
      mesh.position.set(x, y, z);
      mesh.castShadow = !!this.shadowsEnabled;
      mesh.receiveShadow = !!this.shadowsEnabled;
      mesh.userData = mesh.userData || {};
      mesh.userData.collider = { type: 'capsule', radius, height };
      mesh.name = 'player';
      this.scene.add(mesh);
      this.player = mesh;
      // No auto-render
    }

    async setPlayerPosition(args){
      await this._ensureInitialized();
      if (!this.player) return;
      const x = Number(args.PX) || 0; const y = Number(args.PY) || 0; const z = Number(args.PZ) || 0;
      this.player.position.set(x, y, z);
      // No auto-render
    }

    async setPlayerVisible(args){
      await this._ensureInitialized();
      if (!this.player) return;
      const valStr = String(args.VAL || 'true').toLowerCase();
      const on = valStr === 'true' || valStr === '1' || valStr === 'yes';
      this.player.visible = !!on;
      // No auto-render
    }

    async playerPosX(){ await this._ensureInitialized(); return this.player ? Number(this.player.position.x.toFixed(3)) : 0; }
    async playerPosY(){ await this._ensureInitialized(); return this.player ? Number(this.player.position.y.toFixed(3)) : 0; }
    async playerPosZ(){ await this._ensureInitialized(); return this.player ? Number(this.player.position.z.toFixed(3)) : 0; }

    // Reporter: return JSON array of instance IDs intersecting the player capsule collider
    async playerIntersections(){
      await this._ensureInitialized();
      if (!this.player || !this.player.userData || !this.player.userData.collider) return '[]';
      const coll = this.player.userData.collider;
      const T = this.THREE;
      // Build capsule segment in world space (y-up capsule aligned to world Y)
      const center = this.player.position;
      const lineHalf = Math.max(0, coll.height * 0.5 - coll.radius);
      const a = new T.Vector3(center.x, center.y - lineHalf, center.z);
      const b = new T.Vector3(center.x, center.y + lineHalf, center.z);
      const r = coll.radius;
      const r2 = r * r;
      // Broadphase capsule AABB
      const capMin = new T.Vector3(Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.min(a.z, b.z) - r);
      const capMax = new T.Vector3(Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, Math.max(a.z, b.z) + r);
      const capAABB = new T.Box3(capMin, capMax);

      const tmpBox = new T.Box3();
      const triA = new T.Vector3();
      const triB = new T.Vector3();
      const triC = new T.Vector3();

      const results = [];
      for (const [id, obj] of this.objects){
        if (!obj || !obj.isMesh) continue;
        if (obj === this.player) continue;
        const geom = obj.geometry;
        if (!geom || (!geom.index && !geom.attributes?.position)) continue;

        // World AABB broadphase
        if (!geom.boundingBox) geom.computeBoundingBox();
        obj.updateWorldMatrix(true, false);
        tmpBox.copy(geom.boundingBox).applyMatrix4(obj.matrixWorld);
        if (!tmpBox.intersectsBox(capAABB)) continue;

        // Detailed triangle test
        const positions = geom.attributes.position.array;
        const index = geom.index ? geom.index.array : null;
        const triCount = index ? (index.length / 3) : (positions.length / 9);

        let hit = false;
        for (let i = 0; i < triCount; i++){
          let i0, i1, i2;
          if (index){
            i0 = index[i*3] * 3; i1 = index[i*3+1] * 3; i2 = index[i*3+2] * 3;
          } else {
            i0 = i*9; i1 = i0 + 3; i2 = i0 + 6;
          }
          triA.set(positions[i0], positions[i0+1], positions[i0+2]).applyMatrix4(obj.matrixWorld);
          triB.set(positions[i1], positions[i1+1], positions[i1+2]).applyMatrix4(obj.matrixWorld);
          triC.set(positions[i2], positions[i2+1], positions[i2+2]).applyMatrix4(obj.matrixWorld);

          if (this._capsuleIntersectsTriangle(a, b, r2, triA, triB, triC)) { hit = true; break; }
        }

        if (hit) results.push(id);
      }

      return JSON.stringify(results);
    }

    // Exact capsule-triangle intersection via segment-triangle distance test
    _capsuleIntersectsTriangle(segA, segB, radiusSq, tA, tB, tC){
      const T = this.THREE;
      // If the segment intersects the triangle plane inside the triangle => distance 0
      const u = new T.Vector3().subVectors(segB, segA);
      const ab = new T.Vector3().subVectors(tB, tA);
      const ac = new T.Vector3().subVectors(tC, tA);
      const n = new T.Vector3().crossVectors(ab, ac);
      const denom = n.dot(u);
      if (Math.abs(denom) > 1e-8){
        const t = n.dot(new T.Vector3().subVectors(tA, segA)) / denom;
        if (t >= 0 && t <= 1){
          const q = new T.Vector3().copy(u).multiplyScalar(t).add(segA);
          // Barycentric test: point inside triangle?
          if (this._pointInTriangle(q, tA, tB, tC)) return true; // distance 0 <= r
        }
      }
      // Otherwise check distance to triangle edges (segment-segment distance)
      const edges = [[tA,tB],[tB,tC],[tC,tA]];
      for (let k=0;k<3;k++){
        const e0 = edges[k][0], e1 = edges[k][1];
        const d2 = this._segmentSegmentDistanceSq(segA, segB, e0, e1);
        if (d2 <= radiusSq) return true;
      }
      // Also check distance from segment endpoints to triangle interior (closest point on triangle)
      const tri = new T.Triangle(tA, tB, tC);
      const cp = new T.Vector3();
      tri.closestPointToPoint(segA, cp);
      if (cp.distanceToSquared(segA) <= radiusSq) return true;
      tri.closestPointToPoint(segB, cp);
      if (cp.distanceToSquared(segB) <= radiusSq) return true;
      return false;
    }

    _pointInTriangle(p, a, b, c){
      const T = this.THREE;
      const v0 = new T.Vector3().subVectors(c, a);
      const v1 = new T.Vector3().subVectors(b, a);
      const v2 = new T.Vector3().subVectors(p, a);
      const dot00 = v0.dot(v0);
      const dot01 = v0.dot(v1);
      const dot02 = v0.dot(v2);
      const dot11 = v1.dot(v1);
      const dot12 = v1.dot(v2);
      const invDenom = 1 / (dot00 * dot11 - dot01 * dot01 + 1e-20);
      const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
      const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
      return (u >= 0) && (v >= 0) && (u + v <= 1);
    }

    _segmentSegmentDistanceSq(p1, q1, p2, q2){
      const T = this.THREE;
      const d1 = new T.Vector3().subVectors(q1, p1);
      const d2 = new T.Vector3().subVectors(q2, p2);
      const r = new T.Vector3().subVectors(p1, p2);
      const a = d1.dot(d1); // |d1|^2
      const e = d2.dot(d2); // |d2|^2
      const f = d2.dot(r);
      let s, t;
      if (a <= 1e-12 && e <= 1e-12){
        return r.dot(r); // both segments degenerate
      }
      if (a <= 1e-12){
        s = 0; t = this._clamp(f / e, 0, 1);
      } else {
        const c = d1.dot(r);
        if (e <= 1e-12){
          t = 0; s = this._clamp(-c / a, 0, 1);
        } else {
          const b = d1.dot(d2);
          const denom = a*e - b*b;
          if (denom !== 0){ s = this._clamp((b*f - c*e) / denom, 0, 1); }
          else { s = 0; }
          t = (b*s + f) / e;
          if (t < 0){ t = 0; s = this._clamp(-c / a, 0, 1); }
          else if (t > 1){ t = 1; s = this._clamp((b - c) / a, 0, 1); }
        }
      }
      const c1 = new T.Vector3().copy(d1).multiplyScalar(s).add(p1);
      const c2 = new T.Vector3().copy(d2).multiplyScalar(t).add(p2);
      return c1.distanceToSquared(c2);
    }

    _clamp(x, min, max){ return x < min ? min : (x > max ? max : x); }

    async setCameraPosition(args){
      await this._ensureInitialized();
      const x = Number(args.X) || 0; const y = Number(args.Y) || 0; const z = Number(args.Z) || 0;
      this.camera.position.set(x, y, z);
      if (this._dirLight){
        this._dirLight.position.copy(this.camera.position);
      }
    }

    async setCameraRotation(args){
      await this._ensureInitialized();
      const rx = Number(args.RX) || 0; const ry = Number(args.RY) || 0; const rz = Number(args.RZ) || 0;
      const d2r = Math.PI / 180;
      this.camera.rotation.set(rx * d2r, ry * d2r, rz * d2r);
    }

    async addPointLight(args){
      await this._ensureInitialized();
      const x = Number(args.LX) || 0; const y = Number(args.LY) || 0; const z = Number(args.LZ) || 0;
      const color = args.LC || '#ffffff';
      const intensity = Number(args.LI) || 1;
      const light = new this.THREE.PointLight(color, intensity);
      light.position.set(x, y, z);
      // Apply shadows configuration
      light.castShadow = !!this.shadowsEnabled;
      if (light.castShadow){
        light.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
        light.shadow.bias = -0.0005;
        light.shadow.camera.near = 0.1;
        light.shadow.camera.far = 500;
      }
      this.scene.add(light);
    }

    async enableSkyLight(args){
      await this._ensureInitialized();
      const valStr = String(args.VAL || 'true').toLowerCase();
      const on = valStr === 'true' || valStr === '1' || valStr === 'yes';
      const T = this.THREE;
      if (on){
        if (!this._skyLight){
          // Soft blue sky and subtle ground bounce
          this._skyLight = new T.HemisphereLight(0x87ceeb, 0x404040, 0.6);
          this.scene.add(this._skyLight);
        }
        if (!this._sunLight){
          this._sunLight = new T.DirectionalLight(0xfff2b6, 1.2);
          this._sunLight.position.set(10, 20, 10);
          this._sunLight.target = new T.Object3D();
          this._sunLight.target.position.set(0, 0, 0);
          this.scene.add(this._sunLight.target);
          this.scene.add(this._sunLight);
        }
        // Shadows for sun if globally enabled
        this._sunLight.castShadow = !!this.shadowsEnabled;
        if (this._sunLight.castShadow){
          const size = this.shadowMapSize;
          this._sunLight.shadow.mapSize.set(size, size);
          this._sunLight.shadow.bias = -0.0005;
          const cam = this._sunLight.shadow.camera;
          // Orthographic shadow camera bounds for wide coverage
          cam.left = -30; cam.right = 30; cam.top = 30; cam.bottom = -30;
          cam.near = 0.1; cam.far = 200;
          if (cam.updateProjectionMatrix) cam.updateProjectionMatrix();
        }
      } else {
        if (this._skyLight){ this.scene.remove(this._skyLight); this._skyLight = null; }
        if (this._sunLight){
          this.scene.remove(this._sunLight);
          if (this._sunLight.target) this.scene.remove(this._sunLight.target);
          this._sunLight = null;
        }
      }
      // No auto-render
    }

    async enableShadows(args){
      await this._ensureInitialized();
      const valStr = String(args.VAL || 'true').toLowerCase();
      const on = valStr === 'true' || valStr === '1' || valStr === 'yes';
      this.shadowsEnabled = on;
      this.renderer.shadowMap.enabled = on;
      // Update existing point lights
      this.scene.traverse(o => {
        if (o.isLight && o.isPointLight){
          o.castShadow = on;
          if (on){
            o.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
            o.shadow.bias = o.shadow.bias ?? -0.0005;
            if (o.shadow.camera){ o.shadow.camera.near = 0.1; o.shadow.camera.far = 500; }
          }
        }
        if (o.isMesh){ o.castShadow = on; o.receiveShadow = on; }
      });
      // No auto-render
    }

    async setShadowMapSize(args){
      await this._ensureInitialized();
      const size = parseInt(args.SIZE) || 1024;
      this.shadowMapSize = size;
      // Apply to existing point lights
      this.scene.traverse(o => {
        if (o.isLight && o.isPointLight && o.castShadow){
          o.shadow.mapSize.set(size, size);
        }
      });
      // No auto-render
    }

    async _ensurePostProcessingLoaded(){ /* no external scripts; internal pipeline used */ }

    _initInternalPostFX(){
      if (this._SimpleComposer) return; // already inited
      const T = this.THREE;

      class FullScreenQuad {
        constructor(material){
          this.camera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
          const geo = new T.PlaneGeometry(2, 2);
          this.mesh = new T.Mesh(geo, material);
          this.scene = new T.Scene();
          this.scene.add(this.mesh);
        }
        render(renderer, target){
          renderer.setRenderTarget(target);
          renderer.render(this.scene, this.camera);
        }
        setMaterial(mat){ this.mesh.material = mat; }
      }

      class RenderPass {
        constructor(scene, camera, width, height, THREE){
          this.scene = scene; this.camera = camera; this.THREE = THREE;
          this._makeTarget(width, height);
        }
        _makeTarget(w, h){
          const T = this.THREE;
          const rt = new T.WebGLRenderTarget(w, h, { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, depthBuffer: true });
          rt.depthTexture = new T.DepthTexture(w, h);
          this.target = rt;
        }
        setSize(w,h){ this._makeTarget(w,h); }
        render(renderer, composer){
          renderer.setRenderTarget(this.target);
          renderer.render(this.scene, this.camera);
          composer.currentTexture = this.target.texture;
          composer.depthTexture = this.target.depthTexture;
          composer._camera = this.camera;
        }
      }

      class ShaderPass {
        constructor(material){
          this.material = material;
          this.fsQuad = new FullScreenQuad(material);
          this.renderToScreen = false;
        }
        setSize(){ /* noop */ }
        render(renderer, composer){
          if (this.material.uniforms && this.material.uniforms.tDiffuse && composer.currentTexture){
            this.material.uniforms.tDiffuse.value = composer.currentTexture;
          }
          const target = this.renderToScreen ? null : composer._write;
          this.fsQuad.render(renderer, target);
          if (!this.renderToScreen){
            // swap
            const tmp = composer._read; composer._read = composer._write; composer._write = tmp;
            composer.currentTexture = composer._read.texture;
          }
        }
      }

      class SimpleComposer {
        constructor(renderer, width, height, THREE){
          this.renderer = renderer; this.THREE = THREE;
          this.passes = [];
          this._read = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });
          this._write = this._read.clone();
          this.currentTexture = null;
          this.depthTexture = null;
          this._renderPass = null;
          // copy material for final blit
          this._copyMat = new THREE.ShaderMaterial({
            uniforms: { tDiffuse: { value: null } },
            vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`,
            fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tDiffuse, vUv); }`
          });
          this._copyPass = new ShaderPass(this._copyMat);
          this._copyPass.renderToScreen = true;
        }
        setRenderPass(rp){ this._renderPass = rp; }
        addPass(p){ this.passes.push(p); }
        setSize(w,h){
          this._read.setSize(w,h); this._write.setSize(w,h);
          if (this._renderPass) this._renderPass.setSize(w,h);
          for (const p of this.passes){ if (p.setSize) p.setSize(w,h); }
        }
        render(){
          if (!this._renderPass) return;
          this._renderPass.render(this.renderer, this);
          if (this.passes.length === 0){
            // blit to screen
            this._copyMat.uniforms.tDiffuse.value = this.currentTexture;
            this._copyPass.render(this.renderer, this);
            return;
          }
          // ensure first pass reads from _read (set by renderPass via currentTexture)
          for (let i=0;i<this.passes.length;i++){
            const pass = this.passes[i];
            // last pass should go to screen
            pass.renderToScreen = (i === this.passes.length - 1);
            // update common uniforms
            if (pass.material && pass.material.uniforms){
              if (pass.material.uniforms.resolution){
                pass.material.uniforms.resolution.value.set(1/this._read.width, 1/this._read.height);
              }
              if (pass.material.uniforms.tDepth){
                pass.material.uniforms.tDepth.value = this.depthTexture;
              }
              if (pass.material.uniforms.cameraNear && this._camera){
                pass.material.uniforms.cameraNear.value = this._camera.near;
              }
              if (pass.material.uniforms.cameraFar && this._camera){
                pass.material.uniforms.cameraFar.value = this._camera.far;
              }
              if (pass.material.uniforms.projectionMatrix && this._camera){
                pass.material.uniforms.projectionMatrix.value.copy(this._camera.projectionMatrix);
              }
              if (pass.material.uniforms.inverseProjectionMatrix && this._camera){
                const ip = this._camera.projectionMatrixInverse || new this.THREE.Matrix4().copy(this._camera.projectionMatrix).invert();
                pass.material.uniforms.inverseProjectionMatrix.value.copy(ip);
              }
              if (pass.material.uniforms.noiseScale && this._read){
                pass.material.uniforms.noiseScale.value.set(this._read.width, this._read.height);
              }
            }
            pass.render(this.renderer, this);
          }
        }
      }

      // FXAA material
      const FXAAUniforms = {
        tDiffuse: { value: null },
        resolution: { value: new T.Vector2(1/1, 1/1) },
      };
      const FXAAVS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`;
      const FXAAFS = `
        uniform sampler2D tDiffuse; uniform vec2 resolution; varying vec2 vUv;
        void main(){
          vec2 inv = resolution;
          vec3 rgbNW = texture2D(tDiffuse, vUv + vec2(-1.0,-1.0)*inv).rgb;
          vec3 rgbNE = texture2D(tDiffuse, vUv + vec2( 1.0,-1.0)*inv).rgb;
          vec3 rgbSW = texture2D(tDiffuse, vUv + vec2(-1.0, 1.0)*inv).rgb;
          vec3 rgbSE = texture2D(tDiffuse, vUv + vec2( 1.0, 1.0)*inv).rgb;
          vec3 rgbM  = texture2D(tDiffuse, vUv).rgb;
          vec3 luma = vec3(0.299,0.587,0.114);
          float lumaNW = dot(rgbNW,luma); float lumaNE = dot(rgbNE,luma);
          float lumaSW = dot(rgbSW,luma); float lumaSE = dot(rgbSE,luma);
          float lumaM  = dot(rgbM ,luma);
          float lumaMin = min(lumaM, min(min(lumaNW,lumaNE), min(lumaSW,lumaSE)));
          float lumaMax = max(lumaM, max(max(lumaNW,lumaNE), max(lumaSW,lumaSE)));
          vec2 dir;
          dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
          dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));
          float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * 0.5), 1.0/128.0);
          float rcpDirMin = 1.0/(min(abs(dir.x), abs(dir.y)) + dirReduce);
          dir = clamp(dir * rcpDirMin * inv, -8.0*inv, 8.0*inv);
          vec3 rgbA = 0.5 * (
            texture2D(tDiffuse, vUv + dir * (1.0/3.0 - 0.5)).rgb +
            texture2D(tDiffuse, vUv + dir * (2.0/3.0 - 0.5)).rgb);
          vec3 rgbB = rgbA * 0.5 + 0.25 * (
            texture2D(tDiffuse, vUv + dir * -0.5).rgb +
            texture2D(tDiffuse, vUv + dir * 0.5).rgb);
          float lumaB = dot(rgbB, luma);
          if ( (lumaB < lumaMin) || (lumaB > lumaMax) ) gl_FragColor = vec4(rgbA,1.0);
          else gl_FragColor = vec4(rgbB,1.0);
        }`;

      // True SSAO (kernel sampling in view space)
      const SSAOUniforms = {
        tDiffuse: { value: null },
        tDepth: { value: null },
        resolution: { value: new T.Vector2(1/1, 1/1) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000.0 },
        projectionMatrix: { value: new T.Matrix4() },
        inverseProjectionMatrix: { value: new T.Matrix4() },
        kernel: { value: [] },
        kernelSize: { value: 32 },
        radius: { value: 0.2 },
        bias: { value: 0.025 },
        intensity: { value: 1.0 },
        noiseTexture: { value: null },
        noiseScale: { value: new T.Vector2(1,1) },
      };
      const SSAOVS = FXAAVS;
      const SSAOFS = `
        uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform sampler2D noiseTexture;
        uniform mat4 projectionMatrix; uniform mat4 inverseProjectionMatrix;
        uniform vec2 resolution; uniform vec2 noiseScale; uniform float cameraNear; uniform float cameraFar;
        uniform vec3 kernel[64]; uniform int kernelSize; uniform float radius; uniform float bias; uniform float intensity;
        varying vec2 vUv;
        float linearizeDepth(float z){ float n=cameraNear; float f=cameraFar; return (2.0*n)/(f+n - z*(f-n)); }
        vec3 getViewPosition(vec2 uv){
          float z = texture2D(tDepth, uv).r; float lin = linearizeDepth(z);
          vec2 ndc = uv*2.0-1.0; vec4 clip = vec4(ndc, z*2.0-1.0, 1.0);
          vec4 view = inverseProjectionMatrix * clip; view.xyz /= view.w; return view.xyz;
        }
        vec3 getViewNormal(vec2 uv){
          float dzdx = linearizeDepth(texture2D(tDepth, uv + vec2(1.0,0.0)*resolution).r) - linearizeDepth(texture2D(tDepth, uv - vec2(1.0,0.0)*resolution).r);
          float dzdy = linearizeDepth(texture2D(tDepth, uv + vec2(0.0,1.0)*resolution).r) - linearizeDepth(texture2D(tDepth, uv - vec2(0.0,1.0)*resolution).r);
          vec3 n = normalize(vec3(-dzdx, -dzdy, 1.0)); return n;
        }
        void main(){
          vec3 pos = getViewPosition(vUv);
          vec3 normal = getViewNormal(vUv);
          vec3 rand = texture2D(noiseTexture, vUv * noiseScale).xyz * 2.0 - 1.0;
          vec3 tangent = normalize(rand - normal * dot(rand, normal));
          vec3 bitangent = cross(normal, tangent);
          mat3 TBN = mat3(tangent, bitangent, normal);
          float occlusion = 0.0;
          for(int i=0;i<64;i++){
            if (i>=kernelSize) break;
            vec3 samp = TBN * kernel[i];
            vec3 sampPos = pos + samp * radius;
            vec4 offset = projectionMatrix * vec4(sampPos, 1.0);
            offset.xyz /= offset.w; offset.xy = offset.xy * 0.5 + 0.5;
            float sampleDepth = linearizeDepth(texture2D(tDepth, offset.xy).r);
            float rangeCheck = smoothstep(0.0, 1.0, radius / abs(pos.z - sampleDepth));
            occlusion += (sampleDepth >= sampPos.z + bias ? 1.0 : 0.0) * rangeCheck;
          }
          occlusion = 1.0 - (occlusion / float(kernelSize));
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          gl_FragColor = vec4(col * mix(1.0, occlusion, intensity), 1.0);
        }`;

      this._SimpleComposer = SimpleComposer;
      this._RenderPass = RenderPass;
      this._ShaderPass = ShaderPass;
      this._FXAAMaterial = new T.ShaderMaterial({ uniforms: T.UniformsUtils.clone(FXAAUniforms), vertexShader: FXAAVS, fragmentShader: FXAAFS });
      // Build SSAO kernel and noise
      const kernel = [];
      for (let i=0;i<64;i++){
        const v = new T.Vector3(Math.random()*2-1, Math.random()*2-1, Math.random());
        v.normalize();
        let scale = i/64; scale = 0.1 + 0.9*scale*scale;
        v.multiplyScalar(scale);
        kernel.push(v);
      }
      const noiseSize = 4;
      const noiseData = new Float32Array(noiseSize*noiseSize*3);
      for (let i=0;i<noiseSize*noiseSize;i++){
        noiseData[i*3+0] = Math.random()*2-1;
        noiseData[i*3+1] = Math.random()*2-1;
        noiseData[i*3+2] = 0.0;
      }
      const noiseTex = new T.DataTexture(noiseData, noiseSize, noiseSize, T.RGBFormat, T.FloatType);
      noiseTex.wrapS = noiseTex.wrapT = T.RepeatWrapping; noiseTex.needsUpdate = true;
      this._SSAOMaterial = new T.ShaderMaterial({
        uniforms: T.UniformsUtils.clone(SSAOUniforms), vertexShader: SSAOVS, fragmentShader: SSAOFS
      });
      this._SSAOMaterial.uniforms.kernel.value = kernel;
      this._SSAOMaterial.uniforms.noiseTexture.value = noiseTex;
      this._SSAOMaterial.defines = { MAX_KERNEL_SIZE: 64 };
      this._ssaoKernel = kernel; this._ssaoNoise = noiseTex;
    }

    async setPostProcessing(args){
      await this._ensureInitialized();
      this._initInternalPostFX();
      const val = (s) => {
        const v = String(s || 'true').toLowerCase();
        return v === 'true' || v === '1' || v === 'yes';
      };
      const ssaoOn = val(args.SSAO);
      const fxaaOn = val(args.FXAA);
      const quality = String(args.Q || 'medium');

      const T = this.THREE;

      // Create composer and base render pass (internal)
      if (!this._composer){
        this._composer = new this._SimpleComposer(this.renderer, this.width, this.height, T);
      } else {
        this._composer.passes.length = 0;
      }
      this._renderPass = new this._RenderPass(this.scene, this.camera, this.width, this.height, T);
      this._composer.setRenderPass(this._renderPass);

      // Configure SSAO
      this._ssaoPass = null;
      if (ssaoOn){
        const mat = this._SSAOMaterial.clone();
        if (quality === 'low'){
          mat.uniforms.kernelSize.value = 16; mat.uniforms.radius.value = 0.15; mat.uniforms.intensity.value = 0.8;
        } else if (quality === 'high'){
          mat.uniforms.kernelSize.value = 48; mat.uniforms.radius.value = 0.3; mat.uniforms.intensity.value = 1.2;
        } else {
          mat.uniforms.kernelSize.value = 32; mat.uniforms.radius.value = 0.22; mat.uniforms.intensity.value = 1.0;
        }
        const pass = new this._ShaderPass(mat);
        this._composer.addPass(pass);
        this._ssaoPass = pass;
      }

      // Configure FXAA as last pass
      this._fxaaPass = null;
      if (fxaaOn){
        const fxaaMat = this._FXAAMaterial.clone();
        const fxaa = new this._ShaderPass(fxaaMat);
        this._composer.addPass(fxaa);
        this._fxaaPass = fxaa;
      }

      this._postSSAO = ssaoOn;
      this._postFXAA = fxaaOn;
      this._postQuality = quality;
      this._postEnabled = !!(ssaoOn || fxaaOn);
      // No auto-render
    }

    _fixSmoothShading(){
      this.scene.traverse(o => {
        if (o.isMesh){
          const g = o.geometry;
          if (g && g.isBufferGeometry && (!g.attributes.normal || g.attributes.normal.count === 0)){
            g.computeVertexNormals();
          }
          const apply = (m) => { if (!m) return; if ('flatShading' in m) { m.flatShading = false; m.needsUpdate = true; } };
          if (Array.isArray(o.material)) o.material.forEach(apply); else apply(o.material);
        }
      });
    }

    async setModelCastShadows(args){
      await this._ensureInitialized();
      const id = String(args.ID || 'instance1');
      const valStr = String(args.VAL || 'true').toLowerCase();
      const on = valStr === 'true' || valStr === '1' || valStr === 'yes';
      const obj = this.objects.get(id);
      if (!obj) return;
      obj.castShadow = on;
      // No auto-render
    }

    async setModelReceiveShadows(args){
      await this._ensureInitialized();
      const id = String(args.ID || 'instance1');
      const valStr = String(args.VAL || 'true').toLowerCase();
      const on = valStr === 'true' || valStr === '1' || valStr === 'yes';
      const obj = this.objects.get(id);
      if (!obj) return;
      obj.receiveShadow = on;
      // No auto-render
    }

    async setPointLightsCastShadows(args){
      await this._ensureInitialized();
      const valStr = String(args.VAL || 'true').toLowerCase();
      const on = valStr === 'true' || valStr === '1' || valStr === 'yes';
      this.scene.traverse(o => {
        if (o.isLight && o.isPointLight){
          o.castShadow = on;
          if (on){ o.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize); }
        }
      });
      // No auto-render
    }

    async setReflectionSize(args){
      await this._ensureInitialized();
      const size = Math.max(64, Math.min(2048, parseInt(args.SIZE) || 256));
      
      // Only update if size changed
      if (this._envMapSize === size) return;
      this._envMapSize = size;
      
      // Recreate environment map with new size
      if (this._envMap) {
        this._envMap.dispose();
      }
      
      const T = this.THREE;
      const rt = new T.WebGLCubeRenderTarget(size);
      rt.texture.type = T.HalfFloatType;
      this._envMap = rt.texture;
      
      // Update all materials with the new environment map
      this.scene.traverse((obj) => {
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(mat => {
              if (mat.isMeshStandardMaterial) {
                mat.envMap = this._envMap;
                mat.needsUpdate = true;
              }
            });
          } else if (obj.material.isMeshStandardMaterial) {
            obj.material.envMap = this._envMap;
            obj.material.needsUpdate = true;
          }
        }
      });
      
      this.renderOnce();
    }

    async setDebugMode(args) {
      await this._ensureInitialized();
      const mode = String(args.MODE || 'none');
      this._debugMode = mode;
      
      const T = this.THREE;
      
      // Restore original materials if we're turning off debug mode
      if (mode === 'none') {
        this.scene.traverse(obj => {
          if (obj.isMesh && this._originalMaterials.has(obj.uuid)) {
            const original = this._originalMaterials.get(obj.uuid);
            obj.material = original.material;
            obj.visible = original.visible;
            
            // Remove any debug helpers
            if (obj.boundingBoxHelper) {
              obj.remove(obj.boundingBoxHelper);
              obj.boundingBoxHelper = null;
            }
          }
        });
        this._originalMaterials.clear();
        this.renderOnce();
        return;
      }
      
      // Apply debug materials
      this.scene.traverse(obj => {
        if (!obj.isMesh) return;
        
        // Store original material if not already stored
        if (!this._originalMaterials.has(obj.uuid)) {
          this._originalMaterials.set(obj.uuid, {
            material: obj.material,
            visible: obj.visible
          });
        }
        
        switch(mode) {
          case 'flat':
            obj.material = new T.MeshStandardMaterial({
              color: 0xffffff,
              flatShading: true,
              roughness: 0.8,
              metalness: 0.2
            });
            break;
            
          case 'normals':
            obj.material = new T.MeshNormalMaterial();
            break;
            
          case 'bounds':
            // Show original material but add bounding box
            obj.material = this._originalMaterials.get(obj.uuid).material;
            
            // Remove existing helper if any
            if (obj.boundingBoxHelper) {
              obj.remove(obj.boundingBoxHelper);
            }
            
            // Create new bounding box helper
            const box = new T.Box3().setFromObject(obj);
            const helper = new T.Box3Helper(box, 0x00ff00);
            helper.material.depthTest = false;
            helper.renderOrder = 1; // Make sure it's rendered on top
            obj.add(helper);
            obj.boundingBoxHelper = helper;
            break;
        }
      });
      
      this.renderOnce();
    }
    
    renderOnce(){
      if (!this.initialized) return;
      if (!this.renderer || !this.scene || !this.camera) return;
      this.canvas.style.display = '';
      // Update animation mixers
      if (!this._clock && this.THREE){ this._clock = new this.THREE.Clock(); }
      if (this._clock){
        const dt = this._clock.getDelta();
        for (const [,m] of this.mixers){ if (m) m.update(dt); }
      }
      if (this._composer && this._postEnabled){
        this._composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
    }
    
    _loop(){
      if (!this._renderLoopEnabled) return;
      this.renderOnce();
      this._animHandle = requestAnimationFrame(this._loop);
    }

    // Render loop controls removed per minimal API; use render frame instead.
  }

  // Register the extension with TurboWarp / Scratch
  if (typeof Scratch !== 'undefined'){
    Scratch.extensions.register(new ThreeJSExtension(Scratch.vm && Scratch.vm.runtime));
  }

})(typeof Scratch !== 'undefined' ? Scratch : {});

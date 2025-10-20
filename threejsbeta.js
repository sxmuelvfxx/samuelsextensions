(function (Scratch) {
  'use strict';

  // Require unsandboxed mode for DOM and WebGL access
  if (!Scratch.extensions.unsandboxed) {
    throw new Error('ThreeJS extension requires unsandboxed mode. Open TurboWarp with ?unsandboxed or enable unsandboxed extensions.');
  }

  const vm = Scratch.vm;

  // Utility: load a script once
  const loadScriptOnce = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-tw-threejs="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.twThreejs = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load script: ' + src));
    document.head.appendChild(s);
  });

  // Helper: color string (#rrggbb) to integer 0xRRGGBB
  const parseColor = (c) => {
    if (typeof c !== 'string') return 0xffffff;
    const m = c.trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return 0xffffff;
    return parseInt(m[1], 16);
  };

  class ThreeJSExtension {
    constructor() {
      this.threeLoaded = false;
      this.loadersLoaded = false;
      this.autoRender = true;
      this.container = null;
      this.renderer = null;
      this.scene = null;
      this.camera = null;
      this.objects = Object.create(null); // name -> Object3D
      this.animateHandle = null;

      // Default size near Scratch stage size
      this.width = 480;
      this.height = 360;
    }

    getInfo() {
      return {
        id: 'cascadeThreeJSExt',
        name: 'Three.js 3D',
        color1: '#0b3d91',
        color2: '#5f87ff',
        docsURI: 'https://threejs.org/',
        blocks: [
          {
            opcode: 'init',
            blockType: Scratch.BlockType.COMMAND,
            text: 'init ThreeJS',
          },
          {
            opcode: 'setCameraTransform',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set camera pos x [PX] y [PY] z [PZ] rot x [RX] y [RY] z [RZ] (deg)',
            arguments: {
              PX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
              PY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 3 },
              PZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 5 },
              RX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              RY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              RZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            }
          },
          {
            opcode: 'importGLBFromFile',
            blockType: Scratch.BlockType.COMMAND,
            text: 'import GLB (binary) named [NAME] from file',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'model1' }
            }
          },
          {
            opcode: 'setPBRTextureFromFile',
            blockType: Scratch.BlockType.COMMAND,
            text: 'set [MAP] texture on object [NAME] from file',
            arguments: {
              MAP: {
                type: Scratch.ArgumentType.STRING,
                menu: 'pbrMapMenu',
                defaultValue: 'baseColor'
              },
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'model1' }
            }
          },
          {
            opcode: 'collisionsOf',
            blockType: Scratch.BlockType.REPORTER,
            text: 'collisions of [NAME] (JSON)',
            arguments: {
              NAME: { type: Scratch.ArgumentType.STRING, defaultValue: 'player' }
            }
          },
          {
            opcode: 'raycast',
            blockType: Scratch.BlockType.REPORTER,
            text: 'raycast from x [OX] y [OY] z [OZ] dir x [DX] y [DY] z [DZ] (JSON)',
            arguments: {
              OX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              OY: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1 },
              OZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DX: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              DY: { type: Scratch.ArgumentType.NUMBER, defaultValue: -1 },
              DZ: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
            }
          },
        ]
        ,menus: {
          pbrMapMenu: {
            acceptReporters: true,
            items: ['baseColor','normal','metalness','roughness','ao','emissive']
          }
        }
      };
    }

    async ensureThree() {
      if (this.threeLoaded && window.THREE) return;
      await loadScriptOnce('https://unpkg.com/three@0.160.0/build/three.min.js');
      if (!window.THREE) throw new Error('THREE failed to load');
      this.threeLoaded = true;
    }

    async ensureLoaders() {
      if (this.loadersLoaded && window.THREE && THREE.GLTFLoader) return;
      await this.ensureThree();
      // Load GLTFLoader (+ DRACOLoader + KTX2Loader) for broad GLB support
      await loadScriptOnce('https://unpkg.com/three@0.160.0/examples/js/loaders/GLTFLoader.js');
      await loadScriptOnce('https://unpkg.com/three@0.160.0/examples/js/loaders/DRACOLoader.js');
      await loadScriptOnce('https://unpkg.com/three@0.160.0/examples/js/loaders/KTX2Loader.js');
      if (!THREE.GLTFLoader) throw new Error('GLTFLoader failed to load');
      if (!THREE.DRACOLoader) console.warn('DRACOLoader not available; Draco-compressed GLB may fail to load.');
      if (!THREE.KTX2Loader) console.warn('KTX2Loader not available; KTX2 textures may fail to load.');
      this.loadersLoaded = true;
    }

    ensureContainer() {
      if (this.container) return;
      const container = document.createElement('div');
      container.id = 'tw-threejs-container';
      container.style.position = 'absolute';
      container.style.right = '8px';
      container.style.bottom = '8px';
      container.style.zIndex = '1000';
      container.style.border = '1px solid #444';
      container.style.background = '#000';
      container.style.width = this.width + 'px';
      container.style.height = this.height + 'px';
      container.style.overflow = 'hidden';
      container.style.borderRadius = '6px';
      container.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';

      // Place within editor area if available
      const app = document.querySelector('#app') || document.body;
      app.appendChild(container);
      this.container = container;
    }

    startAnimationLoop() {
      if (this.animateHandle) return; // already running
      const loop = () => {
        if (!this.renderer || !this.scene || !this.camera) return;
        this.renderer.render(this.scene, this.camera);
        this.animateHandle = requestAnimationFrame(loop);
      };
      this.animateHandle = requestAnimationFrame(loop);
    }

    stopAnimationLoop() {
      if (this.animateHandle) {
        cancelAnimationFrame(this.animateHandle);
        this.animateHandle = null;
      }
    }

    async init() {
      await this.ensureThree();
      this.ensureContainer();

      // Clean up previous renderer if any
      if (this.renderer) {
        try { this.renderer.dispose && this.renderer.dispose(); } catch (e) {}
        if (this.renderer.domElement && this.renderer.domElement.parentElement) {
          this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
      }

      // Create renderer
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.renderer.setSize(this.width, this.height);
      // Ensure correct color space for PBR
      if (THREE.SRGBColorSpace) {
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else if (THREE.sRGBEncoding) {
        this.renderer.outputEncoding = THREE.sRGBEncoding; // legacy
      }
      this.container.appendChild(this.renderer.domElement);

      // Scene and camera
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x000000);

      const aspect = this.width / this.height;
      this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
      this.camera.position.set(3, 3, 5);
      this.camera.lookAt(0, 0, 0);

      // Lighting
      const ambient = new THREE.AmbientLight(0xffffff, 0.6);
      this.scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 0.8);
      dir.position.set(5, 10, 7);
      this.scene.add(dir);

      // Start loop
      this.startAnimationLoop();
    }

    setCameraTransform(args) {
      if (!this.camera) return;
      const px = Number(args.PX) || 0;
      const py = Number(args.PY) || 0;
      const pz = Number(args.PZ) || 0;
      const rx = ((Number(args.RX) || 0) * Math.PI) / 180;
      const ry = ((Number(args.RY) || 0) * Math.PI) / 180;
      const rz = ((Number(args.RZ) || 0) * Math.PI) / 180;
      this.camera.position.set(px, py, pz);
      this.camera.rotation.set(rx, ry, rz);
      this.camera.updateProjectionMatrix();
    }

    async importGLBFromFile(args) {
      await this.ensureLoaders();
      if (!this.scene) await this.init();

      const name = String(args.NAME || 'model1');

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.glb,model/gltf-binary';

      return new Promise((resolve, reject) => {
        input.onchange = () => {
          const file = input.files && input.files[0];
          if (!file) {
            resolve();
            return;
          }
          const reader = new FileReader();
          reader.onerror = (e) => reject(new Error('Failed to read file.'));
          reader.onload = () => {
            const arrayBuffer = reader.result;
            try {
              const loader = new THREE.GLTFLoader();
              // Hook up optional decoders/transcoders
              if (THREE.DRACOLoader) {
                const draco = new THREE.DRACOLoader();
                // Use CDN decoder files
                draco.setDecoderPath('https://unpkg.com/three@0.160.0/examples/js/libs/draco/');
                loader.setDRACOLoader(draco);
              }
              if (THREE.KTX2Loader) {
                const ktx2 = new THREE.KTX2Loader();
                // Use CDN transcoder files
                ktx2.setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/');
                ktx2.detectSupport(this.renderer);
                loader.setKTX2Loader(ktx2);
              }
              // For local ArrayBuffer, use parse
              loader.parse(
                arrayBuffer,
                '',
                (gltf) => {
                  const root = gltf.scene || gltf.scenes?.[0];
                  if (!root) { resolve(); return; }
                  root.name = name;
                  this.scene.add(root);
                  // Index objects by unique names
                  this._indexObjects(root, name);
                  resolve();
                },
                (err) => {
                  console.error(err);
                  reject(new Error('Failed to parse GLB/GLTF.'));
                }
              );
            } catch (err) {
              reject(err);
            }
          };
          reader.readAsArrayBuffer(file);
        };
        // Trigger the file dialog
        input.click();
      });
    }

    _indexObjects(root, baseName) {
      let counter = 0;
      root.traverse((obj) => {
        if (!obj.isObject3D) return;
        let objName = obj.name && obj.name.trim() ? obj.name.trim() : `${baseName}_${counter++}`;
        // Ensure uniqueness
        while (this.objects[objName]) {
          objName = `${objName}_${Math.floor(Math.random()*1000)}`;
        }
        obj.name = objName;
        this.objects[objName] = obj;
      });
    }

    async setPBRTextureFromFile(args) {
      const mapKey = String(args.MAP || 'baseColor');
      const name = String(args.NAME || '').trim();
      const obj = this.objects[name];
      if (!obj) return;

      // Find a mesh and its material under this object
      let targetMesh = null;
      if (obj.isMesh) targetMesh = obj; else obj.traverse((o)=>{ if (!targetMesh && o.isMesh) targetMesh = o; });
      if (!targetMesh) return;

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      return new Promise((resolve) => {
        input.onchange = () => {
          const file = input.files && input.files[0];
          if (!file) { resolve(); return; }
          const url = URL.createObjectURL(file);
          const loader = new THREE.TextureLoader();
          loader.load(url, (tex) => {
            // Set encoding depending on map type
            if (mapKey === 'baseColor' || mapKey === 'emissive') {
              if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding; // legacy
              if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace; // newer
            }
            // Match glTF conventions
            tex.flipY = false;
            tex.needsUpdate = true;

            let mat = targetMesh.material;
            if (Array.isArray(mat)) mat = mat[0];
            if (!mat || !(mat instanceof THREE.MeshStandardMaterial)) {
              mat = new THREE.MeshStandardMaterial();
              targetMesh.material = mat;
            }

            switch (mapKey) {
              case 'baseColor': mat.map = tex; break;
              case 'normal': mat.normalMap = tex; break;
              case 'metalness': mat.metalnessMap = tex; break;
              case 'roughness': mat.roughnessMap = tex; break;
              case 'ao': mat.aoMap = tex; break;
              case 'emissive': mat.emissiveMap = tex; mat.emissive.set(0xffffff); break;
              default: mat.map = tex; break;
            }
            mat.needsUpdate = true;
            URL.revokeObjectURL(url);
            resolve();
          }, undefined, () => {
            URL.revokeObjectURL(url);
            resolve();
          });
        };
        input.click();
      });
    }

    // Compute world-space AABB for an object (union of descendant meshes)
    _computeWorldAABB(obj) {
      const box = new THREE.Box3();
      let hasAny = false;
      const tempBox = new THREE.Box3();
      obj.updateWorldMatrix(true, true);
      obj.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const geom = o.geometry;
        if (!geom.boundingBox) geom.computeBoundingBox();
        tempBox.copy(geom.boundingBox).applyMatrix4(o.matrixWorld);
        if (!hasAny) {
          box.copy(tempBox);
          hasAny = true;
        } else {
          box.union(tempBox);
        }
      });
      return hasAny ? box : null;
    }

    collisionsOf(args) {
      const name = String(args.NAME || '').trim();
      const target = this.objects[name];
      if (!target || !this.scene) return '[]';
      this.scene.updateMatrixWorld(true);
      const targetBox = this._computeWorldAABB(target);
      if (!targetBox) return '[]';
      const hits = [];
      for (const [otherName, otherObj] of Object.entries(this.objects)) {
        if (otherName === name) continue;
        const otherBox = this._computeWorldAABB(otherObj);
        if (!otherBox) continue;
        if (targetBox.intersectsBox(otherBox)) hits.push(otherName);
      }
      try { return JSON.stringify(hits); } catch { return '[]'; }
    }

    raycast(args) {
      if (!this.scene || !this.camera) return '[]';
      const ox = Number(args.OX) || 0;
      const oy = Number(args.OY) || 0;
      const oz = Number(args.OZ) || 0;
      let dx = Number(args.DX) || 0;
      let dy = Number(args.DY) || 0;
      let dz = Number(args.DZ) || 0;
      const dir = new THREE.Vector3(dx, dy, dz);
      if (dir.lengthSq() === 0) return '[]';
      dir.normalize();
      const origin = new THREE.Vector3(ox, oy, oz);

      const raycaster = new THREE.Raycaster();
      raycaster.set(origin, dir);
      // Intersect all meshes recursively
      const intersects = raycaster.intersectObjects(this.scene.children, true);
      const result = intersects.map((hit) => ({
        name: hit.object && hit.object.name ? hit.object.name : '',
        x: Number(hit.point.x.toFixed(6)),
        y: Number(hit.point.y.toFixed(6)),
        z: Number(hit.point.z.toFixed(6)),
        distance: Number(hit.distance.toFixed(6))
      }));
      try { return JSON.stringify(result); } catch { return '[]'; }
    }
  }

  Scratch.extensions.register(new ThreeJSExtension());

})(Scratch);

(function (Scratch) {
  'use strict';

  class PerlinNoise {
    constructor(seed = 0) {
      this.seed(seed);
    }

    seed(seed) {
      this.p = new Uint8Array(512);
      const perm = new Uint8Array(256);
      for (let i = 0; i < 256; i++) perm[i] = i;

      let n, q;
      for (let i = 255; i > 0; i--) {
        n = Math.floor((seed = (seed * 16807) % 2147483647) / 2147483647 * (i + 1));
        q = perm[i];
        perm[i] = perm[n];
        perm[n] = q;
      }

      for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
    }

    fade(t) {
      return t * t * t * (t * (t * 6 - 15) + 10);
    }

    lerp(t, a, b) {
      return a + t * (b - a);
    }

    grad(hash, x, y) {
      const h = hash & 3;
      const u = h < 2 ? x : y;
      const v = h < 2 ? y : x;
      return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise(x, y) {
      const X = Math.floor(x) & 255;
      const Y = Math.floor(y) & 255;

      x -= Math.floor(x);
      y -= Math.floor(y);

      const u = this.fade(x);
      const v = this.fade(y);

      const p = this.p;

      const A = p[X] + Y;
      const B = p[X + 1] + Y;

      return this.lerp(v,
        this.lerp(u, this.grad(p[A], x, y), this.grad(p[B], x - 1, y)),
        this.lerp(u, this.grad(p[A + 1], x, y - 1), this.grad(p[B + 1], x - 1, y - 1))
      ) * 0.5 + 0.5; // normalize to [0,1]
    }
  }

  class PerlinExtension {
    getInfo() {
      return {
        id: 'perlinNoiseSimple',
        name: 'Perlin Noise',
        color1: '#4B8B3B',
        blocks: [
          {
            opcode: 'noiseXY',
            blockType: Scratch.BlockType.REPORTER,
            text: 'noise at x [X] y [Y] with scale [SCALE] and seed [SEED]',
            arguments: {
              X: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              Y: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0 },
              SCALE: { type: Scratch.ArgumentType.NUMBER, defaultValue: 0.1 },
              SEED: { type: Scratch.ArgumentType.NUMBER, defaultValue: 1234 }
            }
          }
        ]
      };
    }

    noiseXY(args) {
      const x = Number(args.X);
      const y = Number(args.Y);
      const scale = Number(args.SCALE);
      const seed = Number(args.SEED);

      const perlin = new PerlinNoise(seed);
      return perlin.noise(x * scale, y * scale);
    }
  }

  Scratch.extensions.register(new PerlinExtension());
})(Scratch);

class AdvancedLighting {
    getInfo() {
        return {
            id: 'advancedLighting',
            name: 'Advanced Lighting',
            color1: '#f39c12',
            color2: '#e67e22',
            blocks: [
                {
                    opcode: 'vertexLightFlatSafe',
                    blockType: 'reporter',
                    text: 'Vertex Flat Light yaw [YAW] pitch [PITCH] triangle verts [V1X] [V1Y] [V1Z] [V2X] [V2Y] [V2Z] [V3X] [V3Y] [V3Z] vertex [VERTEX] light RGB [LR] [LG] [LB] ambient RGB [AR] [AG] [AB]',
                    arguments: {
                        YAW: { type: 'number', defaultValue: 0 },
                        PITCH: { type: 'number', defaultValue: 0 },
                        V1X: { type: 'number', defaultValue: 0 },
                        V1Y: { type: 'number', defaultValue: 0 },
                        V1Z: { type: 'number', defaultValue: 0 },
                        V2X: { type: 'number', defaultValue: 0 },
                        V2Y: { type: 'number', defaultValue: 0 },
                        V2Z: { type: 'number', defaultValue: 0 },
                        V3X: { type: 'number', defaultValue: 0 },
                        V3Y: { type: 'number', defaultValue: 0 },
                        V3Z: { type: 'number', defaultValue: 0 },
                        VERTEX: { type: 'number', defaultValue: 1, menu: 'vertexMenu' },
                        LR: { type: 'number', defaultValue: 255 },
                        LG: { type: 'number', defaultValue: 255 },
                        LB: { type: 'number', defaultValue: 255 },
                        AR: { type: 'number', defaultValue: 50 },
                        AG: { type: 'number', defaultValue: 50 },
                        AB: { type: 'number', defaultValue: 50 }
                    }
                }
            ],
            menus: {
                vertexMenu: { items: ['1','2','3'] }
            }
        };
    }

    yawPitchToDir(yaw, pitch) {
        const radYaw = yaw * Math.PI / 180;
        const radPitch = pitch * Math.PI / 180;
        const x = Math.cos(radPitch) * Math.sin(radYaw);
        const y = Math.sin(radPitch);
        const z = Math.cos(radPitch) * Math.cos(radYaw);
        const len = Math.sqrt(x*x + y*y + z*z);
        return [x/len, y/len, z/len];
    }

    vertexLightFlatSafe(args) {
        const v1 = [args.V1X, args.V1Y, args.V1Z];
        const v2 = [args.V2X, args.V2Y, args.V2Z];
        const v3 = [args.V3X, args.V3Y, args.V3Z];

        // Triangle edges
        const edge1 = [v2[0]-v1[0], v2[1]-v1[1], v2[2]-v1[2]];
        const edge2 = [v3[0]-v1[0], v3[1]-v1[1], v3[2]-v1[2]];

        // Triangle normal (cross product)
        let nx = edge1[1]*edge2[2]-edge1[2]*edge2[1];
        let ny = edge1[2]*edge2[0]-edge1[0]*edge2[2];
        let nz = edge1[0]*edge2[1]-edge1[1]*edge2[0];

        const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
        if(nLen === 0) {
            // Degenerate triangle fallback
            nx = 0; ny = 0; nz = 1;
        } else {
            nx /= nLen; ny /= nLen; nz /= nLen;
        }

        const normal = [nx, ny, nz];
        const L = this.yawPitchToDir(args.YAW, args.PITCH);

        // Diffuse factor
        let diff = normal[0]*L[0] + normal[1]*L[1] + normal[2]*L[2];
        diff = Math.max(0, Math.min(diff,1));

        // Light + ambient
        const r = diff*args.LR + args.AR;
        const g = diff*args.LG + args.AG;
        const b = diff*args.LB + args.AB;

        // Clamp final RGB to 0-255
        const R = Math.min(Math.max(Math.round(r),0),255);
        const G = Math.min(Math.max(Math.round(g),0),255);
        const B = Math.min(Math.max(Math.round(b),0),255);

        return R*65536 + G*256 + B;
    }
}

Scratch.extensions.register(new AdvancedLighting());

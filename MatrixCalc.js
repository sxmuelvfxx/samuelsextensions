class MatrixTransformJSONFull {
    constructor(runtime) {
        this.runtime = runtime;
    }

    getInfo() {
        return {
            id: 'matrixTransformJSONFull',
            name: 'Matrix Transform Full',
            color1: '#2980b9',
            color2: '#3498db',
            blocks: [
                {
                    opcode: 'transformTriangleJSON',
                    blockType: 'reporter',
                    text: 'Transform triangle verts [V1X] [V1Y] [V1Z] [V2X] [V2Y] [V2Z] [V3X] [V3Y] [V3Z] cam pos [CX] [CY] [CZ] cam rot [CRX] [CRY] [CRZ] FOV [FOV] obj pos [OX] [OY] [OZ] obj rot [ORX] [ORY] [ORZ] obj scale [S]',
                    arguments: {
                        V1X: { type: 'number', defaultValue: -500 },
                        V1Y: { type: 'number', defaultValue: 0 },
                        V1Z: { type: 'number', defaultValue: 0 },
                        V2X: { type: 'number', defaultValue: 500 },
                        V2Y: { type: 'number', defaultValue: 0 },
                        V2Z: { type: 'number', defaultValue: 0 },
                        V3X: { type: 'number', defaultValue: 0 },
                        V3Y: { type: 'number', defaultValue: 500 },
                        V3Z: { type: 'number', defaultValue: 0 },
                        CX: { type: 'number', defaultValue: 0 },
                        CY: { type: 'number', defaultValue: 0 },
                        CZ: { type: 'number', defaultValue: -1000 },
                        CRX: { type: 'number', defaultValue: 0 },
                        CRY: { type: 'number', defaultValue: 0 },
                        CRZ: { type: 'number', defaultValue: 0 },
                        FOV: { type: 'number', defaultValue: 60 },
                        OX: { type: 'number', defaultValue: 0 },
                        OY: { type: 'number', defaultValue: 0 },
                        OZ: { type: 'number', defaultValue: 0 },
                        ORX: { type: 'number', defaultValue: 0 },
                        ORY: { type: 'number', defaultValue: 0 },
                        ORZ: { type: 'number', defaultValue: 0 },
                        S: { type: 'number', defaultValue: 1 }
                    }
                }
            ]
        };
    }

    degToRad(deg) { return deg * Math.PI / 180; }

    rotateXYZ(v, rx, ry, rz) {
        const cx = Math.cos(rx), sx = Math.sin(rx);
        const cy = Math.cos(ry), sy = Math.sin(ry);
        const cz = Math.cos(rz), sz = Math.sin(rz);

        let x1 = v[0], y1 = v[1] * cx - v[2] * sx, z1 = v[1] * sx + v[2] * cx;
        let x2 = x1 * cy + z1 * sy, y2 = y1, z2 = -x1 * sy + z1 * cy;
        let x3 = x2 * cz - y2 * sz, y3 = x2 * sz + y2 * cz, z3 = z2;
        return [x3, y3, z3];
    }

    transformTriangleJSON(args) {
        try {
            // Original vertices
            const verts = [
                [args.V1X, args.V1Y, args.V1Z],
                [args.V2X, args.V2Y, args.V2Z],
                [args.V3X, args.V3Y, args.V3Z]
            ];

            // Compute triangle area to skip degenerate triangles
            const e1 = [verts[1][0]-verts[0][0], verts[1][1]-verts[0][1], verts[1][2]-verts[0][2]];
            const e2 = [verts[2][0]-verts[0][0], verts[2][1]-verts[0][1], verts[2][2]-verts[0][2]];
            const nLen = Math.hypot(
                e1[1]*e2[2]-e1[2]*e2[1],
                e1[2]*e2[0]-e1[0]*e2[2],
                e1[0]*e2[1]-e1[1]*e2[0]
            );

            if (!isFinite(nLen) || Math.abs(nLen) < 1e-12) return JSON.stringify({error:'degenerate triangle'});

            const rxObj = this.degToRad(args.ORX);
            const ryObj = this.degToRad(args.ORY);
            const rzObj = this.degToRad(args.ORZ);
            const rxCam = this.degToRad(args.CRX);
            const ryCam = this.degToRad(args.CRY);
            const rzCam = this.degToRad(args.CRZ);

            const fovScale = Math.tan(this.degToRad(args.FOV*0.5)) * 2; // just for reference

            const outVerts = [];

            for (const v of verts) {
                // Object transform: scale + rotation + position
                let [vx, vy, vz] = [v[0]*args.S, v[1]*args.S, v[2]*args.S];
                [vx, vy, vz] = this.rotateXYZ([vx, vy, vz], rxObj, ryObj, rzObj);
                vx += args.OX; vy += args.OY; vz += args.OZ;

                // Camera transform: subtract cam pos and rotate by inverse
                vx -= args.CX; vy -= args.CY; vz -= args.CZ;
                [vx, vy, vz] = this.rotateXYZ([vx, vy, vz], -rxCam, -ryCam, -rzCam);

                // Safe numbers
                vx = isFinite(vx) ? vx : 0;
                vy = isFinite(vy) ? vy : 0;
                vz = isFinite(vz) ? vz : 0;

                outVerts.push(parseFloat(vx.toFixed(4)), parseFloat(vy.toFixed(4)), parseFloat(vz.toFixed(4)));
            }

            return JSON.stringify(outVerts);

        } catch(e) {
            return JSON.stringify({error: e.message});
        }
    }
}

Scratch.extensions.register(new MatrixTransformJSONFull());

class AdvancedGeometry {
    getInfo() {
        return {
            id: 'advancedGeometry',
            name: 'Advanced Geometry',
            color1: '#4a90e2',
            color2: '#357ABD',
            blocks: [
                {
                    opcode: 'triangleArea',
                    blockType: 'reporter',
                    text: 'Area of triangle ([X1],[Y1]) ([X2],[Y2]) ([X3],[Y3])',
                    arguments: {
                        X1: { type: 'number', defaultValue: 0 },
                        Y1: { type: 'number', defaultValue: 0 },
                        X2: { type: 'number', defaultValue: 1 },
                        Y2: { type: 'number', defaultValue: 0 },
                        X3: { type: 'number', defaultValue: 0 },
                        Y3: { type: 'number', defaultValue: 1 }
                    }
                },
                {
                    opcode: 'triangleDot',
                    blockType: 'reporter',
                    text: 'Dot product of triangle ([X1],[Y1],[Z1]) ([X2],[Y2],[Z2]) ([X3],[Y3],[Z3]) with vector ([VX],[VY],[VZ])',
                    arguments: {
                        X1: { type: 'number', defaultValue: 0 },
                        Y1: { type: 'number', defaultValue: 0 },
                        Z1: { type: 'number', defaultValue: 0 },
                        X2: { type: 'number', defaultValue: 1 },
                        Y2: { type: 'number', defaultValue: 0 },
                        Z2: { type: 'number', defaultValue: 0 },
                        X3: { type: 'number', defaultValue: 0 },
                        Y3: { type: 'number', defaultValue: 1 },
                        Z3: { type: 'number', defaultValue: 0 },
                        VX: { type: 'number', defaultValue: 0 },
                        VY: { type: 'number', defaultValue: 0 },
                        VZ: { type: 'number', defaultValue: 1 }
                    }
                }
            ]
        };
    }

    triangleArea({X1,Y1,X2,Y2,X3,Y3}) {
        const area = Math.abs((X1*(Y2-Y3) + X2*(Y3-Y1) + X3*(Y1-Y2)) / 2);
        return Math.round(area);
    }

    triangleDot({X1,Y1,Z1,X2,Y2,Z2,X3,Y3,Z3,VX,VY,VZ}) {
        const U = [X2-X1, Y2-Y1, Z2-Z1];
        const V = [X3-X1, Y3-Y1, Z3-Z1];
        const Nx = U[1]*V[2] - U[2]*V[1];
        const Ny = U[2]*V[0] - U[0]*V[2];
        const Nz = U[0]*V[1] - U[1]*V[0];
        return Nx*VX + Ny*VY + Nz*VZ;
    }
}

Scratch.extensions.register(new AdvancedGeometry());

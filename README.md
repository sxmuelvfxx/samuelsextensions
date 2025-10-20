# TurboWarp 3D Extensions

This repository contains several experimental TurboWarp extensions written in JavaScript.  
They provide tools for 3D rendering, lighting, geometry, and math operations, mostly using Three.js.

## Extensions

### threejsbeta.js
An experimental Three.js-based 3D renderer for TurboWarp.  
Currently not fully functional and under development.

### advancedsorting.js
A wrapper for array sorting that supports pointer-based sorting.  
Allows you to sort arrays while keeping track of their original indices.

### advancedlighting.js
Implements a simple flat lighting system using triangle vertices and a sun position.  
Lighting is calculated using dot products between surface normals and light direction.

### advancedgeometry.js
Provides fast geometry calculations, including dot product and triangle area functions.  
Useful for 3D math and vector operations inside TurboWarp.

### matrixcalc.js
Contains matrix calculation utilities for rotations and 3D transformations.  
Helps with matrix-based math operations in 3D environments.

## Usage

1. Open the [TurboWarp Editor](https://turbowarp.org/editor)
2. Click **Extensions → Add Extension**
3. Load the file
4. You might need to toggle Run Unsandboxed for some or they wont work

##License

You can do whatever you want with these files.

Use them, edit them, share them, modify them, include them in your own projects — no credit or permission required.

If you feel like it, a link back to my GitHub would be appreciated, but it’s not required.

This software is provided "as is", without any warranty of any kind.

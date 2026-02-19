import { vec3 } from 'gl-matrix';
import { MapInstance } from './maps.js';
import { ModelInstance } from './models.js';
import { Shape } from './shapes.js';

// A simple triangle collision checker
export class CollisionManager {
    constructor(private mapInstance: MapInstance) {}

    // Returns TRUE if the position is safe (no wall), FALSE if hitting a wall.
    public checkCollision(x: number, y: number, z: number, radius: number = 5): boolean {
        // 1. Find which block the player is in
        // Blocks are typically 640x640 units
        // We check the block we are in, plus neighbors to be safe
        const bx = Math.floor(x / 640);
        const bz = Math.floor(z / 640);

        // Check 3x3 grid of blocks around player
        for (let cz = bz - 1; cz <= bz + 1; cz++) {
            for (let cx = bx - 1; cx <= bx + 1; cx++) {
                const block = this.mapInstance.getBlockAtPosition(cx * 640, cz * 640);
                if (!block) continue;

                // Check collision against this block's models
                if (this.checkBlockCollision(block, cx, cz, x, y, z, radius)) {
                    return false; // HIT A WALL!
                }
            }
        }

        return true; // No collision found
    }

    private checkBlockCollision(block: ModelInstance, bx: number, bz: number, px: number, py: number, pz: number, radius: number): boolean {
        // Calculate block offset in world space
        const blockOffsetX = bx * 640;
        const blockOffsetZ = bz * 640;

        // Player position relative to the block
        const localX = px - blockOffsetX;
        const localZ = pz - blockOffsetZ;
        const localY = py; // Y is usually global or shared

        const shapes = block.model.sharedModelShapes;
        if (!shapes) return false;

        // Iterate over all shape types (Opaque, Transparent, etc.)
        for (const pass of shapes.shapes) {
            for (const shape of pass) {
                if (this.checkShapeCollision(shape, localX, localY, localZ, radius)) {
                    return true;
                }
            }
        }
        return false;
    }

    private checkShapeCollision(shape: Shape, px: number, py: number, pz: number, radius: number): boolean {
        const geom = shape.geom;
        const data = geom.loadedVertexData;
const posData = data.vertexBuffers[0];        


        if (geom.aabb) {
            // Quick AABB check
            if (px < geom.aabb.minX - radius || px > geom.aabb.maxX + radius ||
                py < geom.aabb.minY - radius || py > geom.aabb.maxY + radius ||
                pz < geom.aabb.minZ - radius || pz > geom.aabb.maxZ + radius) {
                return false;
            }
        }

// posData and indexData are already ArrayBuffers, so pass them directly
const view = new DataView(posData);
const indices = new DataView(data.indexData);
        const numIndices = data.totalIndexCount;

        // Iterate triangles
        for (let i = 0; i < numIndices; i += 3) {
            const idx0 = indices.getUint16(i * 2);
            const idx1 = indices.getUint16((i + 1) * 2);
            const idx2 = indices.getUint16((i + 2) * 2);

            // Read 3 vertices (Assume S16 format for SFA, scaled by 1/8 usually? or raw?)
            // SFA positions are usually Int16. We might need to check vertex format.
            // Let's assume standard SFA scaling for now.
            
            const v0 = this.getVertex(view, idx0);
            const v1 = this.getVertex(view, idx1);
            const v2 = this.getVertex(view, idx2);

            if (this.triangleIntersect(v0, v1, v2, px, py, pz, radius)) {
                return true;
            }
        }

        return false;
    }

    private getVertex(view: DataView, index: number): vec3 {
        // SFA vertices are often 6 bytes (X, Y, Z as int16)
        // Stride is usually 6.
        const stride = 6; 
        const offset = index * stride;
        
        // SFA often scales positions. Common scale is 8.0? Or no scale?
        // Let's try raw read first.
        const x = view.getInt16(offset + 0);
        const y = view.getInt16(offset + 2);
        const z = view.getInt16(offset + 4);
        
        return vec3.fromValues(x, y, z);
    }

    // 2D Distance check (Cylinder collision for walking)
    private triangleIntersect(p1: vec3, p2: vec3, p3: vec3, centerx: number, centery: number, centerz: number, radius: number): boolean {
        // 1. Check vertical range (are we roughly at the same height?)
        const minH = Math.min(p1[1], p2[1], p3[1]);
        const maxH = Math.max(p1[1], p2[1], p3[1]);
        
        // Player height (approx 10 units tall cylinder?)
        if (centery > maxH + 10 || centery < minH - 10) return false;

        // 2. Project to 2D (Top-down check for walls)
        return this.testCircleTriangle(
            centerx, centerz, radius,
            p1[0], p1[2],
            p2[0], p2[2],
            p3[0], p3[2]
        );
    }

    private testCircleTriangle(cx: number, cy: number, r: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): boolean {
        // Check if circle overlaps triangle in 2D
        // Closest point on segment logic
        if (this.circleLineIntersect(cx, cy, r, x1, y1, x2, y2)) return true;
        if (this.circleLineIntersect(cx, cy, r, x2, y2, x3, y3)) return true;
        if (this.circleLineIntersect(cx, cy, r, x3, y3, x1, y1)) return true;
        return false; // We ignore "inside" for walls usually, just edges
    }

    private circleLineIntersect(cx: number, cy: number, r: number, x1: number, y1: number, x2: number, y2: number): boolean {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        const t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
        
        const clampT = Math.max(0, Math.min(1, t));
        const closestX = x1 + clampT * dx;
        const closestY = y1 + clampT * dy;
        
        const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;
        return distSq < (r * r);
    }
}
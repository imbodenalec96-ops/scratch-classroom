/**
 * Simple 2D physics engine for block-based physics blocks.
 */
export interface PhysicsBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mass: number;
  friction: number;
  width: number;
  height: number;
  static: boolean;
}

export class PhysicsEngine {
  gravity = 9.8;
  bodies: Map<string, PhysicsBody> = new Map();
  stageWidth = 480;
  stageHeight = 360;

  addBody(id: string, body: Partial<PhysicsBody> & { x: number; y: number }) {
    this.bodies.set(id, {
      vx: 0, vy: 0, mass: 1, friction: 0.1, width: 40, height: 40, static: false,
      ...body,
    });
  }

  removeBody(id: string) {
    this.bodies.delete(id);
  }

  setGravity(g: number) {
    this.gravity = g;
  }

  setVelocity(id: string, vx: number, vy: number) {
    const b = this.bodies.get(id);
    if (b) { b.vx = vx; b.vy = vy; }
  }

  applyForce(id: string, fx: number, fy: number) {
    const b = this.bodies.get(id);
    if (b) { b.vx += fx / b.mass; b.vy += fy / b.mass; }
  }

  step(dt: number = 1 / 60) {
    for (const [_, body] of this.bodies) {
      if (body.static) continue;

      // Gravity
      body.vy += this.gravity * dt * 10;

      // Friction
      body.vx *= (1 - body.friction);
      body.vy *= (1 - body.friction * 0.5);

      // Position
      body.x += body.vx * dt * 10;
      body.y += body.vy * dt * 10;

      // Bounce off edges
      const halfW = body.width / 2;
      const halfH = body.height / 2;
      const minX = -this.stageWidth / 2 + halfW;
      const maxX = this.stageWidth / 2 - halfW;
      const minY = -this.stageHeight / 2 + halfH;
      const maxY = this.stageHeight / 2 - halfH;

      if (body.x < minX) { body.x = minX; body.vx = Math.abs(body.vx) * 0.8; }
      if (body.x > maxX) { body.x = maxX; body.vx = -Math.abs(body.vx) * 0.8; }
      if (body.y < minY) { body.y = minY; body.vy = Math.abs(body.vy) * 0.8; }
      if (body.y > maxY) { body.y = maxY; body.vy = -Math.abs(body.vy) * 0.8; }
    }
  }

  checkCollision(idA: string, idB: string): boolean {
    const a = this.bodies.get(idA);
    const b = this.bodies.get(idB);
    if (!a || !b) return false;
    return (
      Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
      Math.abs(a.y - b.y) < (a.height + b.height) / 2
    );
  }

  getCollisions(id: string): string[] {
    const collisions: string[] = [];
    for (const [otherId] of this.bodies) {
      if (otherId !== id && this.checkCollision(id, otherId)) {
        collisions.push(otherId);
      }
    }
    return collisions;
  }
}

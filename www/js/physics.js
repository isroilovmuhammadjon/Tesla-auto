// Realistic longitudinal car physics shared by the player and the AI rival.
//
// - Traction-limited launch (≈1 g of grip), then power-limited acceleration: a = P / (m·v)
// - Aerodynamic drag ∝ v² and rolling resistance. The car's top speed is exactly where
//   engine power equals drag, so every car tops out at its listed km/h.
// - 6-speed automatic gearbox: RPM follows road speed per gear, shifts near the redline,
//   and drive force is cut for a moment during each shift (you feel and hear the shift).
// - ≈1 g brakes, engine braking when you lift off the throttle.
//
// Reference numbers for a 1.0-accel car with a 300 km/h top speed:
//   0–100 km/h ≈ 3.3 s, 0–200 km/h ≈ 9 s, 100–0 km/h ≈ 2.7 s (≈ 37 m).

export const DRAG_K = 0.00049;   // aero drag coefficient (m⁻¹): a_drag = DRAG_K · v²
export const ROLLING = 0.15;     // rolling resistance (m/s²)
const GEAR_TOP = [0.28, 0.43, 0.58, 0.72, 0.86, 1.0]; // fraction of top speed reached at redline per gear
const IDLE = 900, REDLINE = 7400, SHIFT_UP_RPM = 7250;

export class Powertrain {
  constructor(def) {
    this.def = def;
    this.vmax = def.maxSpeed / 3.6;
    // specific power (W/kg) chosen so that power = drag + rolling exactly at top speed
    this.power = (DRAG_K * this.vmax * this.vmax + ROLLING) * this.vmax;
    this.grip = 9.4 * def.accel;                          // launch traction limit (m/s²)
    this.brakeDecel = 10.2 * (0.9 + 0.12 * def.handling); // ≈ 1 g
    this.shiftTime = 0.22 / def.accel;
    this.gearTop = GEAR_TOP.map((f) => f * this.vmax * 1.04);
    this.reset();
  }

  reset() {
    this.gear = 1;
    this.shiftTimer = 0;
    this.rpm = IDLE;
    this.shifted = 0;    // +1 on an upshift this frame, -1 on a downshift (for sound / body jolt)
  }

  get gearLabel() { return this.gear; }

  rpmFor(v, gear) {
    return IDLE + Math.min(1.05, v / this.gearTop[gear - 1]) * (REDLINE - IDLE);
  }

  // Engine revving with the car standing still (countdown)
  rev(dt, throttle) {
    const target = throttle ? 5800 : IDLE;
    this.rpm += (target - this.rpm) * Math.min(1, dt * (throttle ? 6 : 3));
    this.shifted = 0;
  }

  /**
   * @param dt        seconds
   * @param v         current speed (m/s)
   * @param throttle  0..1
   * @param brake     0..1
   * @param nitro     boolean
   * @param airborne  true for the flying car in the air (no tyre limit, weaker air brakes)
   * @returns longitudinal acceleration (m/s²)
   */
  step(dt, v, throttle, brake, nitro, airborne = false) {
    this.shifted = 0;
    // ---- automatic gearbox
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
    } else if (this.gear < 6 && this.rpmFor(v, this.gear) >= SHIFT_UP_RPM && throttle > 0) {
      this.gear++; this.shiftTimer = this.shiftTime; this.shifted = 1;
    } else if (this.gear > 1 && v < this.gearTop[this.gear - 2] * 0.6) {
      this.gear--; this.shiftTimer = 0.12; this.shifted = -1;
    }
    const shifting = this.shiftTimer > 0;

    // ---- drive force: traction-limited at low speed, power-limited above
    let drive = 0;
    if (throttle > 0 && !shifting) {
      const powerLimited = (this.power * throttle) / Math.max(v, 2.5);
      const tractionLimit = airborne ? this.grip * 1.15 : this.grip;
      drive = Math.min(tractionLimit * throttle, powerLimited);
    }
    if (nitro) drive += 7.5 * Math.max(0, 1 - v / (this.vmax * 1.3)) + 1.5; // nitro also beats drag a bit past top speed

    // ---- resistances
    const drag = DRAG_K * v * v;
    const rolling = airborne || v < 0.05 ? 0 : ROLLING;
    const engineBrake = throttle > 0 ? 0 : 0.55 + v * 0.006;
    const brakes = brake * (airborne ? this.brakeDecel * 0.55 : this.brakeDecel);
    let a = drive - drag - rolling - engineBrake - brakes;
    if (v <= 0 && a < 0) a = 0;

    // ---- RPM (drops during an upshift, follows road speed otherwise)
    const target = v < 1 ? (throttle > 0 ? 2600 : IDLE) : this.rpmFor(v, this.gear);
    this.rpm += (target - this.rpm) * Math.min(1, dt * (shifting ? 18 : 10));
    return a;
  }
}

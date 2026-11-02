/** Browser orientation for prototyping. A wired IMU requires a separate bridge. */
export class MotionInput {
  tilt = 0;
  private listening = false;

  private onOrientation = (event: DeviceOrientationEvent): void => {
    if (typeof event.gamma !== "number") return;
    const normalized = Math.max(-1, Math.min(1, event.gamma / 35));
    const target = Math.abs(normalized) < 0.08 ? 0 : normalized;
    this.tilt += (target - this.tilt) * 0.15;
  };

  async enable(): Promise<string> {
    if (!("DeviceOrientationEvent" in window)) {
      return "Browser motion unavailable";
    }
    const sensorClass = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>;
    };
    try {
      if (sensorClass.requestPermission) {
        const permission = await sensorClass.requestPermission();
        if (permission !== "granted") return "Motion permission denied";
      }
      if (!this.listening) {
        window.addEventListener("deviceorientation", this.onOrientation);
        this.listening = true;
      }
      return "Listening for orientation";
    } catch {
      return "Motion sensor unavailable";
    }
  }
}

export class SeriesBuffer {
  private series: Map<string, number[]> = new Map();

  public push(key: string, value: number) {
    let values = this.series.get(key);
    if (!values) this.series.set(key, (values = []));
    values.push(value);
  }

  // returned arrays go to IPC, so each key gets a fresh one instead of being reused
  public take(): Record<string, number[]> {
    const result: Record<string, number[]> = {};
    this.series.forEach((values, key) => {
      if (values.length === 0) return;
      result[key] = values;
      this.series.set(key, []);
    });
    return result;
  }

  public clear() {
    this.series.clear();
  }
}

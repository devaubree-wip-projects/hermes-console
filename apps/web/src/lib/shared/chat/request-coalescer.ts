export class RequestCoalescer<Key, Value> {
  private readonly inFlight = new Map<Key, Promise<Value>>();

  run(key: Key, request: () => Promise<Value>): Promise<Value> {
    const active = this.inFlight.get(key);
    if (active) return active;

    const pending = request();
    this.inFlight.set(key, pending);

    const clear = () => {
      if (this.inFlight.get(key) === pending) {
        this.inFlight.delete(key);
      }
    };
    void pending.then(clear, clear);

    return pending;
  }
}

class RequestQueue<T> {
  private concurrency: number;
  private active: number;
  private pending: {
    key: string;
    task: () => Promise<T>;
    resolve: (value: T) => void;
    reject: (reason: unknown) => void;
  }[];
  private inFlight: Map<string, Promise<T>>;
  constructor(concurrency: number) {
    this.concurrency = Math.max(1, Number(concurrency) || 3);
    this.active = 0;
    this.pending = [];
    this.inFlight = new Map();
  }

  setConcurrency(value: number) {
    this.concurrency = Math.max(1, Math.min(8, Number(value) || 3));
    this.pump();
  }

  get(key: string) {
    return this.inFlight.get(key) || null;
  }

  enqueue(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing;
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.push({ key, task, resolve, reject });
      this.pump();
    });
    this.inFlight.set(key, promise);
    promise.then(
      () => this.inFlight.delete(key),
      () => this.inFlight.delete(key)
    );
    return promise;
  }

  pump() {
    while (this.active < this.concurrency && this.pending.length) {
      const item = this.pending.shift()!;
      this.active += 1;
      Promise.resolve()
        .then(item.task)
        .then(item.resolve, item.reject)
        .finally(() => {
          this.active -= 1;
          this.pump();
        });
    }
  }
}

export default RequestQueue;

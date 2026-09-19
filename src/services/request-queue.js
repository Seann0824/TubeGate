(function (root) {
  'use strict';
  class RequestQueue {
    constructor(concurrency) {
      this.concurrency = Math.max(1, Number(concurrency) || 3);
      this.active = 0;
      this.pending = [];
      this.inFlight = new Map();
    }

    setConcurrency(value) {
      this.concurrency = Math.max(1, Math.min(8, Number(value) || 3));
      this.pump();
    }

    get(key) {
      return this.inFlight.get(key) || null;
    }

    enqueue(key, task) {
      if (this.inFlight.has(key)) return this.inFlight.get(key);
      const promise = new Promise((resolve, reject) => {
        this.pending.push({ key, task, resolve, reject });
        this.pump();
      });
      this.inFlight.set(key, promise);
      promise.then(() => this.inFlight.delete(key), () => this.inFlight.delete(key));
      return promise;
    }

    pump() {
      while (this.active < this.concurrency && this.pending.length) {
        const item = this.pending.shift();
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

  root.TubeGateRequestQueue = RequestQueue;
  if (typeof module !== 'undefined' && module.exports) module.exports = RequestQueue;
})(globalThis);

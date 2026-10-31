// A serial job queue: jobs run one at a time in the order queued, and one failing job never blocks the next.
export type SerialQueue = <T>(job: () => Promise<T>) => Promise<T>;

export function serialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    // Whatever happened to the previous job, this one starts after it settles. `job` may throw synchronously.
    const result = tail.then(() => job(), () => job());
    tail = result.catch(() => {});
    return result;
  };
}

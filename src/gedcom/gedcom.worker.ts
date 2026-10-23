import { runParseJob } from './workerJob';

interface WorkerScope {
  onmessage: ((event: MessageEvent<{ buffer: ArrayBuffer }>) => void) | null;
  postMessage: (data: unknown) => void;
}

const scope = globalThis as unknown as WorkerScope;

scope.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  for (const message of runParseJob(event.data.buffer)) {
    scope.postMessage(message);
  }
};

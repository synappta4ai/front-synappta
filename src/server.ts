import { AngularAppEngine, createRequestHandler } from '@angular/ssr';

const angularAppEngine = new AngularAppEngine();

export const reqHandler = createRequestHandler(async (request) => {
  const result = await angularAppEngine.handle(request);
  return result || new Response('Not found', { status: 404 });
});

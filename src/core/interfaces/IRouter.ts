import { IncomingMessage, ServerResponse } from 'http';

export type HttpHandler = (req: IncomingMessage, res: ServerResponse, body: any) => Promise<void> | void;

export interface IRouter {
  get(path: string, handler: HttpHandler): void;
  post(path: string, handler: HttpHandler): void;
  put(path: string, handler: HttpHandler): void;
  delete(path: string, handler: HttpHandler): void;
}

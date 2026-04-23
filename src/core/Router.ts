import { IncomingMessage, ServerResponse } from 'http';
import { IRouter, HttpHandler } from './interfaces/IRouter';

export class Router implements IRouter {
  private routes = {
    GET: new Map<string, HttpHandler>(),
    POST: new Map<string, HttpHandler>(),
    PUT: new Map<string, HttpHandler>(),
    DELETE: new Map<string, HttpHandler>(),
  };

  public get(path: string, handler: HttpHandler) {
    this.routes.GET.set(path, handler);
  }

  public post(path: string, handler: HttpHandler) {
    this.routes.POST.set(path, handler);
  }

  public put(path: string, handler: HttpHandler) {
    this.routes.PUT.set(path, handler);
  }

  public delete(path: string, handler: HttpHandler) {
    this.routes.DELETE.set(path, handler);
  }

  public async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = req.method as keyof typeof this.routes;
    if (!this.routes[method]) return false;

    try {
      const url = new URL(req.url || '/', `http://${req.headers.host}`);
      const handler = this.routes[method].get(url.pathname);
      
      if (handler) {
        let parsedBody: any = null;
        if (method === 'POST' || method === 'PUT') {
           let data = '';
           for await (const chunk of req) {
               data += chunk;
           }
           if (data) {
               try { parsedBody = JSON.parse(data); } catch (e) { parsedBody = data; }
           }
        }
        await handler(req, res, parsedBody);
        return true;
      }
    } catch (error) {
      console.error(`Error handling route ${req.url}:`, error);
    }
    
    return false; // Route not handled
  }
}

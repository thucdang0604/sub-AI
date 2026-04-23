import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { IExtension, IExtensionContext } from './interfaces/IExtension';
import { Router } from './Router';

export class ExtensionManager {
  private extensions: IExtension[] = [];
  private mcpTools: Map<string, (args: any) => Promise<any>> = new Map();
  private mcpDeclarations: Tool[] = [];

  public register(ext: IExtension) {
    this.extensions.push(ext);
  }

  public async initializeAll(context: IExtensionContext) {
    for (const ext of this.extensions) {
      console.log(`[ExtensionManager] Initializing extension: ${ext.name} v${ext.version}`);
      await ext.initialize(context);
    }
  }

  public registerRoutes(router: Router) {
    for (const ext of this.extensions) {
      if (ext.registerRoutes) {
        ext.registerRoutes(router);
      }
    }
  }

  public registerMcpTools() {
    for (const ext of this.extensions) {
      if (ext.registerMcpTools) {
        const tools = ext.registerMcpTools();
        for (const tool of tools) {
          if (this.mcpTools.has(tool.declaration.name)) {
            console.warn(`[ExtensionManager] Tool ${tool.declaration.name} is already registered. Overwriting.`);
          }
          this.mcpTools.set(tool.declaration.name, tool.handler);
          this.mcpDeclarations.push(tool.declaration);
        }
      }
    }
  }

  public getMcpDeclarations(): Tool[] {
    return this.mcpDeclarations;
  }

  public getMcpToolHandler(name: string): ((args: any) => Promise<any>) | undefined {
    return this.mcpTools.get(name);
  }

  public async destroyAll() {
    for (const ext of this.extensions) {
      if (ext.destroy) {
        await ext.destroy();
      }
    }
  }
}

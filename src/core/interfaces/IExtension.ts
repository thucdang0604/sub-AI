import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { IRouter } from './IRouter';
import { EventBus } from '../EventBus';
import { StorageService } from '../../services/StorageService';

export interface IExtensionContext {
  eventBus: EventBus;
  storageService: StorageService;
}

export interface McpToolDeclaration {
  declaration: Tool;
  handler: (args: any) => Promise<any>;
}

export interface IExtension {
  name: string;
  version: string;

  initialize(context: IExtensionContext): Promise<void>;
  registerRoutes?(router: IRouter): void;
  registerMcpTools?(): McpToolDeclaration[];
  destroy?(): Promise<void>;
}

#!/usr/bin/env node
import { StorageService } from '../src/services/StorageService';
import { OllamaProviderService } from '../src/services/OllamaProviderService';
import { AppServer } from '../src/presentation/Server';
import path from 'path';

const PORT = 3333;
let TOOL_DIR = path.resolve(__dirname, '..');
if (TOOL_DIR.endsWith('dist')) {
    TOOL_DIR = path.resolve(TOOL_DIR, '..');
}

const storage = new StorageService(TOOL_DIR);

import { ExtensionManager } from '../src/core/ExtensionManager';
import { SystemExtension } from '../src/extensions/SystemExtension';
import { GraphExtension } from '../src/extensions/GraphExtension';
import { RagExtension } from '../src/extensions/RagExtension';
import { ChatExtension } from '../src/extensions/ChatExtension';
import { GitExtension } from '../src/extensions/GitExtension';
import { eventBus } from '../src/core/EventBus.js';

const extensionManager = new ExtensionManager();
extensionManager.register(new SystemExtension());
extensionManager.register(new GraphExtension());
extensionManager.register(new RagExtension());
extensionManager.register(new ChatExtension());
extensionManager.register(new GitExtension());

// Initialize extensions
extensionManager.initializeAll({ eventBus, storageService: storage as any }).then(() => {
    const server = new AppServer(PORT, TOOL_DIR, storage, extensionManager);
    server.start();
}).catch(e => {
    console.error("Failed to initialize extensions:", e);
});

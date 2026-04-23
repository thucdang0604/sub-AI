export interface SymbolInfo {
    name: string;
    type: 'class' | 'function' | 'interface' | 'type' | 'variable' | 'unknown';
}

export interface NodeWarning {
    type: 'god-file' | 'large-file' | 'high-fan-out' | 'dead-exports' | 'orphan' | 'env-leak' | 'unsafe-dom' | 'hardcoded-secret' | 'high-churn';
    severity: 'high' | 'medium' | 'low';
    message: string;
}

export interface FeatureCluster {
    id: string;
    name: string;
    entryPoints: string[];
    files: string[];
    sharedFiles: string[];
    totalLines: number;
}

export interface GraphNode {
    id: string;
    category: string;
    lines?: number;
    exports?: SymbolInfo[];
    isOrphan?: boolean;
    warnings?: NodeWarning[];
    gitChanges?: number;
    docs?: string[];
}

export interface GraphEdge {
    source: string;
    target: string;
    isCircular?: boolean;
}

export interface ProjectGraph {
    projectRoot: string;
    srcDir: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
    features?: FeatureCluster[];
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
}

export interface ChatSession {
    id: string;
    title: string;
    model: string;
    createdAt: string;
    updatedAt: string;
    messages: ChatMessage[];
}

export interface LLMModelInfo {
    id: string; // The identifier for the API
    name: string; // Display name
    provider: 'ollama' | 'openai' | 'gemini';
    size?: number;
    modified?: string;
    family?: string;
    paramSize?: string;
    quantization?: string;
}

export interface AIRequestBody {
    action: 'summarize' | 'impact' | 'health' | 'chat' | 'what-to-edit' | 'evaluate-features' | 'analyze-feature' | 'audit';
    model: string;
    fileId?: string;
    fileIds?: string[];
    prompt?: string;
    graphContext?: any;
    featureId?: string;
}

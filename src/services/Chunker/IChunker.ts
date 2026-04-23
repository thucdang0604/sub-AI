export interface CodeChunk {
    id: string; // Hash of the content to quickly identify identical chunks
    file_path: string;
    start_line: number;
    end_line: number;
    symbol_name: string; // Name of the class, function, or block
    code_content: string;
    dependencies: string[]; // List of imported/used variables or functions
}

export interface IChunker {
    chunkFile(absolutePath: string, relativePath: string): Promise<CodeChunk[]>;
}

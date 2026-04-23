import { ProjectGraph } from '../domain/types';

export interface AnalysisResult {
    graph: ProjectGraph;
    fileDependenciesMd: string;
    aiFileMapMd: string;
}

export interface ImpactResult {
    fileId: string;
    directImpact: string[];
    transitiveImpact: string[];
}

export interface IAnalyzerService {
    analyze(targetDir: string): Promise<AnalysisResult>;
    calculateImpact(graph: ProjectGraph, fileId: string): ImpactResult | null;
}

import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface HardwareMetrics {
    cpu: {
        usage_percent: number;
    };
    ram: {
        total_gb: number;
        used_gb: number;
        free_gb: number;
        usage_percent: number;
    };
    vram: {
        available: boolean;
        total_gb: number;
        used_gb: number;
        free_gb: number;
        usage_percent: number;
        gpu_name: string;
    };
    npu: {
        available: boolean;
        name: string;
    };
    ollama: {
        running: boolean;
        models_loaded: Array<{
            name: string;
            size_vram_gb: number;
            size_ram_gb: number;
        }>;
    };
}

export class HardwareMonitorService {
    private ollamaUrl = 'http://localhost:11434/api';

    constructor() {}

    private async getCpuUsage(): Promise<number> {
        const cpus = os.cpus();
        let idle = 0;
        let total = 0;
        for (const cpu of cpus) {
            for (const type in cpu.times) {
                total += (cpu.times as any)[type];
            }
            idle += cpu.times.idle;
        }
        return Math.round(100 - (100 * idle) / total);
    }

    private getRamMetrics() {
        const total = os.totalmem();
        const free = os.freemem();
        const used = total - free;
        return {
            total_gb: parseFloat((total / 1024 / 1024 / 1024).toFixed(2)),
            used_gb: parseFloat((used / 1024 / 1024 / 1024).toFixed(2)),
            free_gb: parseFloat((free / 1024 / 1024 / 1024).toFixed(2)),
            usage_percent: Math.round((used / total) * 100)
        };
    }

    private async getVramMetrics() {
        try {
            // nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader,nounits
            const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total,memory.used,memory.free --format=csv,noheader,nounits');
            const lines = stdout.trim().split('\n');
            if (lines.length > 0 && lines[0]) {
                const parts = lines[0].split(',').map(s => s.trim());
                if (parts.length === 4) {
                    const gpu_name = parts[0] || '';
                    const total_mb = parseInt(parts[1] || '0', 10);
                    const used_mb = parseInt(parts[2] || '0', 10);
                    const free_mb = parseInt(parts[3] || '0', 10);
                    
                    return {
                        available: true,
                        gpu_name,
                        total_gb: parseFloat((total_mb / 1024).toFixed(2)),
                        used_gb: parseFloat((used_mb / 1024).toFixed(2)),
                        free_gb: parseFloat((free_mb / 1024).toFixed(2)),
                        usage_percent: total_mb > 0 ? Math.round((used_mb / total_mb) * 100) : 0
                    };
                }
            }
        } catch (e) {
            // No nvidia-smi available
        }
        return { available: false, gpu_name: '', total_gb: 0, used_gb: 0, free_gb: 0, usage_percent: 0 };
    }

    private async getNpuMetrics() {
        try {
            if (os.platform() === 'win32') {
                const { stdout } = await execAsync('powershell -Command "Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match \'NPU|AI Boost\' } | Select-Object -ExpandProperty Name"');
                const name = stdout.trim();
                if (name) {
                    return { available: true, name };
                }
            }
        } catch (e) {
            // powershell execution failed or no NPU
        }
        return { available: false, name: '' };
    }

    private async getOllamaMetrics() {
        try {
            const response = await fetch(`${this.ollamaUrl}/ps`);
            if (response.ok) {
                const data = await response.json() as any;
                const models_loaded = (data.models || []).map((m: any) => ({
                    name: m.name,
                    size_vram_gb: parseFloat((m.size_vram / 1024 / 1024 / 1024 || 0).toFixed(2)),
                    size_ram_gb: parseFloat(((m.size - m.size_vram) / 1024 / 1024 / 1024 || 0).toFixed(2))
                }));
                return { running: true, models_loaded };
            }
        } catch (e) {
            // Ollama is down
        }
        return { running: false, models_loaded: [] };
    }

    public async getMetrics(): Promise<HardwareMetrics> {
        const [cpuUsage, ram, vram, npu, ollama] = await Promise.all([
            this.getCpuUsage(),
            Promise.resolve(this.getRamMetrics()),
            this.getVramMetrics(),
            this.getNpuMetrics(),
            this.getOllamaMetrics()
        ]);

        return {
            cpu: { usage_percent: cpuUsage },
            ram,
            vram,
            npu,
            ollama
        };
    }
}

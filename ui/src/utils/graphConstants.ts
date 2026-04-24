/**
 * Graph constants & utility functions
 * 
 * Extracted from Graph.vue (Issue #11 God File refactor)
 */

export const LAYER_MAP: Record<string, number> = {
    'page': 0, 'layout': 0, 'view': 0, 'screen': 0,
    'component': 1, 'widget': 1,
    'api': 2, 'route': 2, 'controller': 2, 'middleware': 2,
    'service': 3, 'hook': 3, 'util': 3, 'lib': 3, 'helper': 3,
    'model': 4, 'schema': 4, 'type': 4, 'store': 4,
    'config': 5, 'constant': 5,
    'other': 3,
}

export const LAYER_LABELS = [
    { emoji: '📱', label: 'Giao diện (Presentation)' },
    { emoji: '🧩', label: 'Thành phần (Components)' },
    { emoji: '🔌', label: 'API / Routes' },
    { emoji: '⚙️', label: 'Dịch vụ / Logic (Services)' },
    { emoji: '💾', label: 'Dữ liệu / Models' },
    { emoji: '🔧', label: 'Cấu hình (Config)' },
]

export const nodeRadius = (d: any) => Math.max(12, Math.min(35, Math.sqrt(d.lines || 100) * 1.5))

// Category → Color mapping
export const CATEGORY_COLORS: Record<string, string> = {
    page: '#818cf8',
    layout: '#818cf8',
    view: '#818cf8',
    screen: '#818cf8',
    component: '#34d399',
    widget: '#34d399',
    api: '#fb923c',
    route: '#fb923c',
    controller: '#fb923c',
    middleware: '#fb923c',
    service: '#60a5fa',
    hook: '#60a5fa',
    util: '#a78bfa',
    lib: '#a78bfa',
    helper: '#a78bfa',
    model: '#f472b6',
    schema: '#f472b6',
    type: '#f472b6',
    store: '#f472b6',
    config: '#fbbf24',
    constant: '#fbbf24',
    other: '#9ca3af',
}

export function getCategoryColor(category: string): string {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS.other
}

// Generate distinct colors for feature clusters
export function getFeatureColor(index: number): string {
    const PALETTE = [
        '#818cf8', '#34d399', '#fb923c', '#60a5fa', '#f472b6',
        '#a78bfa', '#fbbf24', '#2dd4bf', '#f87171', '#c084fc',
        '#4ade80', '#38bdf8', '#fb7185', '#e879f9', '#facc15'
    ]
    return PALETTE[index % PALETTE.length]
}

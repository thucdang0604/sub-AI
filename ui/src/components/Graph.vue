<script setup lang="ts">
import { onMounted, ref, watch, computed } from 'vue'
import * as d3 from 'd3'

const props = defineProps<{
  data: any,
  selectedNodeIds?: string[],
  aiReferencedNodes?: string[],
  layoutMode?: 'force' | 'architecture' | 'features',
  physicsConfig?: {
    featureSpacing: number,
    clusterGravity: number,
    repulsion: number,
    linkDistance: number
  }
}>()

const config = computed(() => props.physicsConfig || {
  featureSpacing: 800,
  clusterGravity: 0.8,
  repulsion: -500,
  linkDistance: 150
})

const emit = defineEmits<{
  (e: 'node-click', payload: { node: any, shiftKey: boolean }): void
}>()

const containerRef = ref<HTMLElement | null>(null)

const LAYER_MAP: Record<string, number> = {
  'page': 0, 'layout': 0, 'view': 0, 'screen': 0,
  'component': 1, 'widget': 1,
  'api': 2, 'route': 2, 'controller': 2, 'middleware': 2,
  'service': 3, 'hook': 3, 'util': 3, 'lib': 3, 'helper': 3,
  'model': 4, 'schema': 4, 'type': 4, 'store': 4,
  'config': 5, 'constant': 5,
  'other': 3,
}

const LAYER_LABELS = [
  { emoji: '📱', label: 'Giao diện (Presentation)' },
  { emoji: '🧩', label: 'Thành phần (Components)' },
  { emoji: '🔌', label: 'API / Routes' },
  { emoji: '⚙️', label: 'Dịch vụ / Logic (Services)' },
  { emoji: '💾', label: 'Dữ liệu / Models' },
  { emoji: '🔧', label: 'Cấu hình (Config)' },
]

const nodeRadius = (d: any) => Math.max(12, Math.min(35, Math.sqrt(d.lines || 100) * 1.5))

// Render function
const renderGraph = () => {
  if (!containerRef.value || !props.data) return

  const width = containerRef.value.clientWidth || 800
  const height = containerRef.value.clientHeight || 600
  const isArchMode = props.layoutMode === 'architecture'
  const isFeatureMode = props.layoutMode === 'features'
  const layerCount = 6

  // Clear previous SVG
  d3.select(containerRef.value).selectAll('*').remove()

  const svg = d3.select(containerRef.value)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', [0, 0, width, height])

  if (!props.data.nodes || !props.data.edges) {
    console.error('Invalid graph data format');
    return;
  }

  const nodes = props.data.nodes.map((n: any) => ({ ...n }));
  const nodeIds = new Set(nodes.map((n: any) => n.id));

  const links = props.data.edges
    .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e: any) => ({
      source: e.source,
      target: e.target
    }));

  // Layer Y position calculator with Spacious Layout
  const virtualHeight = isArchMode ? Math.max(height * 3, 3600) : height;
  const layerY = (category: string) => {
    const layer = LAYER_MAP[category] ?? 3;
    return (layer / (layerCount - 1)) * virtualHeight * 0.8 + virtualHeight * 0.1;
  };

  // Feature Position Calculator
  const featureMap = new Map<string, number>()
  if (props.data.features) {
    props.data.features.forEach((f: any, i: number) => {
      f.files.forEach((fid: string) => featureMap.set(fid, i))
    })
  }
  const getFeatureIndex = (nodeId: string) => featureMap.get(nodeId) ?? -1
  const featureCount = props.data.features?.length || 1
  const featureCols = Math.ceil(Math.sqrt(featureCount))
  const featureRows = Math.ceil(featureCount / featureCols)
  const fVirtualWidth = Math.max(width, featureCols * config.value.featureSpacing)
  const fVirtualHeight = Math.max(height, featureRows * config.value.featureSpacing)

  const featureX = (fid: string) => {
    const idx = getFeatureIndex(fid)
    if (idx === -1) return fVirtualWidth / 2
    const c = idx % featureCols
    return (c + 0.5) * (fVirtualWidth / featureCols)
  }
  const featureY = (fid: string) => {
    const idx = getFeatureIndex(fid)
    if (idx === -1) return fVirtualHeight / 2
    const r = Math.floor(idx / featureCols)
    return (r + 0.5) * (fVirtualHeight / featureRows)
  }

  // Force simulation
  const simulation = d3.forceSimulation(nodes as any)
    .force('link', d3.forceLink(links).id((d: any) => d.id).distance(isArchMode ? 150 : (isFeatureMode ? config.value.linkDistance : 100)))
    .force('charge', d3.forceManyBody().strength(isArchMode ? -400 : (isFeatureMode ? config.value.repulsion : -300)))
    .force('collide', d3.forceCollide().radius((d: any) => nodeRadius(d) + 15).iterations(2))

  if (isArchMode) {
    simulation
      .force('y', d3.forceY((d: any) => layerY(d.category)).strength(0.85))
      .force('x', d3.forceX(width / 2).strength(0.08)) // Increased strength to group nodes
  } else if (isFeatureMode) {
    simulation
      .force('x', d3.forceX((d: any) => featureX(d.id)).strength(config.value.clusterGravity))
      .force('y', d3.forceY((d: any) => featureY(d.id)).strength(config.value.clusterGravity))
  } else {
    simulation
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05))
  }

  // Zoom wrapper
  const g = svg.append('g')

  svg.call(d3.zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 5])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    }))

  // Layer bands & labels (Architecture mode only)
  if (isArchMode) {
    LAYER_LABELS.forEach((layer, i) => {
      const y = (i / (layerCount - 1)) * virtualHeight * 0.8 + virtualHeight * 0.1;
      // Background band
      g.append('rect')
        .attr('x', -5000).attr('y', y - 240)
        .attr('width', 10000).attr('height', 480)
        .attr('fill', i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)')
        .attr('class', 'layer-band')
      // Label
      g.append('text')
        .attr('x', 20).attr('y', y + 5)
        .attr('fill', 'rgba(255,255,255,0.4)')
        .attr('font-size', '16px')
        .text(`${layer.emoji} ${layer.label}`)
        .attr('class', 'layer-label')
    });
  }

  // Feature labels (Features mode only)
  if (isFeatureMode && props.data.features) {
    props.data.features.forEach((feature: any, i: number) => {
      const c = i % featureCols
      const r = Math.floor(i / featureCols)
      const fx = (c + 0.5) * (fVirtualWidth / featureCols)
      const fy = (r + 0.5) * (fVirtualHeight / featureRows)
      
      // Feature Background Circle
      g.append('circle')
        .attr('cx', fx)
        .attr('cy', fy)
        .attr('r', config.value.featureSpacing * 0.45)
        .attr('fill', 'rgba(255,255,255,0.02)')
        .attr('stroke', 'rgba(255,255,255,0.05)')
        .attr('stroke-dasharray', '5,5')
      
      // Feature Label
      g.append('text')
        .attr('x', fx)
        .attr('y', fy - (config.value.featureSpacing * 0.45) - 10)
        .attr('fill', 'rgba(255,255,255,0.6)')
        .attr('font-size', '18px')
        .attr('font-weight', '600')
        .attr('text-anchor', 'middle')
        .text(`📦 ${feature.name}`)
    })
  }

  // Links
  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('stroke', 'var(--border-color)')
    .attr('stroke-width', 1.5)

  // Node Colors based on Category
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10)

  // Warning stroke helpers
  const getWarningStroke = (d: any) => {
    if (!d.warnings || d.warnings.length === 0) return '#fff'
    const hasHigh = d.warnings.some((w: any) => w.severity === 'high')
    const hasMedium = d.warnings.some((w: any) => w.severity === 'medium')
    if (hasHigh) return '#ff4444'
    if (hasMedium) return '#ffaa00'
    return '#fff'
  }
  const getWarningStrokeWidth = (d: any) => {
    return (d.warnings && d.warnings.length > 0) ? 3 : 2
  }

  // Nodes
  const node = g.append('g')
    .selectAll('circle')
    .data(nodes)
    .join('circle')
    .attr('r', (d: any) => nodeRadius(d))
    .attr('fill', (d: any) => colorScale(d.category || 'unknown'))
    .attr('stroke', (d: any) => getWarningStroke(d))
    .attr('stroke-width', (d: any) => getWarningStrokeWidth(d))
    .attr('stroke-dasharray', (d: any) => d.isOrphan ? '4,4' : null)
    .style('opacity', (d: any) => d.isOrphan ? 0.5 : 1)
    .style('cursor', 'pointer')
    .on('click', (event, d) => {
      emit('node-click', { node: d, shiftKey: event.shiftKey })
    })
    .call(drag(simulation) as any)

  const getSmartLabel = (id: string) => {
    const parts = id.split('/')
    const basename = parts[parts.length - 1]
    if (/^(page|layout|index)\./i.test(basename) && parts.length > 1) {
      let parentName = parts[parts.length - 2]
      if (parentName.startsWith('[') && parts.length > 2) {
        parentName = parts[parts.length - 3] + '/' + parentName
      }
      return parentName + '/' + basename.split('.')[0]
    }
    return basename || id
  }

  // Node labels
  const label = g.append('g')
    .selectAll('text')
    .data(nodes)
    .join('text')
    .text((d: any) => getSmartLabel(d.id))
    .attr('font-size', '12px')
    .attr('font-weight', '600')
    .attr('fill', 'var(--text-primary)')
    .attr('dx', (d: any) => nodeRadius(d) + 5)
    .attr('dy', 4)
    .style('pointer-events', 'none')
    .style('text-shadow', '0 1px 3px rgba(0,0,0,0.8)')

  simulation.on('tick', () => {
    link
      .attr('x1', (d: any) => d.source.x)
      .attr('y1', (d: any) => d.source.y)
      .attr('x2', (d: any) => d.target.x)
      .attr('y2', (d: any) => d.target.y)

    node
      .attr('cx', (d: any) => d.x)
      .attr('cy', (d: any) => d.y)

    label
      .attr('x', (d: any) => d.x)
      .attr('y', (d: any) => d.y)
  })

  // Highlight Logic
  const updateHighlight = () => {
    const aiNodes = new Set(props.aiReferencedNodes || [])
    const selectedNodes = new Set(props.selectedNodeIds || [])
    
    if (selectedNodes.size === 0) {
      node.style('opacity', (d: any) => d.isOrphan ? 0.5 : 1)
          .attr('stroke', (d: any) => aiNodes.has(d.id) ? '#00ffff' : getWarningStroke(d))
          .attr('stroke-width', (d: any) => aiNodes.has(d.id) ? 4 : getWarningStrokeWidth(d))
      link.style('opacity', 0.6).attr('stroke', 'var(--border-color)').attr('stroke-width', 1.5)
      label.style('opacity', 1)
      return
    }

    const linkedNodes = new Set<string>()
    selectedNodes.forEach(id => linkedNodes.add(id))

    const adjacency: Record<string, string[]> = {}
    const reverseAdjacency: Record<string, string[]> = {}
    
    props.data.edges.forEach((e: any) => {
      const s = typeof e.source === 'object' ? e.source.id : e.source
      const t = typeof e.target === 'object' ? e.target.id : e.target
      if (!adjacency[s]) adjacency[s] = []
      adjacency[s].push(t)
      if (!reverseAdjacency[t]) reverseAdjacency[t] = []
      reverseAdjacency[t].push(s)
    })

    const getReachable = (start: string, graph: Record<string, string[]>) => {
      const visited = new Set<string>()
      const q = [start]
      while (q.length > 0) {
        const curr = q.shift()!
        if (!visited.has(curr)) {
          visited.add(curr)
          ;(graph[curr] || []).forEach(n => { if (!visited.has(n)) q.push(n) })
        }
      }
      return visited
    }

    // --- Flow Tracing Logic for exactly 2 selected nodes ---
    if (selectedNodes.size === 2) {
      const [nodeA, nodeB] = Array.from(selectedNodes)

      // Path A -> B
      const forwardA = getReachable(nodeA, adjacency)
      const backwardB = getReachable(nodeB, reverseAdjacency)
      
      // Path B -> A
      const forwardB = getReachable(nodeB, adjacency)
      const backwardA = getReachable(nodeA, reverseAdjacency)

      const flowNodes = new Set<string>()
      forwardA.forEach(n => { if (backwardB.has(n)) flowNodes.add(n) })
      forwardB.forEach(n => { if (backwardA.has(n)) flowNodes.add(n) })

      if (flowNodes.size > 0) {
        node.style('opacity', (d: any) => flowNodes.has(d.id) ? 1 : 0.1)
            .attr('stroke', (d: any) => selectedNodes.has(d.id) ? '#ffaa00' : (flowNodes.has(d.id) ? '#ffaa00' : getWarningStroke(d)))
            .attr('stroke-width', (d: any) => flowNodes.has(d.id) ? 4 : getWarningStrokeWidth(d))
            
        link.style('opacity', (d: any) => (flowNodes.has(d.source.id) && flowNodes.has(d.target.id)) ? 1 : 0.05)
            .attr('stroke', (d: any) => (flowNodes.has(d.source.id) && flowNodes.has(d.target.id)) ? '#ffaa00' : 'var(--border-color)')
            .attr('stroke-width', (d: any) => (flowNodes.has(d.source.id) && flowNodes.has(d.target.id)) ? 3 : 1.5)
            
        label.style('opacity', (d: any) => flowNodes.has(d.id) ? 1 : 0.1)
        return
      }
    }

    // --- Standard selection highlighting (BFS Downstream Flow) ---
    selectedNodes.forEach(nodeId => {
      const downstream = getReachable(nodeId, adjacency)
      downstream.forEach(n => linkedNodes.add(n))
    })

    node.style('opacity', (d: any) => (linkedNodes.has(d.id) || aiNodes.has(d.id)) ? 1 : 0.2)
        .attr('stroke', (d: any) => selectedNodes.has(d.id) ? '#00ff00' : (aiNodes.has(d.id) ? '#00ffff' : getWarningStroke(d)))
        .attr('stroke-width', (d: any) => (selectedNodes.has(d.id) || aiNodes.has(d.id)) ? 4 : getWarningStrokeWidth(d))
    
    link.style('opacity', (d: any) => (linkedNodes.has(d.source.id) && linkedNodes.has(d.target.id)) ? 1 : 0.1)
        .attr('stroke', (d: any) => selectedNodes.has(d.source.id) ? '#ff0000' : (selectedNodes.has(d.target.id) ? '#00ff00' : 'var(--border-color)'))
        .attr('stroke-width', (d: any) => (linkedNodes.has(d.source.id) && linkedNodes.has(d.target.id)) ? 2.5 : 1.5)

    label.style('opacity', (d: any) => (linkedNodes.has(d.id) || aiNodes.has(d.id)) ? 1 : 0.2)
  }

  // Call highlight on render
  updateHighlight()

  // Watch for selected node changes and AI references
  watch(() => props.selectedNodeIds, updateHighlight, { deep: true })
  watch(() => props.aiReferencedNodes, updateHighlight, { deep: true })

  // Drag utility
  function drag(simulation: any) {
    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart()
      event.subject.fx = event.subject.x
      event.subject.fy = event.subject.y
    }
    
    function dragged(event: any) {
      event.subject.fx = event.x
      event.subject.fy = event.y
    }
    
    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0)
      event.subject.fx = null
      event.subject.fy = null
    }
    
    return d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended)
  }
}

watch(() => props.data, renderGraph)
watch(() => props.layoutMode, renderGraph)
watch(() => props.physicsConfig, renderGraph, { deep: true })

const exportToPNG = () => {
  if (!containerRef.value) return
  const svgNode = containerRef.value.querySelector('svg')
  if (!svgNode) return

  const gNode = svgNode.querySelector('g') as SVGGElement
  if (!gNode) return

  // Temporarily reset transform to get true bounding box of the whole graph
  const oldTransform = gNode.getAttribute('transform')
  gNode.removeAttribute('transform')
  
  const bbox = gNode.getBBox()
  
  if (oldTransform) gNode.setAttribute('transform', oldTransform)

  // Add padding
  const padding = 100
  const width = bbox.width + padding * 2
  const height = bbox.height + padding * 2
  const x = bbox.x - padding
  const y = bbox.y - padding

  const clone = svgNode.cloneNode(true) as SVGSVGElement
  clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)
  clone.setAttribute('width', `${width}`)
  clone.setAttribute('height', `${height}`)
  
  // Remove transform from inner <g> on clone to render at intrinsic size
  const cloneG = clone.querySelector('g')
  if (cloneG) cloneG.removeAttribute('transform')

  // Set dark theme bg
  clone.style.backgroundColor = '#1e1e2e'

  const serializer = new XMLSerializer()
  let svgString = serializer.serializeToString(clone)
  
  // Create a canvas
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const img = new Image()
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  img.onload = () => {
    ctx.fillStyle = '#1e1e2e'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    
    const a = document.createElement('a')
    a.download = `sub-ai-graph-${new Date().toISOString().slice(0,10)}.png`
    a.href = canvas.toDataURL('image/png')
    a.click()
  }
  img.src = url
}

defineExpose({ exportToPNG })
onMounted(renderGraph)
</script>

<template>
  <div ref="containerRef" class="w-full h-full"></div>
</template>

<style scoped>
.w-full {
  width: 100%;
}
.h-full {
  height: 100%;
}
</style>

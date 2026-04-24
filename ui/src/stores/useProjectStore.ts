import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAppStore } from './useAppStore'
import { useIntegrationStore } from './useIntegrationStore'

export const useProjectStore = defineStore('project', () => {
  const targetDir = ref('')
  const graphData = ref<any>(null)
  const isAnalyzing = ref(false)
  const selectedNodes = ref<any[]>([])
  const aiReferencedNodes = ref<string[]>([])
  const layoutMode = ref<'force' | 'architecture' | 'features'>('force')

  // Features and Health
  const featuresMarkdown = ref('')
  const isEvaluatingFeatures = ref(false)
  const healthSearch = ref('')
  const isAnalyzingFeature = ref<string | null>(null)
  const featureAnalysisResults = ref<Record<string, string>>({})
  const healthReport = ref<any>(null)
  const isLoadingHealth = ref(false)

  const physicsConfig = ref({
    featureSpacing: 800,
    clusterGravity: 0.8,
    repulsion: -500,
    linkDistance: 150
  })

  const updateAIHighlights = (text: string) => {
    if (!graphData.value?.nodes) return
    const found = new Set(aiReferencedNodes.value)
    for (const node of graphData.value.nodes) {
      const basename = node.id.split('/').pop()
      if (text.includes(node.id) || (basename && text.includes(`\`${basename}\``))) {
        found.add(node.id)
      }
    }
    aiReferencedNodes.value = Array.from(found)
  }

  const selectedNodeStats = computed(() => {
    if (selectedNodes.value.length !== 1 || !graphData.value) return null
    
    const id = selectedNodes.value[0].id
    let imports = 0
    let importedBy = 0
    
    const edges = graphData.value.edges || graphData.value.links || []
    for (const link of edges) {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source
      const targetId = typeof link.target === 'object' ? link.target.id : link.target
      
      if (sourceId === id) imports++
      if (targetId === id) importedBy++
    }
    
    return { imports, importedBy, lines: selectedNodes.value[0].lines || 0, category: selectedNodes.value[0].category || 'Unknown' }
  })

  const highlightBlastRadius = () => {
    if (selectedNodes.value.length !== 1 || !graphData.value) return
    
    const startId = selectedNodes.value[0].id
    const edges = graphData.value.edges || graphData.value.links || []
    const importedByMap: Record<string, string[]> = {}
    
    for (const link of edges) {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source
      const targetId = typeof link.target === 'object' ? link.target.id : link.target
      if (!importedByMap[targetId]) importedByMap[targetId] = []
      importedByMap[targetId].push(sourceId)
    }
    
    const visited = new Set<string>()
    const queue = [startId]
    while (queue.length > 0) {
      const curr = queue.shift()!
      if (!visited.has(curr)) {
        visited.add(curr)
        const importers = importedByMap[curr] || []
        for (const imp of importers) {
          if (!visited.has(imp)) queue.push(imp)
        }
      }
    }
    
    aiReferencedNodes.value = Array.from(visited)
  }

  const fetchGraph = async () => {
    try {
      const res = await fetch('/dependency-graph.json')
      if (res.ok) {
        graphData.value = await res.json()
        if (graphData.value?.projectRoot) {
          targetDir.value = graphData.value.projectRoot
          const integrationStore = useIntegrationStore()
          await integrationStore.fetchIndexStatus(targetDir.value)
        }
      } else {
        graphData.value = null
      }
    } catch (e) {
      console.error('Failed to load graph data', e)
    }
  }

  const handleAnalyze = async () => {
    if (!targetDir.value.trim()) return
    isAnalyzing.value = true
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDir: targetDir.value.trim() })
      })
      if (res.ok) {
        await fetchGraph()
        const appStore = useAppStore()
        appStore.saveRecentProject(targetDir.value.trim())
        aiReferencedNodes.value = []
        selectedNodes.value = []
      } else {
        const err = await res.json()
        alert('Analysis failed: ' + err.error)
      }
    } catch (e) {
      console.error('Failed to analyze', e)
      alert('Analysis failed')
    } finally {
      isAnalyzing.value = false
    }
  }

  return {
    targetDir,
    graphData,
    isAnalyzing,
    selectedNodes,
    aiReferencedNodes,
    layoutMode,
    featuresMarkdown,
    isEvaluatingFeatures,
    healthSearch,
    isAnalyzingFeature,
    featureAnalysisResults,
    healthReport,
    isLoadingHealth,
    physicsConfig,
    updateAIHighlights,
    selectedNodeStats,
    highlightBlastRadius,
    fetchGraph,
    handleAnalyze
  }
})

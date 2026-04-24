<template>
  <div class="features-area">
    <div style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2 style="font-size: 1.25rem; font-weight: 600">Phân tích Tính năng (Beta)</h2>
        <button class="btn-primary" @click="chatStore.handleAction('evaluate-features')" :disabled="projectStore.isEvaluatingFeatures || !integrationStore.activeModel">
          {{ projectStore.isEvaluatingFeatures ? 'Đang phân tích...' : '🤖 Phân tích Toàn bộ Dự án' }}
        </button>
      </div>
      
      <div v-if="!integrationStore.activeModel" style="color: #ef4444; font-size: 0.85rem; padding: 0.5rem; background: rgba(239, 68, 68, 0.1); border-radius: 0.25rem;">
        ⚠️ Vui lòng cấu hình API Key và chọn Model trong tab Cấu hình (Settings) trước khi sử dụng tính năng này.
      </div>
      
      <div v-if="projectStore.featuresMarkdown" class="markdown-body" v-html="marked(projectStore.featuresMarkdown)" style="background: rgba(0,0,0,0.2); padding: 1.5rem; border-radius: 0.5rem; font-size: 0.9rem;"></div>
      <div v-else-if="!projectStore.isEvaluatingFeatures" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
        Bấm nút bên trên để gửi cấu trúc dự án lên AI phân tích. Quá trình có thể mất vài phút tùy kích thước dự án.
      </div>

      <!-- Feature Nodes Interactive -->
      <div v-if="featureGroups.length > 0">
        <h3 style="font-size: 1rem; font-weight: 600; margin-top: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.5rem;">Chi tiết Tính Năng</h3>
        
        <div v-for="group in featureGroups" :key="group.name" class="feature-card">
          <div class="feature-card-header">
            <span class="feature-name">{{ group.name }}</span>
            <span class="feature-badge">{{ group.nodes.length }} files</span>
          </div>
          <div class="feature-meta">
            Mô-đun liên quan: 
            <span v-for="cat in Array.from(new Set(group.nodes.map(n => n.category)))" :key="cat" style="color: #6366f1;">
              {{ cat }}
            </span>
          </div>
          <div class="feature-actions">
            <button class="btn-secondary btn-sm" @click="selectFeatureNodes(group.nodes)">
              🎯 Chọn trên Graph
            </button>
            <button class="btn-primary btn-sm" @click="chatStore.handleAction('analyze-feature', group.name)" :disabled="projectStore.isAnalyzingFeature === group.name || !integrationStore.activeModel">
              {{ projectStore.isAnalyzingFeature === group.name ? '⏳ Đang phân tích...' : '🤖 Phân tích chuyên sâu' }}
            </button>
          </div>
          
          <div v-if="projectStore.featureAnalysisResults[group.name]" class="markdown-body" v-html="marked(projectStore.featureAnalysisResults[group.name])" style="background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 0.5rem; margin-top: 0.75rem; font-size: 0.85rem; border-left: 3px solid #8b5cf6;"></div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import { useChatStore } from '../../stores/useChatStore'
import { useProjectStore } from '../../stores/useProjectStore'
import { useIntegrationStore } from '../../stores/useIntegrationStore'

const chatStore = useChatStore()
const projectStore = useProjectStore()
const integrationStore = useIntegrationStore()

const featureGroups = computed(() => {
  if (!projectStore.graphData?.nodes) return []
  const groups: Record<string, any[]> = {}
  
  for (const node of projectStore.graphData.nodes) {
    if (!node.category || node.category === 'Unknown') continue
    
    let featureName = node.id.split('/')[0]
    if (node.id.includes('features/')) {
      featureName = node.id.split('features/')[1].split('/')[0]
    } else if (node.id.includes('components/')) {
      featureName = node.id.split('components/')[1].split('/')[0]
    }
    
    if (!groups[featureName]) groups[featureName] = []
    groups[featureName].push(node)
  }
  
  return Object.keys(groups)
    .map(key => ({ name: key, nodes: groups[key] }))
    .filter(g => g.nodes.length > 2)
    .sort((a, b) => b.nodes.length - a.nodes.length)
})

const selectFeatureNodes = (nodes: any[]) => {
  projectStore.selectedNodes = nodes
}
</script>

<style scoped>
.features-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
}

.feature-card {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
  transition: border-color 0.2s;
}
.feature-card:hover {
  border-color: rgba(139, 92, 246, 0.4);
}
.feature-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.25rem;
}
.feature-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
}
.feature-badge {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 10px;
  font-weight: 500;
}
.feature-meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.feature-actions {
  display: flex;
  gap: 0.5rem;
}
.btn-sm {
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}
.markdown-body :deep(p) { margin: 0 0 0.5rem 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(pre) { background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 0.25rem; overflow-x: auto; }
.markdown-body :deep(code) { font-family: monospace; background: rgba(0,0,0,0.2); padding: 0.1rem 0.2rem; border-radius: 0.2rem; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 0.5rem 0; padding-left: 1.5rem; }
</style>

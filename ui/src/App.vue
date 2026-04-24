<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Settings, MessageSquare, Maximize2, History, Plus, Trash2, FolderOpen, ChevronDown, Camera, Database } from 'lucide-vue-next'
import Graph from './components/Graph.vue'
import { ChatTab, FeaturesTab, HealthTab, KnowledgeTab, GuideTab, SettingsTab } from './components/tabs'

import { useAppStore } from './stores/useAppStore'
import { useProjectStore } from './stores/useProjectStore'
import { useIntegrationStore } from './stores/useIntegrationStore'
import { useChatStore } from './stores/useChatStore'

const appStore = useAppStore()
const projectStore = useProjectStore()
const integrationStore = useIntegrationStore()
const chatStore = useChatStore()

const graphRef = ref<any>(null)

const exportGraphImage = () => {
  if (graphRef.value) {
    graphRef.value.exportToPNG()
  }
}

const fetchHealthReport = async () => {
  projectStore.isLoadingHealth = true
  try {
    const res = await fetch('/api/health')
    if (res.ok) {
      projectStore.healthReport = await res.json()
    }
  } catch (e) {
    console.error('Failed to fetch health report', e)
  } finally {
    projectStore.isLoadingHealth = false
  }
}

const fetchGitRecent = async () => {
  if (!projectStore.targetDir) return
  integrationStore.isLoadingGit = true
  try {
    const res = await fetch('/api/git/recent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDir: projectStore.targetDir, limit: 8 })
    })
    if (res.ok) {
      integrationStore.gitRecentChanges = await res.json()
    }
  } catch (e) {
    console.error('Failed to fetch git changes', e)
  } finally {
    integrationStore.isLoadingGit = false
  }
}

const fetchGithubSync = async () => {
  if (!integrationStore.githubUrl) return
  integrationStore.isLoadingSync = true
  try {
    const res = await fetch('/api/github/sync', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ url: integrationStore.githubUrl }) 
    })
    if (res.ok) integrationStore.githubSync = await res.json()
  } catch (e) { console.error('GitHub sync failed', e) }
  finally { integrationStore.isLoadingSync = false }
}

const handleGithubAnalyze = async () => {
  if (!integrationStore.githubUrl) return
  projectStore.isAnalyzing = true
  try {
    const cloneRes = await fetch('/api/github/analyze', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ url: integrationStore.githubUrl }) 
    })
    if (!cloneRes.ok) { alert('Clone failed'); return }
    const { localPath } = await cloneRes.json()
    projectStore.targetDir = localPath
    const analyzeRes = await fetch('/api/analyze', { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ targetDir: localPath }) 
    })
    if (analyzeRes.ok) { 
      await projectStore.fetchGraph()
      await fetchHealthReport()
      await fetchGithubSync() 
    }
  } catch (e: any) { alert('Error: ' + e.message) }
  finally { projectStore.isAnalyzing = false }
}

const handleAnalyzeWithExtras = async () => {
  await projectStore.handleAnalyze()
  await fetchHealthReport()
  await fetchGitRecent()
}

onMounted(() => {
  appStore.loadSidebarWidth()
  appStore.loadRecentProjects()
  
  projectStore.fetchGraph().then(() => {
    fetchHealthReport()
    fetchGitRecent()
  })
  
  integrationStore.fetchSettings()
  chatStore.fetchChatSessions()
  integrationStore.fetchHardware()
  
  setInterval(integrationStore.fetchHardware, 5000)
  integrationStore.setupSSE()
})

const handleNodeClick = ({ node, shiftKey }: { node: any, shiftKey: boolean }) => {
  if (shiftKey) {
    const exists = projectStore.selectedNodes.find(n => n.id === node.id)
    if (exists) {
      projectStore.selectedNodes = projectStore.selectedNodes.filter(n => n.id !== node.id)
    } else {
      projectStore.selectedNodes = [...projectStore.selectedNodes, node]
    }
  } else {
    projectStore.selectedNodes = [node]
  }
}

const handleActionWrapper = (action: 'summarize' | 'impact' | 'audit') => {
  chatStore.handleAction(action)
  appStore.activeTab = 'chat'
  appStore.showProjectDropdown = false
}
</script>

<template>
  <div class="layout">
    <!-- Main Content Area (Graph) -->
    <main class="graph-container">
      <div class="graph-header">
        <div class="project-selector">
          <div class="project-input-wrapper">
            <input type="text" v-model="projectStore.targetDir" placeholder="Nhập đường dẫn tuyệt đối của dự án..." :disabled="projectStore.isAnalyzing" @keyup.enter="handleAnalyzeWithExtras" />
            <button v-if="appStore.recentProjects.length > 0" class="btn-dropdown" @click="appStore.showProjectDropdown = !appStore.showProjectDropdown" title="Dự án gần đây">
              <ChevronDown :size="16" />
            </button>
            <!-- Recent Projects Dropdown -->
            <div class="recent-dropdown" v-if="appStore.showProjectDropdown && appStore.recentProjects.length > 0">
              <div class="recent-dropdown-header">Dự án gần đây</div>
              <div class="recent-item" v-for="proj in appStore.recentProjects" :key="proj" @click="projectStore.targetDir = proj; appStore.showProjectDropdown = false; handleAnalyzeWithExtras()">
                <FolderOpen :size="14" />
                <span class="recent-path">{{ proj }}</span>
                <button class="btn-remove" @click.stop="appStore.removeRecentProject(proj)" title="Xoá">
                  <Trash2 :size="12" />
                </button>
              </div>
            </div>
          </div>
          <button class="btn-primary" @click="handleAnalyzeWithExtras" :disabled="projectStore.isAnalyzing">
            {{ projectStore.isAnalyzing ? 'Đang phân tích...' : 'Phân tích' }}
          </button>
        </div>
        <!-- GitHub URL Input -->
        <div class="project-selector" style="margin-top: 0.25rem;">
          <div class="project-input-wrapper">
            <input type="text" v-model="integrationStore.githubUrl" placeholder="GitHub URL (https://github.com/owner/repo)" :disabled="projectStore.isAnalyzing" @keyup.enter="handleGithubAnalyze" style="font-size: 0.8rem;" />
          </div>
          <button class="btn-primary" @click="handleGithubAnalyze" :disabled="projectStore.isAnalyzing || !integrationStore.githubUrl" style="background: #333; border: 1px solid rgba(255,255,255,0.15); font-size: 0.8rem; white-space: nowrap;">
            {{ projectStore.isAnalyzing ? '⏳' : '🔗' }} GitHub
          </button>
          <button v-if="integrationStore.githubUrl && integrationStore.githubSync" class="btn-primary" @click="fetchGithubSync" :disabled="integrationStore.isLoadingSync" style="background: #1a1a2e; border: 1px solid rgba(99,102,241,0.3); font-size: 0.8rem; white-space: nowrap;">
            {{ integrationStore.isLoadingSync ? '⏳' : '🔄' }} Sync
          </button>
        </div>
        <button class="btn-icon btn-layout-toggle" title="Đổi giao diện" @click="projectStore.layoutMode = projectStore.layoutMode === 'force' ? 'architecture' : (projectStore.layoutMode === 'architecture' ? 'features' : 'force')">
          {{ projectStore.layoutMode === 'force' ? '🌐' : (projectStore.layoutMode === 'architecture' ? '🏗️' : '📦') }}
        </button>
        <button class="btn-icon" title="Xuất ảnh đồ thị" @click="exportGraphImage">
          <Camera :size="20" />
        </button>
        <button class="btn-icon" title="Toàn màn hình">
          <Maximize2 :size="20" />
        </button>
      </div>
      <div class="graph-content" id="d3-container">
        <Graph ref="graphRef" v-if="projectStore.graphData" :data="projectStore.graphData" :selectedNodeIds="projectStore.selectedNodes.map(n=>n.id)" :aiReferencedNodes="projectStore.aiReferencedNodes" :layoutMode="projectStore.layoutMode" :physicsConfig="projectStore.physicsConfig" @node-click="handleNodeClick" />
        <div v-else class="placeholder-text">
          <div style="text-align: center; max-width: 400px; padding: 2rem;">
            <h2 style="color: white; margin-bottom: 1rem;">Chưa tải dự án nào</h2>
            <p>Vui lòng nhập đường dẫn tuyệt đối của thư mục dự án ở trên và nhấn Phân tích để bắt đầu.</p>
          </div>
        </div>
      </div>
      
      <!-- Graph Legend -->
      <div class="legend-panel glass-panel" v-if="projectStore.graphData">
        <h4>Chú giải</h4>
        <div class="legend-item">
          <span class="legend-color" style="background: #00ff00"></span> Node đang chọn
        </div>
        <div class="legend-item">
          <span class="legend-color" style="border: 2px solid #00ffff; background: transparent;"></span> AI Đánh dấu
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #ff0000; height: 3px; width: 12px; border-radius: 0;"></span> Liên kết đi (Import)
        </div>
        <div class="legend-item">
          <span class="legend-color" style="background: #00ff00; height: 3px; width: 12px; border-radius: 0;"></span> Liên kết đến (Được Import)
        </div>
        <div class="legend-item">
          <span class="legend-color" style="border: 3px solid #ff4444; background: transparent;"></span> ⚠ Cảnh báo nghiêm trọng
        </div>
        <div class="legend-item">
          <span class="legend-color" style="border: 3px solid #ffaa00; background: transparent;"></span> ⚡ Cảnh báo trung bình
        </div>
        <div class="legend-item">
          <span class="legend-color" style="border: 2px dashed #888; background: rgba(255,255,255,0.1);"></span> File mồ côi (Orphan)
        </div>
        <div class="legend-note">Kích thước Node = số dòng code</div>
        <div class="legend-item">
          <span class="legend-color" style="border: 2px dashed #00ffff; background: transparent;"></span> Luồng phân tích AI
        </div>
        <div class="legend-note" v-if="projectStore.layoutMode === 'architecture'" style="color: #a78bfa">🏗️ Chế độ kiến trúc đang bật</div>
        <div class="legend-note" v-else-if="projectStore.layoutMode === 'features'" style="color: #f472b6">📦 Chế độ tính năng đang bật</div>
      </div>
      
      <!-- Selected Node Panel -->
      <div v-if="projectStore.selectedNodes.length > 0" class="node-panel glass-panel">
        <div class="node-panel-header">
          <h3 :title="projectStore.selectedNodes.length === 1 ? projectStore.selectedNodes[0].id : 'Multiple Files'">
            {{ projectStore.selectedNodes.length === 1 ? projectStore.selectedNodes[0].id.split('/').pop() : `Đã chọn ${projectStore.selectedNodes.length} files` }}
          </h3>
          <button class="btn-icon" @click="projectStore.selectedNodes = []">x</button>
        </div>
        <p v-if="projectStore.selectedNodes.length === 1" class="node-panel-path">{{ projectStore.selectedNodes[0].id }}</p>
        
        <div class="node-stats" v-if="projectStore.selectedNodeStats && projectStore.selectedNodes.length === 1">
          <div class="stat-box">
            <span class="stat-value">{{ projectStore.selectedNodeStats.lines }}</span>
            <span class="stat-label">Số dòng</span>
          </div>
          <div class="stat-box">
            <span class="stat-value">{{ projectStore.selectedNodeStats.imports }}</span>
            <span class="stat-label">Imports</span>
          </div>
          <div class="stat-box">
            <span class="stat-value">{{ projectStore.selectedNodeStats.importedBy }}</span>
            <span class="stat-label">Dùng bởi</span>
          </div>
          <div class="stat-box" style="background: rgba(239, 68, 68, 0.2);" title="Mức độ ảnh hưởng dây chuyền (Blast Radius)">
            <span class="stat-value" style="color: #ef4444">{{ projectStore.selectedNodes[0].id ? '?' : '?' }}</span>
            <span class="stat-label">Ảnh hưởng</span>
          </div>
          <div class="stat-box" v-if="projectStore.selectedNodes[0].gitChanges">
            <span class="stat-value">{{ projectStore.selectedNodes[0].gitChanges }}</span>
            <span class="stat-label">Commits</span>
          </div>
        </div>

        <div class="node-panel-docs" v-if="projectStore.selectedNodes.length === 1 && projectStore.selectedNodes[0].docs && projectStore.selectedNodes[0].docs.length > 0" style="margin-bottom: 1rem;">
          <h4 style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 0.25rem; font-weight: 600;">Tài liệu liên quan</h4>
          <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.8rem;">
            <li v-for="doc in projectStore.selectedNodes[0].docs" :key="doc" style="margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <a :href="doc" target="_blank" style="color: #60a5fa; text-decoration: none;" :title="doc">🔗 {{ doc }}</a>
            </li>
          </ul>
        </div>

        <div class="node-panel-actions">
          <button class="btn-secondary btn-sm" @click="handleActionWrapper('summarize')" :disabled="chatStore.isChatLoading">Tóm tắt</button>
          <button class="btn-secondary btn-sm" @click="handleActionWrapper('impact')" :disabled="chatStore.isChatLoading">Ảnh hưởng</button>
          <button class="btn-primary btn-sm" @click="handleActionWrapper('audit')" :disabled="chatStore.isChatLoading" title="Kiểm tra sâu (Audit)">{{ chatStore.isChatLoading ? '⏳ Đang Audit...' : 'AI Audit' }}</button>
        </div>
        <div class="node-panel-actions" style="margin-top: 0.5rem">
          <button class="btn-secondary w-full" @click="projectStore.highlightBlastRadius" v-if="projectStore.selectedNodes.length === 1">Đánh dấu đường dẫn</button>
        </div>
      </div>
    </main>

    <!-- Resizer Handle -->
    <div 
      class="sidebar-resizer" 
      @mousedown="appStore.startResizing" 
      :class="{ active: appStore.isResizing }"
      title="Kéo để đổi kích thước"
    ></div>

    <!-- Sidebar -->
    <aside class="sidebar glass-panel" :style="{ width: appStore.sidebarWidth + 'px' }">
      <header class="sidebar-header">
        <div class="tabs">
          <button class="tab" :class="{ active: appStore.activeTab === 'chat' }" @click="appStore.activeTab = 'chat'; appStore.showProjectDropdown = false">
            <MessageSquare :size="16" />
            <span>Trò chuyện</span>
          </button>
          <button class="tab" :class="{ active: appStore.activeTab === 'knowledge' }" @click="appStore.activeTab = 'knowledge'">
            <Database :size="16" />
            <span>RAG</span>
          </button>
          <button class="tab" :class="{ active: appStore.activeTab === 'features' }" @click="appStore.activeTab = 'features'">
            <span>Tính năng</span>
          </button>
          <button class="tab" :class="{ active: appStore.activeTab === 'health' }" @click="appStore.activeTab = 'health'">
            <span>Sức khoẻ</span>
          </button>
          <button class="tab" :class="{ active: appStore.activeTab === 'settings' }" @click="appStore.activeTab = 'settings'">
            <Settings :size="16" />
          </button>
          <button class="tab" :class="{ active: appStore.activeTab === 'guide' }" @click="appStore.activeTab = 'guide'; integrationStore.loadGuideContent()">
            <span>📖</span>
          </button>
        </div>
        <div class="chat-actions" v-if="appStore.activeTab === 'chat'">
          <button class="btn-icon-sm" @click="chatStore.showHistoryPanel = !chatStore.showHistoryPanel" title="Lịch sử Chat" :class="{ active: chatStore.showHistoryPanel }">
            <History :size="16" />
          </button>
          <button class="btn-icon-sm" @click="chatStore.newChatSession()" title="Đoạn chat mới">
            <Plus :size="16" />
          </button>
        </div>
      </header>

      <div class="sidebar-content">
        <component 
          :is="appStore.activeTab === 'chat' ? ChatTab 
            : appStore.activeTab === 'features' ? FeaturesTab 
            : appStore.activeTab === 'health' ? HealthTab 
            : appStore.activeTab === 'knowledge' ? KnowledgeTab 
            : appStore.activeTab === 'settings' ? SettingsTab 
            : appStore.activeTab === 'guide' ? GuideTab 
            : ChatTab" 
        />
      </div>
    </aside>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  width: 100vw;
  height: 100vh;
}

.graph-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
}

.graph-header {
  position: absolute;
  top: 1.5rem;
  left: 1.5rem;
  right: 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
  pointer-events: none;
}

.graph-header h1 {
  font-size: 1.5rem;
  font-weight: 600;
  text-shadow: 0 2px 4px rgba(0,0,0,0.5);
}

.graph-header button {
  pointer-events: auto;
}

.project-selector {
  display: flex;
  gap: 0.5rem;
  background: var(--surface-color);
  padding: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--border-color);
  pointer-events: auto;
  align-items: center;
}

.project-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.project-input-wrapper input {
  min-width: 300px;
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.1);
  color: white;
  padding: 0.5rem;
  padding-right: 2rem;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.btn-dropdown {
  position: absolute;
  right: 0.25rem;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
}

.btn-dropdown:hover {
  color: var(--text-primary);
  background: rgba(255,255,255,0.1);
}

.recent-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 0.25rem;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  border-radius: 0.5rem;
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
}

.recent-dropdown-header {
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
  border-bottom: 1px solid var(--border-color);
}

.recent-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  font-size: 0.8125rem;
  color: var(--text-secondary);
  transition: background 0.15s;
}

.recent-item:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.recent-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-remove {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
  opacity: 0;
  transition: opacity 0.15s;
}

.recent-item:hover .btn-remove {
  opacity: 1;
}

.btn-remove:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.graph-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder-text {
  color: var(--text-secondary);
  font-size: 1.25rem;
  opacity: 0.5;
}

.node-panel {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  width: 300px;
  padding: 1.5rem;
  z-index: 10;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
}

.node-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.node-panel-header h3 {
  font-size: 1.125rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-panel-path {
  font-size: 0.875rem;
  color: var(--text-secondary);
  word-break: break-all;
}

.node-stats {
  display: flex;
  gap: 0.5rem;
  margin: 0.5rem 0;
}

.stat-box {
  flex: 1;
  background: rgba(0,0,0,0.2);
  border-radius: 0.5rem;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.stat-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--text-secondary);
  letter-spacing: 0.05em;
}

.node-panel-actions {
  display: flex;
  gap: 0.5rem;
}

.node-panel-actions button {
  flex: 1;
  padding: 0.5rem;
  font-size: 0.875rem;
}

.legend-panel {
  position: absolute;
  bottom: 1.5rem;
  left: 1.5rem;
  padding: 1rem;
  z-index: 10;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--surface-color);
  border: 1px solid var(--border-color);
  pointer-events: none;
}

.legend-panel h4 {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.legend-color {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.legend-note {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  font-style: italic;
}

.sidebar-resizer {
  width: 4px;
  cursor: col-resize;
  background: var(--border-color);
  height: 100vh;
  transition: background 0.2s, width 0.2s;
  z-index: 100;
}

.sidebar-resizer:hover, .sidebar-resizer.active {
  background: var(--accent-color);
  width: 6px;
}

.sidebar {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--surface-color);
  border-left: 1px solid var(--border-color);
}

.sidebar-header {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.chat-actions {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
}

.btn-icon-sm {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.375rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.btn-icon-sm:hover, .btn-icon-sm.active {
  color: var(--text-primary);
  background: var(--surface-hover);
}

.tabs {
  display: flex;
  gap: 0.5rem;
  background: rgba(0,0,0,0.2);
  padding: 0.25rem;
  border-radius: 0.5rem;
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.tab.active {
  background: var(--surface-hover);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.tab:hover:not(.active) {
  color: var(--text-primary);
}

.sidebar-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.btn-layout-toggle {
  font-size: 1.25rem;
  padding: 0.3rem 0.5rem;
}

.btn-sm {
  font-size: 0.8rem;
  padding: 0.3rem 0.6rem;
}

.w-full {
  width: 100%;
}
</style>

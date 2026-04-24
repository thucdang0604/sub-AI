<template>
  <div class="health-area">
    <div style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
      <h2 style="font-size: 1.25rem; font-weight: 600">Tình trạng Sức khỏe Kiến trúc</h2>
      
      <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
        <input type="text" v-model="projectStore.healthSearch" placeholder="Lọc file..." style="flex: 1; padding: 0.5rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 0.25rem; color: white;" />
      </div>

      <div v-if="projectStore.isLoadingHealth" style="text-align: center; padding: 2rem;">
        ⏳ Đang phân tích sức khỏe...
      </div>
      <div v-else-if="projectStore.healthReport">
        <!-- Orphan Files -->
        <h3 style="font-size: 1rem; color: #ef4444; border-bottom: 1px solid #ef4444; padding-bottom: 0.25rem;">🗑️ Orphan Files (Chưa được sử dụng) ({{ filteredOrphans.length }})</h3>
        <div style="max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 1rem;">
          <div v-for="file in filteredOrphans" :key="file.id" style="font-size: 0.85rem; padding: 0.25rem 0; cursor: pointer;" @click="projectStore.selectedNodes = [file]">
            {{ file.id }}
          </div>
        </div>

        <!-- God Files -->
        <h3 style="font-size: 1rem; color: #f59e0b; border-bottom: 1px solid #f59e0b; padding-bottom: 0.25rem;">⚠️ God Files (> 10 imports/exports) ({{ filteredGodFiles.length }})</h3>
        <div style="max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 1rem;">
          <div v-for="file in filteredGodFiles" :key="file.id" style="font-size: 0.85rem; padding: 0.25rem 0; cursor: pointer; display: flex; justify-content: space-between;" @click="projectStore.selectedNodes = [file]">
            <span>{{ file.id }}</span>
            <span style="color: var(--text-secondary)">{{ file.totalEdges }} liên kết</span>
          </div>
        </div>
        
        <!-- Circular Dependencies -->
        <h3 style="font-size: 1rem; color: #f43f5e; border-bottom: 1px solid #f43f5e; padding-bottom: 0.25rem;">🔁 Circular Dependencies (Lỗi vòng lặp)</h3>
        <div style="max-height: 200px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 1rem;">
          <div v-if="projectStore.healthReport.circularDependencies?.length === 0" style="color: #10b981; font-size: 0.85rem;">
            ✅ Không phát hiện vòng lặp dependency!
          </div>
          <div v-else v-for="(cycle, idx) in projectStore.healthReport.circularDependencies" :key="idx" style="font-size: 0.85rem; padding: 0.5rem 0; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <div style="color: #f43f5e; font-weight: bold; margin-bottom: 0.25rem;">Vòng lặp #{{ Number(idx) + 1 }}</div>
            <div style="padding-left: 1rem; color: var(--text-secondary);">
              {{ cycle.join(' ➔ ') }}
            </div>
          </div>
        </div>

        <!-- AI Recommend Button -->
        <button class="btn-primary" style="width: 100%; margin-top: 1rem;" @click="integrationStore.handleAuditRecommend" :disabled="integrationStore.isAuditing">
          {{ integrationStore.isAuditing ? 'Đang phân tích...' : '🤖 AI Khuyến nghị Khắc phục' }}
        </button>
        
        <!-- Audit Result -->
        <div v-if="integrationStore.auditResult" class="audit-result markdown-body" v-html="marked(integrationStore.auditResult)" style="margin-top: 1rem; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 0.5rem; font-size: 0.85rem; border-left: 3px solid #f59e0b;"></div>
      </div>
      <div v-else style="text-align: center; color: var(--text-secondary); padding: 2rem;">
        Cần phân tích dự án để xem báo cáo sức khỏe.
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { marked } from 'marked'
import { useProjectStore } from '../../stores/useProjectStore'
import { useIntegrationStore } from '../../stores/useIntegrationStore'

const projectStore = useProjectStore()
const integrationStore = useIntegrationStore()

const filteredOrphans = computed(() => {
  if (!projectStore.healthReport?.orphanFiles) return []
  const list = projectStore.healthReport.orphanFiles
  if (!projectStore.healthSearch) return list
  return list.filter((f: any) => f.id.toLowerCase().includes(projectStore.healthSearch.toLowerCase()))
})

const filteredGodFiles = computed(() => {
  if (!projectStore.healthReport?.godFiles) return []
  const list = projectStore.healthReport.godFiles
  if (!projectStore.healthSearch) return list
  return list.filter((f: any) => f.id.toLowerCase().includes(projectStore.healthSearch.toLowerCase()))
})
</script>

<style scoped>
.health-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
}
.warning-msg {
  display: block;
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 0.15rem;
}
.audit-result :deep(h1),
.audit-result :deep(h2),
.audit-result :deep(h3) {
  color: #e2e8f0;
  margin-top: 1.2rem;
  margin-bottom: 0.5rem;
}
.audit-result :deep(h1) {
  font-size: 1.3rem;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 0.5rem;
}
.audit-result :deep(h2) {
  font-size: 1.1rem;
}
.audit-result :deep(h3) {
  font-size: 0.95rem;
}

.markdown-body :deep(p) { margin: 0 0 0.5rem 0; }
.markdown-body :deep(p:last-child) { margin-bottom: 0; }
.markdown-body :deep(pre) { background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 0.25rem; overflow-x: auto; }
.markdown-body :deep(code) { font-family: monospace; background: rgba(0,0,0,0.2); padding: 0.1rem 0.2rem; border-radius: 0.2rem; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin: 0.5rem 0; padding-left: 1.5rem; }
</style>

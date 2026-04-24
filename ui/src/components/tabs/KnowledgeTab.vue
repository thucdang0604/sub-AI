<template>
  <div class="knowledge-area">
    <div style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1.5rem;">
      
      <!-- Section 1: RAG Status -->
      <div>
        <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">🧠 Project Knowledge Base</h2>
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--border-color);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
            <div>
              <div style="font-weight: 500;">Trạng thái Index: 
                <span :style="{ color: integrationStore.indexStatus?.isIndexed ? '#10b981' : '#f59e0b' }">
                  {{ integrationStore.indexStatus?.isIndexed ? '✅ Đã Index' : '⚠️ Chưa Index' }}
                </span>
              </div>
              <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;" v-if="integrationStore.indexStatus?.isIndexed">
                Chunks: {{ integrationStore.indexStatus.chunkCount }} | Cập nhật: {{ new Date(integrationStore.indexStatus.lastUpdated!).toLocaleString() }}
              </div>
            </div>
            <button class="btn-primary" @click="integrationStore.handleIndexKnowledge(projectStore.targetDir)">
              {{ integrationStore.indexStatus?.isIndexed ? '🔄 Cập nhật Index' : '🚀 Tạo Index mới' }}
            </button>
          </div>
          
          <!-- Progress Bar during Indexing -->
          <div v-if="integrationStore.activityProgress" style="margin-top: 1rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.25rem;">
              <span>Tiến độ: {{ integrationStore.activityProgress.message }}</span>
              <span>{{ Math.round((integrationStore.activityProgress.current / integrationStore.activityProgress.total) * 100) }}%</span>
            </div>
            <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
              <div :style="{ width: `${(integrationStore.activityProgress.current / integrationStore.activityProgress.total) * 100}%` }" style="height: 100%; background: #10b981; transition: width 0.3s;"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Section 2: Semantic Search -->
      <div v-if="integrationStore.indexStatus?.isIndexed">
        <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">🔍 Tìm kiếm Ngữ nghĩa</h3>
        <div style="display: flex; gap: 0.5rem;">
          <input type="text" v-model="integrationStore.searchQuery" placeholder="Ví dụ: Nơi xử lý đăng nhập ở đâu?" style="flex: 1; padding: 0.5rem; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); border-radius: 0.25rem; color: white;" @keyup.enter="integrationStore.handleSearchKnowledge(projectStore.targetDir)" />
          <button class="btn-secondary" @click="integrationStore.handleSearchKnowledge(projectStore.targetDir)" :disabled="integrationStore.isSearching">
            {{ integrationStore.isSearching ? '⏳...' : 'Tìm' }}
          </button>
        </div>
        
        <div v-if="integrationStore.searchResults.length > 0" style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.75rem;">
          <div v-for="(res, idx) in integrationStore.searchResults" :key="idx" style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 0.5rem; border-left: 3px solid #3b82f6;">
            <div style="font-size: 0.75rem; color: #3b82f6; margin-bottom: 0.25rem;">Score: {{ res.score.toFixed(3) }}</div>
            <div class="markdown-body" v-html="marked(res.content)" style="font-size: 0.85rem;"></div>
          </div>
        </div>
      </div>

      <!-- Section 3: GitHub Integration -->
      <div v-if="integrationStore.hasGithubToken">
        <h3 style="font-size: 1rem; font-weight: 600; margin-bottom: 0.5rem;">🐙 Quản lý GitHub</h3>
        <div style="background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 0.5rem; border: 1px solid var(--border-color);">
          <div v-if="!integrationStore.showIssuePreview" style="display: flex; flex-direction: column; gap: 0.5rem;">
            <p style="font-size: 0.85rem; color: var(--text-secondary);">
              Sub-AI có thể phân tích báo cáo sức khỏe (God files, circular deps) và tự động tạo GitHub Issues cho dự án này.
            </p>
            <button class="btn-primary" @click="previewIssues" :disabled="!projectStore.healthReport">
              👁️ Xem trước Issues
            </button>
          </div>
          
          <div v-else style="display: flex; flex-direction: column; gap: 1rem;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h4 style="font-size: 0.9rem; font-weight: 600;">Sẽ tạo {{ integrationStore.issuePreview.length }} Issues:</h4>
              <button class="btn-secondary btn-sm" @click="integrationStore.showIssuePreview = false">Hủy</button>
            </div>
            
            <div style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.5rem;">
              <div v-for="(issue, idx) in integrationStore.issuePreview" :key="idx" style="background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 0.25rem; border-left: 2px solid #10b981;">
                <div style="font-weight: 600; font-size: 0.85rem; margin-bottom: 0.25rem;">{{ issue.title }}</div>
                <div style="font-size: 0.75rem; color: var(--text-secondary);">Nhãn: {{ issue.labels.join(', ') }}</div>
              </div>
            </div>
            
            <button class="btn-primary" style="background: #10b981;" @click="createIssues" :disabled="integrationStore.isCreatingIssues">
              {{ integrationStore.isCreatingIssues ? '⏳ Đang tạo...' : '🚀 Tạo tất cả Issues' }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'
import { useIntegrationStore } from '../../stores/useIntegrationStore'
import { useProjectStore } from '../../stores/useProjectStore'

const integrationStore = useIntegrationStore()
const projectStore = useProjectStore()

const previewIssues = () => {
  if (!projectStore.healthReport) {
    alert('Vui lòng phân tích dự án để có báo cáo sức khỏe trước.');
    return;
  }
  const issues = [];
  if (projectStore.healthReport.orphanFiles?.length > 0) {
    issues.push({
      title: 'Cleanup: Remove Orphan Files',
      body: `Phát hiện ${projectStore.healthReport.orphanFiles.length} file không được sử dụng.\n\nDanh sách:\n${projectStore.healthReport.orphanFiles.map((f: any) => '- ' + f.id).join('\n')}`,
      labels: ['tech-debt', 'cleanup']
    });
  }
  if (projectStore.healthReport.godFiles?.length > 0) {
    for (const f of projectStore.healthReport.godFiles) {
      issues.push({
        title: `Refactor: God File detected - ${f.id.split('/').pop()}`,
        body: `File \`${f.id}\` có quá nhiều liên kết (${f.totalEdges} edges). Cần được chia nhỏ để dễ bảo trì.`,
        labels: ['refactor', 'architectural-health']
      });
    }
  }
  if (projectStore.healthReport.circularDependencies?.length > 0) {
    issues.push({
      title: 'Fix: Circular Dependencies Detected',
      body: `Phát hiện ${projectStore.healthReport.circularDependencies.length} vòng lặp phụ thuộc. Cần tái cấu trúc để gỡ rối.\n\nChi tiết xem tại Sub-AI Dashboard.`,
      labels: ['bug', 'architecture']
    });
  }
  
  integrationStore.issuePreview = issues;
  integrationStore.showIssuePreview = true;
}

const createIssues = async () => {
  if (!projectStore.targetDir) return;
  integrationStore.isCreatingIssues = true;
  try {
    const res = await fetch('/api/git/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetDir: projectStore.targetDir,
        issues: integrationStore.issuePreview
      })
    });
    const data = await res.json();
    if (res.ok) {
      integrationStore.issueCreateResult = data;
      alert(`Đã tạo thành công ${data.created.length} issues!`);
      integrationStore.showIssuePreview = false;
    } else {
      alert('Lỗi: ' + data.error);
    }
  } catch (e) {
    console.error(e);
    alert('Không thể tạo issues. Xem console để biết chi tiết.');
  } finally {
    integrationStore.isCreatingIssues = false;
  }
}
</script>

<style scoped>
.knowledge-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
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

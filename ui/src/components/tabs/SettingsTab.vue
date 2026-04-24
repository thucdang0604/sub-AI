<template>
  <div class="settings-area">
    <h2>Cấu hình</h2>
    <div class="form-group">
      <label>Mô hình (Model) đang dùng</label>
      <select v-model="integrationStore.activeModel">
        <option v-if="models.length === 0" value="">Đang tải models...</option>
        <option v-for="model in models" :key="model.id" :value="model.id">
          {{ model.name || model.id }} ({{ model.provider }})
        </option>
      </select>
    </div>
    <div class="form-group">
      <label>OpenAI API Key</label>
      <input type="password" v-model="integrationStore.openAIKey" placeholder="sk-..." />
    </div>
    <div class="form-group">
      <label>Gemini API Key</label>
      <input type="password" v-model="integrationStore.geminiKey" placeholder="AIzaSy..." />
    </div>
    <button class="btn-primary w-full mt-4" @click="integrationStore.saveSettings">Lưu Cài đặt</button>

    <h2 class="mt-4">🔗 GitHub Integration</h2>
    <div class="form-group">
      <label>GitHub Personal Access Token <span :style="{ color: integrationStore.hasGithubToken ? '#10b981' : '#ef4444' }">{{ integrationStore.hasGithubToken ? '✅ Đã cấu hình' : '❌ Chưa cấu hình' }}</span></label>
      <input type="password" v-model="integrationStore.githubToken" placeholder="ghp_xxxxxxxxxxxx..." />
      <p style="font-size: 0.7rem; color: var(--text-secondary); margin-top: 0.25rem;">
        Tạo tại: <a href="https://github.com/settings/tokens" target="_blank" style="color: #6366f1;">GitHub Settings → Tokens</a> — Cần quyền: Contents (read), Issues (read/write)
      </p>
    </div>
    <button class="btn-primary w-full" @click="integrationStore.saveSettings" :disabled="!integrationStore.githubToken" style="background: linear-gradient(135deg, #6366f1, #8b5cf6);">
      💾 Lưu GitHub Token
    </button>

    <h2 class="mt-4">Cấu hình Vật lý (Chế độ Features)</h2>
    <div class="form-group">
      <label>Khoảng cách các Cụm: {{ projectStore.physicsConfig.featureSpacing }}px</label>
      <input type="range" min="300" max="1500" step="50" v-model.number="projectStore.physicsConfig.featureSpacing" />
    </div>
    <div class="form-group">
      <label>Lực hút trung tâm cụm: {{ projectStore.physicsConfig.clusterGravity }}</label>
      <input type="range" min="0.1" max="2.0" step="0.1" v-model.number="projectStore.physicsConfig.clusterGravity" />
    </div>
    <div class="form-group">
      <label>Lực đẩy giữa các Node: {{ projectStore.physicsConfig.repulsion }}</label>
      <input type="range" min="-1000" max="-100" step="50" v-model.number="projectStore.physicsConfig.repulsion" />
    </div>
    <div class="form-group">
      <label>Chiều dài liên kết: {{ projectStore.physicsConfig.linkDistance }}px</label>
      <input type="range" min="50" max="300" step="10" v-model.number="projectStore.physicsConfig.linkDistance" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useIntegrationStore } from '../../stores/useIntegrationStore'
import { useProjectStore } from '../../stores/useProjectStore'

const integrationStore = useIntegrationStore()
const projectStore = useProjectStore()

const models = ref<any[]>([])

const fetchModels = async () => {
  try {
    const res = await fetch('/api/system')
    if (res.ok) {
      const data = await res.json()
      models.value = data.AVAILABLE_MODELS || []
    }
  } catch (e) {
    console.error('Failed to load models', e)
  }
}

onMounted(() => {
  fetchModels()
})
</script>

<style scoped>
.settings-area {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  overflow-y: auto;
  height: 100%;
}

.settings-area h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-size: 0.875rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.w-full {
  width: 100%;
}
.mt-4 {
  margin-top: 1rem;
}
</style>

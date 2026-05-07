<template>
  <div>
    <Tree :value="treeNodes" class="w-lg" selectionMode="multiple" v-model:selectionKeys="selectedKeys" @node-select="onNodeSelect">
      <template #default="slotProps">
        <div class="flex flex-row gap-2">
          <component :is="slotProps.node.icon"></component>
          {{ slotProps.node.label }}
        </div>
    </template>
    </Tree>
    {{ selectedKeys }}
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import Tree from 'primevue/tree'
import { AlignLeft, Archive, ArrowLeftRight, BookOpen, Boxes, Building2, Calendar, CheckCircle2, Clock3, Database, Download, File, FileIcon, FileType, FolderTree, GitBranch, Globe, HardDrive, Hash, Languages, Link2, Link2Icon, ListTree, Lock, Palette, Phone, Repeat, Ruler, Scale, Server, Settings2, ShieldCheck, Tag, Type, User, Workflow } from '@lucide/vue'
import type { TreeNode } from 'primevue/treenode'

/**
 * Tree node type (PrimeVue)
 */
type OwnTreeNode = {
  key: string
  label: string
  children?: OwnTreeNode[]
  icon: any
}

function toggleChildren(node: TreeNode, checked: boolean) {
  if (!node.children?.length) return

  for (const child of node.children) {
    selectedKeys.value[child.key] = checked

    // recursive
    toggleChildren(child, checked)
  }
}

function onNodeSelect(node: TreeNode) {
  // selectedKeys.value[node.key] = true
  toggleChildren(node, true)
}

function onNodeUnselect(node: OwnTreeNode) {
  delete selectedKeys.value[node.key]
  toggleChildren(node, false)
}

const treeNodes = ref<OwnTreeNode[]>([
  {
    key: 'distribution',
    icon: FileIcon,
    label: 'Distribution',
    children: [
      { key: 'uri', label: 'URI', icon: Link2 },

      { key: 'title', label: 'Title', icon: Type },
      { key: 'description', label: 'Description', icon: AlignLeft },

      { key: 'issued', label: 'Issued', icon: Calendar },
      { key: 'modified', label: 'Modified', icon: Calendar },

      { key: 'license', label: 'License', icon: Scale },
      { key: 'rights', label: 'Rights', icon: ShieldCheck },

      { key: 'language', label: 'Language', icon: Languages },

      { key: 'accessURL', label: 'Access URL', icon: Globe },
      { key: 'downloadURL', label: 'Download URL', icon: Download },

      { key: 'format', label: 'Format', icon: FileType },
      { key: 'mediaType', label: 'Media Type', icon: FileType },
      { key: 'compressFormat', label: 'Compress Format', icon: Archive },
      { key: 'packageFormat', label: 'Package Format', icon: Archive },

      { key: 'byteSize', label: 'Byte Size', icon: HardDrive },

      {
        key: 'spatialResolutionInMeters',
        label: 'Spatial Resolution',
        icon: Ruler,
      },

      {
        key: 'temporalResolution',
        label: 'Temporal Resolution',
        icon: Clock3,
      },
    ],
  },

  {
    key: 'dataset',
    icon: FileIcon,
    label: 'Dataset',
    children: [
      { key: 'uri', label: 'URI', icon: Link2 },

      { key: 'title', label: 'Title', icon: Type },
      { key: 'description', label: 'Description', icon: AlignLeft },
      { key: 'identifier', label: 'Identifier', icon: Hash },

      { key: 'issued', label: 'Issued', icon: Calendar },
      { key: 'modified', label: 'Modified', icon: Calendar },

      { key: 'language', label: 'Language', icon: Languages },

      { key: 'license', label: 'License', icon: Scale },
      { key: 'rights', label: 'Rights', icon: ShieldCheck },
      { key: 'accessRights', label: 'Access Rights', icon: Lock },

      { key: 'keyword', label: 'Keyword', icon: Tag },

      { key: 'landingPage', label: 'Landing Page', icon: Globe },

      { key: 'version', label: 'Version', icon: GitBranch },
      { key: 'versionNotes', label: 'Version Notes', icon: AlignLeft },

      {
        key: 'spatialResolutionInMeters',
        label: 'Spatial Resolution',
        icon: Ruler,
      },

      {
        key: 'temporalResolution',
        label: 'Temporal Resolution',
        icon: Clock3,
      },
    ],
  },

  {
    key: 'dataService',
    icon: Globe,
    label: 'Data Service',
    children: [
      { key: 'endpointURL', label: 'Endpoint URL', icon: Link2 },
    ],
  },

  {
    key: 'catalogRecord',
    icon: FileIcon,
    label: 'Catalog Record',
    children: [
      { key: 'uri', label: 'URI', icon: Link2 },

      { key: 'title', label: 'Title', icon: Type },
      { key: 'description', label: 'Description', icon: AlignLeft },

      { key: 'issued', label: 'Issued', icon: Calendar },
      { key: 'modified', label: 'Modified', icon: Calendar },

      { key: 'language', label: 'Language', icon: Languages },
    ],
  },

  {
    key: 'inferOptions',
    icon: Settings2,
    label: 'Infer Options',
    children: [
      { key: 'baseUri', label: 'Base URI', icon: Link2 },
      { key: 'outPath', label: 'Output Path', icon: FileIcon },
      { key: 'verbose', label: 'Verbose', icon: AlignLeft },
    ],
  },
])

const selectedKeys = ref();
</script>

<style scoped>
.w-full {
  width: 100%;
}
</style>
<script setup lang="ts">
import type { ItemId } from '@oddbid/shared';
defineProps<{ item: ItemId; compact?: boolean }>();
const keys = Array.from({ length: 30 }, (_, i) => ({
  x: 80 + (i % 10) * 20,
  y: 105 + Math.floor(i / 10) * 24,
}));
</script>

<template>
  <svg viewBox="0 0 360 280" class="item-art" :class="{ compact }" fill="none" aria-hidden="true">
    <ellipse cx="181" cy="242" rx="102" ry="10" fill="#253e35" opacity=".09" />
    <g v-if="item === 'duck'" stroke="#324737" stroke-width="2.6" stroke-linejoin="round">
      <path
        d="M93 165c-21-4-28-13-29-25 20 7 35 0 45-14l16-19 86 8c33 11 64 37 59 73-6 41-58 48-97 43-51-5-71-28-80-66Z"
        fill="#f2cb45"
      />
      <path
        d="M191 147c26 8 39 21 29 41-9 18-37 22-58 12"
        stroke="#b89126"
        stroke-linecap="round"
      />
      <path
        d="M227 130c32-8 38-38 24-61-13-21-42-26-62-15-27 14-33 56-10 77l-4 30 42 7 10-38Z"
        fill="#f6d75d"
      />
      <path d="M247 93c14-7 22 0 27 10 4 8 17 9 23 15-18 14-42 9-56-2" fill="#e59252" />
      <path d="M265 110h13" stroke="#b36941" stroke-linecap="round" />
      <ellipse cx="230" cy="82" rx="4" ry="6" fill="#324737" stroke="none" />
      <circle cx="231" cy="80" r="1.2" fill="white" stroke="none" />
      <path d="m195 46 8-14 8 12 11-8 3 13" fill="#f8ecc0" stroke-width="2" />
      <path d="M178 136c13 9 30 14 45 13l-2 15c-18 0-34-5-44-13l1-15Z" fill="#f8f1dc" />
      <path d="m206 161-8 20 16-3 8-13" fill="#df8068" />
      <path
        d="m104 56 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z"
        fill="#fcf8ed"
        stroke-width="1.5"
      />
      <path d="M288 169v14m-7-7h14M77 204v10m-5-5h10" stroke-width="1.5" stroke-linecap="round" />
    </g>
    <g v-else-if="item === 'keyboard'" stroke="#344639" stroke-width="2.5" stroke-linejoin="round">
      <path d="M135 78V55c0-18 27-23 27-3s28 16 28-4V32" stroke="#7c698f" />
      <path d="M64 86h228l17 116H48L64 86Z" fill="#a993cf" />
      <path d="M48 202v17h261v-17" fill="#86739c" />
      <rect
        v-for="(key, i) in keys"
        :key="i"
        :x="key.x"
        :y="key.y"
        width="15"
        height="16"
        rx="3"
        :fill="i === 0 ? '#e69783' : '#f3ecf7'"
        stroke-width="1.4"
      />
      <rect x="107" y="177" width="127" height="14" rx="4" fill="#f3ecf7" stroke-width="1.5" />
      <path d="m287 48 4 9 10 4-10 3-4 10-3-10-10-3 10-4 3-9Z" fill="#fcf7e9" stroke-width="1.5" />
      <text
        x="87.5"
        y="116"
        text-anchor="middle"
        fill="#344639"
        stroke="none"
        font-size="5"
        font-weight="700"
      >
        ESC
      </text>
    </g>
    <g v-else-if="item === 'banana'" stroke="#4d4830" stroke-width="2.5" stroke-linejoin="round">
      <path
        d="M91 185c44 10 112-17 155-104l17 17c-13 83-68 142-133 132-25-4-39-24-39-45Z"
        fill="#eec54a"
      />
      <path d="M96 190c54 29 128-28 156-95" stroke="#a57d24" />
      <path d="m246 81 3-25 19 3-5 39-17-17Z" fill="#d7b13e" />
      <path d="m91 185-16-3-2 18 20 2" fill="#a38434" />
      <path
        d="m170 71 5 17 18 5-18 5-5 17-5-17-17-5 17-5 5-17ZM278 169l4 11 11 4-11 3-4 12-4-12-11-3 11-4 4-11Z"
        fill="#fff9e2"
        stroke-width="1.5"
      />
      <path d="M121 91v12m-6-6h12" stroke-width="1.5" stroke-linecap="round" />
    </g>
    <g v-else-if="item === 'sock'" stroke="#4b4337" stroke-width="2.5" stroke-linejoin="round">
      <path
        d="m161 62 67 9-20 123c-3 27-18 41-44 42l-51-5c-21-2-35-20-27-36 5-11 17-17 34-15l22 2 19-120Z"
        fill="#e8998b"
      />
      <path d="m158 82 66 10 6-30-67-11-5 31Z" fill="#faefda" />
      <path
        d="m167 58-4 23m16-21-4 22m17-20-4 22m17-20-4 22m17-20-4 22"
        stroke="#c6bba2"
        stroke-width="1.5"
      />
      <path d="M92 188c12 1 20 13 16 40m81-66c-10 8-10 34 10 42" stroke="#bb7369" />
      <path
        d="m177 122 6 9 11 2-8 9 1 11-11-5-10 5 1-11-8-9 12-2 6-9Z"
        fill="#f5d36c"
        stroke-width="1.5"
      />
      <path
        d="m105 87 4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10Z"
        fill="#fcf7e9"
        stroke-width="1.5"
      />
    </g>
    <g v-else stroke="#344b40" stroke-width="2.5" stroke-linejoin="round">
      <circle cx="180" cy="127" r="88" fill="#d6ebe3" />
      <path
        d="M103 165c29-14 38-9 54-6 24 8 56-18 100-4-11 40-34 61-78 61-35 0-64-20-76-51Z"
        fill="#f0d992"
        stroke="none"
      />
      <path d="m178 168 8-67" stroke="#9c8761" stroke-width="6" />
      <path
        d="M186 107c-23-24-38-9-43 7 18-11 26-9 43-7Zm0-1c6-29 32-21 42-5-20-8-30-3-42 5Zm0 0c-7-23-2-35 10-41-1 15-8 28-10 41Z"
        fill="#77a18c"
      />
      <path d="M113 209h135l9 27H104l9-27Z" fill="#91b8a6" />
      <path d="M129 73c-14 10-21 22-22 35" stroke="white" stroke-width="7" stroke-linecap="round" />
      <circle cx="231" cy="135" r="3" fill="white" stroke="none" />
      <circle cx="134" cy="127" r="3" fill="white" stroke="none" />
      <circle cx="161" cy="71" r="2" fill="white" stroke="none" />
      <path d="M150 222h59" stroke="#557865" stroke-linecap="round" />
    </g>
  </svg>
</template>

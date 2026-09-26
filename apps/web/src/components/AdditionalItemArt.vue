<script setup lang="ts">
defineProps<{ item: string }>();

const paper = 'var(--art-paper, #eeeade)';
const accent = 'var(--art-accent, #e89a7c)';
const ink = 'var(--art-ink, #383a35)';
const dialHoles = Array.from({ length: 10 }, (_, index) => {
  const angle = ((index * 28 - 215) * Math.PI) / 180;
  return { x: 180 + Math.cos(angle) * 32, y: 175 + Math.sin(angle) * 32 };
});
const notebookRings = [81, 107, 133, 159, 185, 211];
</script>

<template>
  <g v-if="item === 'teapot'" data-art-id="teapot">
    <path d="M233 118c44-17 64 13 44 43-10 15-23 22-41 23" stroke-width="11" />
    <path d="M233 118c44-17 64 13 44 43-10 15-23 22-41 23" :stroke="accent" stroke-width="6" />
    <path
      d="M125 154c-25 0-29-17-33-30l-18-15c-5-4-10 0-8 6 10 12 11 45 33 64l28 11"
      :fill="accent"
    />
    <path
      d="M137 111c-20 14-30 32-30 58 0 35 29 57 71 57s72-22 72-57c0-26-11-44-31-58H137Z"
      :fill="paper"
    />
    <path d="M118 180c28 12 83 18 119-1" :stroke="accent" stroke-width="13" />
    <path d="M130 113c15-25 79-25 96 0H130Z" :fill="accent" />
    <ellipse cx="178" cy="86" rx="12" ry="9" :fill="paper" />
    <path d="M138 137c-9 10-12 23-11 34" opacity=".4" stroke-width="2" />
    <path d="M141 224h75" stroke-width="4" />
  </g>

  <g v-else-if="item === 'toaster'" data-art-id="toaster">
    <path d="M107 133V79c-10-22 7-41 26-34 16-10 38-3 41 15v73" :fill="paper" />
    <path d="M179 131V85c-11-21 4-39 24-33 17-9 37 0 39 17v62" :fill="paper" />
    <path d="M119 91V74m73 22V80" :stroke="accent" stroke-width="5" />
    <rect x="82" y="114" width="190" height="109" rx="24" :fill="accent" />
    <path d="M101 128h149" stroke-width="5" />
    <path d="M261 152h27c8 0 8 14 0 14h-21" :fill="paper" />
    <path d="M277 139v56" />
    <circle cx="233" cy="190" r="13" :fill="paper" />
    <path d="m232 182 4 8M105 151v37" opacity=".4" />
    <path d="M104 223v11m145-11v11" stroke-width="6" />
    <circle cx="190" cy="193" r="3" :fill="ink" stroke="none" />
  </g>

  <g v-else-if="item === 'umbrella'" data-art-id="umbrella">
    <path d="M180 139v77c0 27 38 27 38 2" stroke-width="5" />
    <path d="M180 139v68" :stroke="paper" stroke-width="1.5" />
    <path d="M180 45v13" stroke-width="4" />
    <path
      d="M64 145c8-48 53-88 116-88s108 40 116 88c-21-17-42-17-62 0-18-17-36-17-54 0-18-17-36-17-54 0-21-17-42-17-62 0Z"
      :fill="accent"
    />
    <path d="M126 145c0-44 19-70 54-88-6 31-8 58 0 88-18-17-36-17-54 0Z" :fill="paper" />
    <path d="M180 57c33 18 53 45 54 88" />
    <path d="M77 120c12-24 31-41 56-51" opacity=".35" stroke-width="2" />
  </g>

  <g v-else-if="item === 'cactus'" data-art-id="cactus">
    <path d="M162 188V79c0-33 38-33 38 0v109" :fill="paper" />
    <path
      d="M162 154h-24c-18 0-30-12-30-31v-17c0-19 23-19 23 0v15c0 7 3 10 10 10h21"
      :fill="paper"
    />
    <path d="M200 122h13c7 0 10-4 10-11V93c0-19 23-19 23 0v22c0 19-13 31-31 31h-15" :fill="paper" />
    <path d="M180 78v100m-63-70v17m117-25v16" opacity=".45" stroke-width="2" />
    <path d="m167 94-6-4m36 13 6-3m-35 22-7 2m37 35 6 3m-37 9-6 3" stroke-width="2" />
    <path d="m131 187 13 49h76l12-49" :fill="accent" />
    <rect x="124" y="175" width="115" height="23" rx="7" :fill="accent" />
    <path d="M154 214h55" :stroke="paper" stroke-width="6" />
    <g :fill="accent" stroke-width="1.5">
      <circle cx="176" cy="58" r="10" /><circle cx="191" cy="52" r="10" /><circle
        cx="192"
        cy="68"
        r="10"
      />
    </g>
    <circle cx="185" cy="61" r="5" :fill="paper" stroke-width="1.5" />
  </g>

  <g v-else-if="item === 'cassette'" data-art-id="cassette" transform="rotate(-5 180 151)">
    <rect x="70" y="81" width="220" height="146" rx="15" :fill="accent" />
    <rect x="84" y="94" width="192" height="100" rx="9" :fill="paper" />
    <path d="M101 112h129m-129 9h89" stroke-width="1.8" opacity=".55" />
    <rect x="108" y="133" width="144" height="45" rx="20" :fill="accent" />
    <circle cx="136" cy="155" r="16" :fill="paper" /><circle
      cx="225"
      cy="155"
      r="16"
      :fill="paper"
    />
    <path d="M136 146v18m-9-9h18m80-9v18m-9-9h18" stroke-width="2" />
    <path d="m120 209 9-22h103l9 22Z" :fill="paper" />
    <circle cx="138" cy="208" r="3" :fill="ink" stroke="none" /><circle
      cx="222"
      cy="208"
      r="3"
      :fill="ink"
      stroke="none"
    />
    <path d="M170 201h20" opacity=".4" />
    <circle cx="83" cy="214" r="2" :fill="ink" stroke="none" /><circle
      cx="277"
      cy="214"
      r="2"
      :fill="ink"
      stroke="none"
    />
  </g>

  <g v-else-if="item === 'camera'" data-art-id="camera">
    <path d="m119 105 15-28h58l13 28" :fill="accent" />
    <rect x="237" y="94" width="28" height="16" rx="5" :fill="accent" />
    <rect x="72" y="104" width="217" height="123" rx="18" :fill="paper" />
    <path d="M73 141h215v53H73" :fill="accent" />
    <circle cx="185" cy="166" r="48" :fill="paper" />
    <circle cx="185" cy="166" r="35" :fill="accent" />
    <circle cx="185" cy="166" r="22" :fill="paper" />
    <path d="M169 158c3-6 9-10 16-10" stroke-width="3" opacity=".5" />
    <rect x="86" y="116" width="30" height="14" rx="4" :fill="accent" />
    <circle cx="263" cy="124" r="5" :fill="ink" stroke="none" />
    <path d="M82 105v-8m198 8v-8" stroke-width="4" />
  </g>

  <g v-else-if="item === 'compass'" data-art-id="compass">
    <circle cx="180" cy="46" r="13" :fill="accent" />
    <circle cx="180" cy="147" r="88" :fill="accent" />
    <circle cx="180" cy="147" r="74" :fill="paper" />
    <path
      d="M180 90v9m0 95v9m-56-56h9m95 0h9m-97-40 6 6m67 68 6 6m0-80-6 6m-67 68-6 6"
      stroke-width="2"
      opacity=".65"
    />
    <g transform="rotate(27 180 147)">
      <path d="m180 102-15 45 15 46 15-46-15-45Z" :fill="paper" />
      <path d="m180 102-15 45h30l-15-45Z" :fill="accent" />
    </g>
    <circle cx="180" cy="147" r="5" :fill="paper" stroke-width="2" />
    <text
      x="180"
      y="83"
      text-anchor="middle"
      :fill="ink"
      stroke="none"
      font-family="sans-serif"
      font-size="10"
      >N</text
    >
    <path d="M105 136c3-20 11-37 26-50" opacity=".35" stroke-width="2" />
  </g>

  <g v-else-if="item === 'hourglass'" data-art-id="hourglass">
    <path
      d="M121 65c0 42 19 55 47 77-28 21-47 38-47 78h118c0-40-19-57-47-78 28-22 47-35 47-77H121Z"
      :fill="paper"
    />
    <path d="M139 88h83c-5 18-21 36-42 47-22-12-35-27-41-47Z" :fill="accent" stroke-width="2" />
    <path d="M135 218c8-26 30-35 45-48 16 13 37 22 46 48H135Z" :fill="accent" />
    <path d="M180 145v10m0 8v2" stroke-width="2" />
    <path d="M110 69v148m140-148v148" stroke-width="5" />
    <rect x="103" y="52" width="154" height="18" rx="7" :fill="accent" />
    <rect x="103" y="218" width="154" height="18" rx="7" :fill="accent" />
    <path d="M132 103c4 13 11 22 19 29m-19 67c4-13 11-22 19-29" opacity=".35" stroke-width="2" />
  </g>

  <g v-else-if="item === 'mug'" data-art-id="mug">
    <path d="M232 119c45-12 62 13 46 42-8 14-24 22-47 19" stroke-width="12" />
    <path d="M232 119c45-12 62 13 46 42-8 14-24 22-47 19" :stroke="accent" stroke-width="7" />
    <path d="M104 102h134v95c0 21-17 31-40 31h-54c-24 0-40-10-40-31v-95Z" :fill="paper" />
    <ellipse cx="171" cy="102" rx="67" ry="13" :fill="accent" />
    <path d="M122 105c24 6 72 6 98 0" opacity=".3" stroke-width="1.8" />
    <path
      d="M171 183c-8-7-26-16-26-28 0-14 19-16 26-5 8-11 26-9 26 5 0 12-17 22-26 28Z"
      :fill="accent"
      stroke-width="2"
    />
    <path
      d="M140 78c-11-10 9-16 0-27m35 24c-10-9 10-20 0-30m34 34c-10-9 8-15 0-23"
      opacity=".5"
      stroke-width="2"
    />
  </g>

  <g v-else-if="item === 'lamp'" data-art-id="lamp">
    <ellipse cx="186" cy="233" rx="65" ry="10" :fill="accent" />
    <path d="m184 223 37-70-66-54" stroke-width="10" />
    <path d="m184 223 37-70-66-54" :stroke="paper" stroke-width="5" />
    <circle cx="220" cy="154" r="9" :fill="accent" /><circle cx="156" cy="99" r="8" :fill="paper" />
    <path d="M124 77c20-18 45-10 51 11l7 31-75 25-10-30c-6-18 6-29 27-37Z" :fill="accent" />
    <ellipse cx="145" cy="133" rx="40" ry="10" transform="rotate(-18 145 133)" :fill="paper" />
    <path
      d="m111 158-10 18m36-12-4 20m31-25 6 17"
      :stroke="accent"
      stroke-width="2"
      opacity=".65"
    />
    <path d="M227 230h38c17 0 10-19 23-19h11" stroke-width="2" />
  </g>

  <g v-else-if="item === 'slippers'" data-art-id="slippers">
    <g transform="rotate(-12 139 157)">
      <path d="M105 91c0-33 67-33 67 0v119c0 34-67 34-67 0V91Z" :fill="paper" />
      <path d="M105 97c0-18 67-18 67 0v60c-20-11-48-11-67 0V97Z" :fill="accent" />
      <path d="M111 150c16-8 39-8 55 0" stroke-width="2" />
      <path d="M124 186v17c0 17 30 17 30 0v-17" opacity=".3" stroke-width="2" />
    </g>
    <g transform="rotate(12 222 153)">
      <path d="M189 83c0-33 67-33 67 0v119c0 34-67 34-67 0V83Z" :fill="paper" />
      <path d="M189 89c0-18 67-18 67 0v60c-20-11-48-11-67 0V89Z" :fill="accent" />
      <path d="M195 142c16-8 39-8 55 0" stroke-width="2" />
      <path d="M208 178v17c0 17 30 17 30 0v-17" opacity=".3" stroke-width="2" />
    </g>
  </g>

  <g v-else-if="item === 'crown'" data-art-id="crown">
    <path
      d="m94 109 41 39 38-67c3-6 10-6 13 0l40 67 39-39c5-5 10-2 9 5l-17 94H105l-20-93c-1-7 4-11 9-6Z"
      :fill="accent"
    />
    <rect x="102" y="205" width="157" height="26" rx="9" :fill="paper" />
    <path d="M119 219h122" :stroke="accent" stroke-width="5" />
    <circle cx="88" cy="104" r="10" :fill="paper" /><circle
      cx="180"
      cy="74"
      r="11"
      :fill="paper"
    /><circle cx="271" cy="103" r="10" :fill="paper" />
    <path d="m180 137 17 24-17 24-17-24 17-24Z" :fill="paper" stroke-width="2" />
    <circle cx="129" cy="176" r="7" :fill="paper" stroke-width="2" /><circle
      cx="230"
      cy="176"
      r="7"
      :fill="paper"
      stroke-width="2"
    />
  </g>

  <g v-else-if="item === 'magnet'" data-art-id="magnet" transform="rotate(-13 180 148)">
    <path d="M111 77h38v83c0 42 62 42 62 0V77h38v84c0 88-138 88-138 0V77Z" :fill="accent" />
    <rect x="111" y="59" width="38" height="39" rx="5" :fill="paper" />
    <rect x="211" y="59" width="38" height="39" rx="5" :fill="paper" />
    <path d="M126 124v40c0 54 108 54 108 0v-40" opacity=".4" stroke-width="2" />
    <path d="m98 61-12-7m178 7 12-7M129 39V26m101 13V26" :stroke="accent" stroke-width="3" />
    <text
      x="130"
      y="84"
      text-anchor="middle"
      :fill="ink"
      stroke="none"
      font-size="13"
      font-family="sans-serif"
      >N</text
    >
    <text
      x="230"
      y="84"
      text-anchor="middle"
      :fill="ink"
      stroke="none"
      font-size="13"
      font-family="sans-serif"
      >S</text
    >
  </g>

  <g v-else-if="item === 'ticket'" data-art-id="ticket" transform="rotate(-9 180 154)">
    <path
      d="M80 97h201c7 0 11 4 11 11v26c-24 0-24 36 0 36v28c0 7-4 11-11 11H80c-7 0-11-4-11-11v-28c24 0 24-36 0-36v-26c0-7 4-11 11-11Z"
      :fill="paper"
    />
    <path d="M239 99v109" stroke-dasharray="4 7" stroke-width="2" />
    <path d="M94 114h122m-122 79h122" :stroke="accent" stroke-width="5" />
    <path
      d="m150 129 7 13 15 2-11 11 2 15-13-7-14 7 3-15-11-11 15-2 7-13Z"
      :fill="accent"
      stroke-width="2"
    />
    <path d="M253 125v53m5-53v53m8-53v53m6-53v53" stroke-width="2" />
    <circle cx="203" cy="153" r="8" :fill="accent" stroke="none" />
  </g>

  <g v-else-if="item === 'rocket'" data-art-id="rocket">
    <path d="M148 158c-28 6-46 32-44 58l43-17m65-41c28 6 46 32 44 58l-43-17" :fill="accent" />
    <path d="M180 41c-38 28-51 64-44 117l12 44h64l12-44c7-53-6-89-44-117Z" :fill="paper" />
    <path d="M151 76c8-14 17-25 29-35 12 10 21 21 29 35-18 12-40 12-58 0Z" :fill="accent" />
    <circle cx="180" cy="120" r="23" :fill="accent" /><circle
      cx="180"
      cy="120"
      r="14"
      :fill="paper"
    />
    <path d="M160 171h40m-43 31-7 15h60l-7-15" :fill="accent" />
    <path d="M168 220c-3 10 2 20 12 27 10-7 15-17 12-27" :fill="accent" stroke-width="2" />
    <path d="M146 132v20" opacity=".35" stroke-width="2" />
  </g>

  <g v-else-if="item === 'phone'" data-art-id="phone">
    <path d="M114 123h130l39 74c8 19-1 35-22 35H99c-21 0-30-16-22-35l37-74Z" :fill="accent" />
    <path d="M107 122v-16m146 16v-16" stroke-width="8" />
    <path
      d="M86 82c37-29 154-29 189 0 7 6 9 14 4 22l-12 17c-4 6-12 8-19 4l-26-15c-8-5-9-13-4-20-23-7-50-7-74 0 5 7 4 15-4 20l-26 15c-7 4-15 2-19-4l-12-17c-5-8-3-16 3-22Z"
      :fill="paper"
    />
    <circle cx="180" cy="175" r="46" :fill="paper" />
    <circle
      v-for="(hole, index) in dialHoles"
      :key="index"
      :cx="hole.x"
      :cy="hole.y"
      r="6"
      :fill="accent"
      stroke-width="1.5"
    />
    <circle cx="180" cy="175" r="17" :fill="accent" stroke-width="2" />
    <path d="M270 119c35 1 12 20 26 22s-7 20 7 22-6 21 8 23" stroke-width="3" />
  </g>

  <g v-else-if="item === 'clock'" data-art-id="clock">
    <path d="m128 207-12 25m115-25 12 25" stroke-width="8" />
    <path d="m123 87-10-15m124 15 10-15M180 64V45" stroke-width="4" />
    <path d="M90 78c-9-32 33-52 53-28l-53 28Zm127-28c21-24 63-4 53 28l-53-28Z" :fill="accent" />
    <circle cx="180" cy="146" r="81" :fill="accent" /><circle
      cx="180"
      cy="146"
      r="67"
      :fill="paper"
    />
    <path d="M180 93v8m0 90v8m-53-53h8m90 0h8" stroke-width="3" />
    <path d="M180 113v33l28 18" stroke-width="4" />
    <path d="m180 146-21 21" :stroke="accent" stroke-width="2" />
    <circle cx="180" cy="146" r="5" :fill="accent" stroke-width="2" />
    <path d="m150 37 6-9m54 9-6-9" opacity=".45" stroke-width="2" />
  </g>

  <g v-else-if="item === 'pencil'" data-art-id="pencil" transform="rotate(34 180 145)">
    <path d="M163 73h34v122l-17 37-17-37V73Z" :fill="paper" />
    <path d="M163 76h12v118h-12V76Z" :fill="accent" />
    <path d="M185 76h12v118h-12V76Z" :fill="accent" />
    <path d="m163 194 8 5 9-5 9 5 8-5-17 38-17-38Z" :fill="paper" />
    <path d="m174 218 6 14 6-14" :fill="ink" />
    <path d="M163 59V45c0-10 34-10 34 0v14" :fill="accent" />
    <rect x="160" y="56" width="40" height="22" rx="4" :fill="accent" />
    <path d="M164 63h32m-32 7h32" stroke-width="1.5" opacity=".5" />
    <path d="M181 92v49" opacity=".3" stroke-width="2" />
  </g>

  <g v-else-if="item === 'notebook'" data-art-id="notebook" transform="rotate(-6 181 145)">
    <rect x="110" y="56" width="141" height="180" rx="11" :fill="paper" />
    <rect x="107" y="48" width="140" height="180" rx="11" :fill="accent" />
    <path d="M126 52v172" stroke-width="2" />
    <path
      v-for="ring in notebookRings"
      :key="ring"
      :d="`M116 ${ring}H99c-11 0-11-13 0-13h17`"
      :fill="paper"
      stroke-width="2"
    />
    <rect x="146" y="87" width="78" height="65" rx="7" :fill="paper" stroke-width="2" />
    <path d="M159 107h51m-51 12h38m-38 12h45" stroke-width="2" opacity=".5" />
    <path d="M220 51v175" :stroke="paper" stroke-width="6" opacity=".45" />
    <path d="M140 232h94" stroke-width="1.5" opacity=".4" />
  </g>

  <g v-else-if="item === 'key'" data-art-id="key" transform="rotate(39 180 145)">
    <path d="M167 118h26v99l-13 15-13-15v-99Z" :fill="accent" />
    <path d="M193 172h20v17h-13v16h-7" :fill="accent" />
    <circle cx="180" cy="84" r="42" :fill="accent" />
    <circle cx="180" cy="77" r="18" :fill="paper" />
    <path d="M180 136v65" stroke-width="2" />
    <path d="M149 84c0-12 7-22 17-28" opacity=".35" stroke-width="2" />
    <path d="M157 106c11 9 31 10 43 0" stroke-width="1.8" />
  </g>

  <g v-else-if="item === 'suitcase'" data-art-id="suitcase">
    <path d="M150 87V69c0-13 60-13 60 0v18" stroke-width="10" />
    <path d="M150 87V69c0-13 60-13 60 0v18" :stroke="paper" stroke-width="5" />
    <rect x="73" y="88" width="215" height="140" rx="20" :fill="accent" />
    <path d="M91 88v140m179-140v140" opacity=".4" stroke-width="2" />
    <path d="M125 88v140m111-140v140" :stroke="paper" stroke-width="17" />
    <rect x="116" y="142" width="19" height="28" rx="4" :fill="paper" stroke-width="2" />
    <rect x="227" y="142" width="19" height="28" rx="4" :fill="paper" stroke-width="2" />
    <path d="M91 228v9m179-9v9" stroke-width="7" />
    <g transform="rotate(10 183 150)">
      <rect x="159" y="128" width="47" height="35" rx="5" :fill="paper" stroke-width="1.7" />
      <path d="m169 153 10-13 8 8 6-5 7 10" stroke-width="1.5" />
    </g>
  </g>

  <g v-else-if="item === 'telescope'" data-art-id="telescope">
    <path d="M186 136v32m0 0-47 69m47-69 45 69m-45-69v70" stroke-width="5" />
    <circle cx="186" cy="163" r="10" :fill="accent" />
    <g transform="rotate(-24 182 113)">
      <rect x="96" y="93" width="159" height="40" rx="10" :fill="accent" />
      <rect x="89" y="86" width="31" height="54" rx="8" :fill="paper" />
      <rect x="249" y="100" width="34" height="25" rx="5" :fill="paper" />
      <path d="M282 104h12v17h-12" :fill="accent" />
      <path d="M128 102h106" :stroke="paper" stroke-width="5" opacity=".6" />
      <path d="M151 96v34" stroke-width="2" />
    </g>
    <path d="m151 219 36-13 32 13" opacity=".55" stroke-width="2" />
  </g>

  <g v-else-if="item === 'headphones'" data-art-id="headphones">
    <path d="M104 166v-40c0-94 152-94 152 0v40" stroke-width="19" />
    <path d="M104 166v-40c0-94 152-94 152 0v40" :stroke="accent" stroke-width="13" />
    <path d="M116 98c19-45 106-45 126 0" :stroke="paper" stroke-width="8" />
    <rect x="86" y="144" width="45" height="75" rx="20" :fill="paper" />
    <rect x="229" y="144" width="45" height="75" rx="20" :fill="paper" />
    <rect x="118" y="149" width="19" height="66" rx="9" :fill="accent" stroke-width="2" />
    <rect x="223" y="149" width="19" height="66" rx="9" :fill="accent" stroke-width="2" />
    <path d="M101 160v40m158-40v40" opacity=".4" stroke-width="2" />
    <path d="M249 221c0 23-37 2-39 18" stroke-width="2" />
  </g>

  <g v-else-if="item === 'mirror'" data-art-id="mirror" transform="rotate(13 181 145)">
    <path d="M169 174h24l4 53c0 19-33 19-33 0l5-53Z" :fill="accent" />
    <ellipse cx="181" cy="111" rx="57" ry="72" :fill="accent" />
    <ellipse cx="181" cy="109" rx="45" ry="58" :fill="paper" />
    <path d="m157 111 39-39m-38 62 47-47" :stroke="accent" stroke-width="6" opacity=".6" />
    <path d="m181 146 17-17" :stroke="accent" stroke-width="3" opacity=".4" />
    <path d="M181 194v28" stroke-width="2" opacity=".4" />
    <circle cx="181" cy="231" r="3" :fill="paper" stroke-width="1.5" />
  </g>

  <g v-else-if="item === 'bell'" data-art-id="bell">
    <circle cx="180" cy="209" r="21" :fill="paper" />
    <path d="M180 67V45" stroke-width="5" />
    <circle cx="180" cy="44" r="9" :fill="accent" />
    <path
      d="M126 127c0-77 108-77 108 0 0 39 4 49 23 62 10 7 5 18-8 18H110c-13 0-18-11-8-18 19-13 24-23 24-62Z"
      :fill="accent"
    />
    <path d="M110 187c40 8 99 8 139 0" :fill="paper" />
    <path d="M143 116c1-17 8-27 18-32" :stroke="paper" stroke-width="5" opacity=".65" />
    <path d="m102 80-12-10m169 10 12-10M82 113l-16-1m212 1 16-1" stroke-width="2" opacity=".45" />
  </g>

  <g v-else data-art-id="unknown">
    <rect x="116" y="79" width="128" height="151" rx="20" :fill="paper" />
    <path d="M159 130c0-28 47-29 47 0 0 17-26 18-26 38" :stroke="accent" stroke-width="6" />
    <circle cx="180" cy="190" r="4" :fill="accent" stroke="none" />
  </g>
</template>

<script lang="ts">
  import type { EditCrop } from '$lib/utils/edit-recipe';

  interface Props {
    /** a frame from the video, used as the backdrop to draw the crop box over */
    src: string;
    crop: EditCrop;
    onChange: (crop: EditCrop) => void;
  }

  let { src, crop, onChange }: Props = $props();

  // never let the box collapse to nothing
  const MIN_SIZE = 0.05;

  let container: HTMLElement | undefined = $state();
  type Corner = 'nw' | 'ne' | 'sw' | 'se';
  let drag: { mode: 'move' | Corner; startX: number; startY: number; origin: EditCrop } | null = null;

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const pointerFraction = (event: PointerEvent) => {
    const rect = container?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const start = (event: PointerEvent, mode: 'move' | Corner) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const { x, y } = pointerFraction(event);
    drag = { mode, startX: x, startY: y, origin: { ...crop } };
  };

  const move = (event: PointerEvent) => {
    if (!drag) {
      return;
    }
    event.preventDefault();

    const { x, y } = pointerFraction(event);
    const dx = x - drag.startX;
    const dy = y - drag.startY;
    const o = drag.origin;

    if (drag.mode === 'move') {
      onChange({
        ...o,
        x: clamp(o.x + dx, 0, 1 - o.width),
        y: clamp(o.y + dy, 0, 1 - o.height),
      });
      return;
    }

    // resizing: the opposite corner stays put, so each edge is clamped against it
    let { x: nx, y: ny, width: nw, height: nh } = o;

    if (drag.mode === 'nw' || drag.mode === 'sw') {
      const right = o.x + o.width;
      nx = clamp(o.x + dx, 0, right - MIN_SIZE);
      nw = right - nx;
    } else {
      nw = clamp(o.width + dx, MIN_SIZE, 1 - o.x);
    }

    if (drag.mode === 'nw' || drag.mode === 'ne') {
      const bottom = o.y + o.height;
      ny = clamp(o.y + dy, 0, bottom - MIN_SIZE);
      nh = bottom - ny;
    } else {
      nh = clamp(o.height + dy, MIN_SIZE, 1 - o.y);
    }

    onChange({ x: nx, y: ny, width: nw, height: nh });
  };

  const end = (event: PointerEvent) => {
    if (drag) {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      drag = null;
    }
  };

  const corners: { id: Corner; class: string }[] = [
    { id: 'nw', class: '-left-3 -top-3' },
    { id: 'ne', class: '-right-3 -top-3' },
    { id: 'sw', class: '-bottom-3 -left-3' },
    { id: 'se', class: '-bottom-3 -right-3' },
  ];
</script>

<div bind:this={container} class="relative mx-auto max-h-full w-fit select-none">
  <img {src} alt="" class="max-h-[55vh] w-auto" draggable="false" />

  <!-- dimmed outside the selection so the kept area reads clearly -->
  <div class="pointer-events-none absolute inset-0 bg-black/60"></div>

  <div
    class="absolute cursor-move border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0)]"
    style="left:{crop.x * 100}%; top:{crop.y * 100}%; width:{crop.width * 100}%; height:{crop.height *
      100}%; touch-action:none"
    onpointerdown={(event) => start(event, 'move')}
    onpointermove={move}
    onpointerup={end}
    onpointercancel={end}
    role="application"
    aria-label="Crop area"
  >
    <img
      {src}
      alt=""
      class="pointer-events-none absolute max-w-none"
      draggable="false"
      style="left:{-crop.x * 100}%; top:{-crop.y * 100}%; width:{100 / crop.width}%; height:{100 / crop.height}%"
    />

    {#each corners as corner (corner.id)}
      <button
        type="button"
        aria-label={corner.id}
        class="absolute size-6 rounded-full border-2 border-white bg-immich-primary {corner.class}"
        style="touch-action:none"
        onpointerdown={(event) => start(event, corner.id)}
        onpointermove={move}
        onpointerup={end}
        onpointercancel={end}
      ></button>
    {/each}
  </div>
</div>

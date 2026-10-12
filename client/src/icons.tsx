/** Íconos de trazo propio (24×24, currentColor). Decorativos: el botón lleva el texto accesible. */
const paths = {
  keyboard: 'M3 7h18v10H3zM7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 13h.01M17 13h.01M9 14h6',
  trackpad: 'M5 4h14v12H5zM5 16v3h7v-3M12 16v3h7v-3',
  touch: 'M9 11V5a2 2 0 1 1 4 0v6m0-2a2 2 0 1 1 4 0v4a7 7 0 0 1-7 7h-.5a6 6 0 0 1-5.2-3L3 14.5a1.8 1.8 0 0 1 3-2l3 3.5',
  keys: 'M4 6h5v5H4zM10.5 6h5v5h-5zM17 6h3v5h-3zM4 13h16v5H4z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  exit: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  close: 'M6 6l12 12M18 6L6 18',
  sound: 'M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 10v4h4l5 4V6L8 10zM17 9l5 6M22 9l-5 6',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  stats: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  clipboard: 'M9 4h6v3H9zM7 5H5v16h14V5h-2',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14l3 3 3-3',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
  grip: 'M8 12h8',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className = 'size-6' }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}

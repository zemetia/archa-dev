declare module '*.css';
declare module '*.svg' { const url: string; export default url; }
declare module '*.png' { const url: string; export default url; }

/** Vite: a bundled file's URL. */
declare module '*?url' {
  const url: string;
  export default url;
}

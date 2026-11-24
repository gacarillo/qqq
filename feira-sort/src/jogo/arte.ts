/**
 * Arte das frutas, desenhada em SVG (viewBox 100×100), sem asset de terceiros.
 *
 * Cada fruta tem uma silhueta diferente, não só uma cor diferente, para quem tem daltonismo conseguir jogar
 * (diretriz da seção Arte do plano). O traço escuro e o brilho branco são iguais em todas.
 */

const T = '#3a2416'; // traço
const c = (w = 4) => `stroke="${T}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const C = c();
const brilho = (w = 5, o = 0.75) => `fill="none" stroke="#fff" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round"`;
const BRILHO = brilho();

const svg = (corpo: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">${corpo}</svg>`;

const sombra = (d: string) => `<path d="${d}" fill="#000" fill-opacity=".14"/>`;

export const ARTE_FRUTA: Record<string, string> = {
  // A — maçã
  A: svg(`
    <path d="M50 31C40 22 15 23 15 50c0 24 18 40 28 40 4 0 5-2 7-2s3 2 7 2c10 0 28-16 28-40 0-27-25-28-35-19z" fill="#e2453c" ${C}/>
    ${sombra('M68 33c10 4 15 11 15 19 0 20-14 34-24 35 12-9 18-26 9-54z')}
    <path d="M29 47c0-8 5-13 12-14" ${BRILHO}/>
    <path d="M50 31c0-8 2-14 6-19" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/>
    <path d="M55 21c7-10 19-10 24-6-6 8-16 10-24 6z" fill="#6dbe45" ${c(3.5)}/>`),

  // B — banana
  B: svg(`
    <path d="M26 16C12 50 34 88 86 84c5-1 6-7 1-9C56 72 42 50 40 18c0-5-12-7-14-2z" fill="#f7d23e" ${C}/>
    ${sombra('M40 26c2 24 14 42 42 50-26 4-44-14-46-40z')}
    <path d="M30 26C24 52 40 74 74 78" fill="none" stroke="#d6a419" stroke-width="4" stroke-linecap="round"/>
    <path d="M24 24c-2 10-2 18 0 26" ${brilho(4.5)}/>
    <path d="M27 17l-3-9 12-1 3 10" fill="#6b4a2b" ${c(3)}/>
    <circle cx="88" cy="80" r="3.5" fill="#6b4a2b" stroke="${T}" stroke-width="2.5"/>`),

  // C — uva
  C: svg(`
    <path d="M50 22c0-6 2-10 6-13" fill="none" stroke="${T}" stroke-width="5" stroke-linecap="round"/>
    <path d="M54 17c6-8 18-8 22-4-5 7-15 9-22 4z" fill="#6dbe45" ${c(3.5)}/>
    ${[
      [32, 34], [50, 32], [68, 34],
      [40, 50], [60, 50],
      [30, 56], [70, 56],
      [50, 66], [38, 76], [62, 76], [50, 86],
    ]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="#7b4bb7" ${c(3.5)}/><path d="M${x - 5} ${y - 2}a6 6 0 0 1 5-5" ${brilho(3)}/>`)
      .join('')}`),

  // D — laranja
  D: svg(`
    <circle cx="50" cy="54" r="35" fill="#f59a23" ${C}/>
    ${sombra('M66 26c14 8 21 21 19 34-2 16-16 28-31 29 22-12 26-40 12-63z')}
    ${[[36, 44], [46, 38], [60, 44], [40, 60], [54, 56], [66, 62], [48, 72], [60, 76], [30, 56]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#c86f0e"/>`)
      .join('')}
    <path d="M30 46c2-8 8-14 16-16" ${BRILHO}/>
    <path d="M50 20c1-4 3-7 6-9" fill="none" stroke="${T}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M52 17c4-8 15-10 20-6-4 7-13 10-20 6z" fill="#3f9a4a" ${c(3.5)}/>`),

  // E — limão
  E: svg(`
    <path d="M14 56c4-22 26-38 48-36 10-6 20-6 24-2 4 6 2 14-4 20 2 24-18 44-42 44-10 6-20 4-24-2-4-6-6-16-2-24z" fill="#7cc242" ${C}/>
    ${sombra('M78 40c2 22-16 40-38 42 18-8 32-24 38-42z')}
    <path d="M30 50c4-10 14-18 24-20" ${BRILHO}/>
    <circle cx="44" cy="60" r="1.6" fill="#4f8f22"/><circle cx="58" cy="52" r="1.6" fill="#4f8f22"/><circle cx="52" cy="68" r="1.6" fill="#4f8f22"/>`),

  // F — melancia (fatia)
  F: svg(`
    <path d="M10 30h80c0 30-18 54-40 54S10 60 10 30z" fill="#3f9a4a" ${C}/>
    <path d="M18 30h64c0 24-14 44-32 44S18 54 18 30z" fill="#eef5d6"/>
    <path d="M22 30h56c0 20-12 38-28 38S22 50 22 30z" fill="#f05a5a"/>
    <path d="M10 30h80" fill="none" stroke="${T}" stroke-width="4" stroke-linecap="round"/>
    ${[[36, 40], [50, 44], [64, 40], [43, 54], [57, 54], [50, 62]]
      .map(([x, y]) => `<path d="M${x} ${y - 4}c3 3 3 6 0 8-3-2-3-5 0-8z" fill="${T}"/>`)
      .join('')}
    <path d="M28 36c2 8 6 14 12 18" ${brilho(5, .55)}/>`),

  // G — morango
  G: svg(`
    <path d="M50 90C30 78 14 58 16 40c1-10 10-16 20-14 6 1 10 4 14 4s8-3 14-4c10-2 19 4 20 14 2 18-14 38-34 50z" fill="#e8364f" ${C}/>
    ${sombra('M70 30c10 2 14 8 14 14 0 16-14 32-30 42 14-14 22-34 16-56z')}
    ${[[32, 42], [44, 46], [58, 46], [70, 42], [38, 58], [52, 60], [64, 58], [46, 72], [58, 72], [52, 82]]
      .map(([x, y]) => `<path d="M${x} ${y}l1.6-3.6" stroke="#ffe27a" stroke-width="3" stroke-linecap="round"/>`)
      .join('')}
    <path d="M28 30c6-2 10 0 14 4 2-6 6-9 8-12 2 3 6 6 8 12 4-4 8-6 14-4-2 6-8 10-14 10-4 4-12 4-16 0-6 0-12-4-14-10z" fill="#4fa83d" ${c(3.5)}/>`),

  // H — carambola (estrela)
  H: svg(`
    <path d="M50 8c4 0 6 3 8 8l7 17 18 2c6 1 8 3 9 6 1 4-1 6-5 9L73 62l4 18c1 6 0 8-3 10-3 2-6 1-10-2L50 78 36 88c-4 3-7 4-10 2-3-2-4-4-3-10l4-18-14-12c-4-3-6-5-5-9 1-3 3-5 9-6l18-2 7-17c2-5 4-8 8-8z" fill="#f2c230" ${C}/>
    <path d="M50 20v30M50 50l28-6M50 50l18 26M50 50 32 76M50 50l-28-6" fill="none" stroke="#d29a12" stroke-width="3" stroke-linecap="round"/>
    <path d="M44 24l-4 10" ${BRILHO}/>`),

  // I — coco
  I: svg(`
    <circle cx="50" cy="52" r="36" fill="#8b5a2b" ${C}/>
    ${sombra('M66 22c14 8 22 22 20 36-2 16-14 28-30 30 20-14 24-42 10-66z')}
    ${[[28, 40, 36, 34], [24, 58, 30, 52], [70, 70, 64, 76], [44, 80, 38, 84], [60, 30, 66, 34], [74, 52, 78, 46]]
      .map(([a, b, c, d]) => `<path d="M${a} ${b}L${c} ${d}" stroke="#5e3a19" stroke-width="3" stroke-linecap="round"/>`)
      .join('')}
    <circle cx="42" cy="44" r="5" fill="${T}"/><circle cx="58" cy="44" r="5" fill="${T}"/><circle cx="50" cy="58" r="5" fill="${T}"/>
    <path d="M28 50c0-10 6-18 14-22" ${brilho(5, .45)}/>`),

  // J — abacaxi
  J: svg(`
    <path d="M50 34c-8-10-10-20-6-28 4 6 6 10 6 14 2-6 6-12 12-14-2 8-4 14-8 18 6-4 12-4 18-2-6 4-12 8-20 10" fill="#4fa83d" ${c(3.5)}/>
    <path d="M38 32c-6-6-14-8-20-6 6 4 10 8 14 12" fill="#4fa83d" ${c(3.5)}/>
    <ellipse cx="50" cy="62" rx="26" ry="30" fill="#f2b630" ${C}/>
    <path d="M32 44l34 38M28 58l24 28M40 36l32 36M68 44 34 82M72 58 48 86M60 36 28 72" fill="none" stroke="#c9861a" stroke-width="3" stroke-linecap="round"/>
    <path d="M34 52c2-6 6-10 10-12" ${BRILHO}/>`),

  // K — pera
  K: svg(`
    <path d="M50 22c-8 0-12 6-12 14 0 8-4 12-10 20-6 8-6 20 0 28 6 6 14 8 22 8s16-2 22-8c6-8 6-20 0-28-6-8-10-12-10-20 0-8-4-14-12-14z" fill="#b5d334" ${C}/>
    ${sombra('M62 38c2 8 6 12 10 18 6 8 6 18 0 26-6 6-14 8-22 8 18-8 24-30 12-52z')}
    <path d="M36 62c0-6 2-10 6-14" ${BRILHO}/>
    <path d="M50 22c0-6 2-10 5-14" fill="none" stroke="${T}" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M54 15c6-6 15-6 19-3-4 6-12 8-19 3z" fill="#4fa83d" ${c(3.5)}/>`),

  // L — acerola
  L: svg(`
    <path d="M52 12c-6 10-14 24-20 40M52 12c4 12 10 26 20 38M52 12c0 14 0 26-2 34" fill="none" stroke="#5a7d2a" stroke-width="4" stroke-linecap="round"/>
    <path d="M52 12c8-6 18-6 22-2-6 6-14 7-22 2z" fill="#4fa83d" ${c(3.5)}/>
    <circle cx="30" cy="64" r="17" fill="#c81e3a" ${C}/>
    <circle cx="72" cy="62" r="17" fill="#c81e3a" ${C}/>
    <circle cx="50" cy="74" r="17" fill="#d92a45" ${C}/>
    <path d="M22 60a9 9 0 0 1 7-7M64 58a9 9 0 0 1 7-7M42 70a9 9 0 0 1 7-7" ${brilho(4)}/>`),
};

/** Frutas que só aparecem no álbum (raridades). */
export const ARTE_ESPECIAL: Record<string, string> = {
  caju: svg(`
    <path d="M30 18c-8 4-12 14-10 24 2 12 10 22 22 26 10 4 22 2 30-6 8-8 10-20 6-30-4-10-14-16-26-16-8 0-16 0-22 2z" fill="#f1572f" ${C}/>
    <path d="M58 20c10 2 18 8 20 18 2 10-2 20-10 26 6-14 2-30-10-44z" fill="#ffb02e" fill-opacity=".85"/>
    <path d="M30 30c2-6 6-8 12-9" ${BRILHO}/>
    <path d="M44 68c-6 2-12 8-12 16 0 6 6 10 12 8 4-2 4-6 8-6s6 4 10 2c6-2 6-10 2-14-6-6-12-8-20-6z" fill="#a3a46b" ${C}/>`),
  jabuticaba: svg(`
    <path d="M4 40c30-6 62-6 92 0v22c-30-6-62-6-92 0z" fill="#8a5a33" ${C}/>
    <path d="M10 46c20-3 40-3 60-1M30 56c20-2 40-2 60 1" stroke="#6a4224" stroke-width="3" stroke-linecap="round"/>
    ${[[18, 34], [40, 30], [64, 32], [84, 36], [28, 70], [52, 68], [76, 70], [12, 66]]
      .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="11" fill="#2b1838" ${c(3.5)}/><path d="M${x - 5} ${y - 3}a6 6 0 0 1 5-5" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>`)
      .join('')}`),
  acai: svg(`
    <path d="M14 52h72c0 20-16 36-36 36S14 72 14 52z" fill="#e9eef7" ${C}/>
    <path d="M20 66h60" stroke="#7aa3d8" stroke-width="4" stroke-linecap="round"/>
    <path d="M16 52c0-18 16-30 34-30s34 12 34 30z" fill="#5b2a6e" ${C}/>
    <circle cx="38" cy="38" r="8" fill="#f7e9a0" ${c(3)}/><circle cx="38" cy="38" r="2" fill="#c9a94b"/>
    <circle cx="60" cy="34" r="8" fill="#f7e9a0" ${c(3)}/><circle cx="60" cy="34" r="2" fill="#c9a94b"/>
    ${[[48, 46], [70, 46], [28, 48], [54, 28], [44, 30]]
      .map(([x, y]) => `<rect x="${x - 3}" y="${y - 2}" width="6" height="4" rx="1.5" fill="#c58b3e" transform="rotate(${(x * 7) % 50} ${x} ${y})"/>`)
      .join('')}
    <path d="M24 46c2-8 8-14 16-16" ${brilho(5, .5)}/>`),
  maracuja: svg(`
    <circle cx="58" cy="44" r="30" fill="#f2cf3a" ${C}/>
    ${[[50, 30], [64, 26], [72, 40], [60, 54], [46, 46]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="#c79a16"/>`).join('')}
    <path d="M58 14c2-4 5-6 8-6" fill="none" stroke="${T}" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="38" cy="66" rx="28" ry="24" fill="#f2cf3a" ${C}/>
    <ellipse cx="38" cy="66" rx="22" ry="18" fill="#fff6d8"/>
    <ellipse cx="38" cy="66" rx="18" ry="14" fill="#f6a623"/>
    ${[[30, 60], [38, 58], [46, 62], [28, 70], [36, 68], [44, 72], [38, 76]]
      .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.4" ry="3" fill="${T}"/>`)
      .join('')}`),
};

/** Saquinho de papel que esconde o item até ele chegar ao topo. */
export const ARTE_SAQUINHO = svg(`
  <path d="M22 30h56l6 56c0 3-2 5-5 5H21c-3 0-5-2-5-5z" fill="#c9a06a" ${C}/>
  <path d="M22 30l4-10h48l4 10" fill="#b58a53" ${C}/>
  <path d="M30 22l-2 8M44 21l-1 9M58 21l1 9M70 22l2 8" stroke="${T}" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M40 52c0-8 5-12 11-12 7 0 11 4 11 10 0 8-10 9-10 17" fill="none" stroke="${T}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="52" cy="78" r="4" fill="${T}"/>`);

export const ARTE_CADEADO = svg(`
  <path d="M32 46V34c0-10 8-18 18-18s18 8 18 18v12" fill="none" stroke="#5b5b66" stroke-width="9" stroke-linecap="round"/>
  <path d="M32 46V34c0-10 8-18 18-18s18 8 18 18v12" fill="none" stroke="${T}" stroke-width="3"/>
  <rect x="20" y="44" width="60" height="46" rx="10" fill="#f2b630" ${C}/>
  <circle cx="50" cy="64" r="6" fill="${T}"/><path d="M50 66v12" stroke="${T}" stroke-width="5" stroke-linecap="round"/>`);

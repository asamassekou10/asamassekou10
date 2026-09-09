import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = fileURLToPath(new URL('./assets/graduation-cap-tip-poses.png', import.meta.url));
const output = fileURLToPath(new URL('./assets/ascii-portrait.svg', import.meta.url));
const metadata = await sharp(source).metadata();
// Calibrated against the subject bounds inside each cell (not the white cell
// itself): monospace glyphs need many more columns than rows to stay square.
const cols = 108;
const rows = 60;
const ramp = ' .:;+*#@';

async function frameRows(index) {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const left = Math.floor(column * metadata.width / 3);
  const top = row === 0 ? 0 : 426;
  const width = Math.floor((column + 1) * metadata.width / 3) - left;
  const height = row === 0 ? 417 : metadata.height - top;
  const { data } = await sharp(source)
    .extract({ left, top, width, height })
    .greyscale()
    .resize(cols, rows, { fit: 'fill', kernel: 'lanczos3' })
    .sharpen({ sigma: .75 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const lines = [];
  for (let y = 0; y < rows; y++) {
    let line = '';
    for (let x = 0; x < cols; x++) {
      const lum = data[y * cols + x] / 255;
      if (lum > .91) { line += ' '; continue; }
      const leftLum = data[y * cols + Math.max(0, x - 1)] / 255;
      const rightLum = data[y * cols + Math.min(cols - 1, x + 1)] / 255;
      const upLum = data[Math.max(0, y - 1) * cols + x] / 255;
      const downLum = data[Math.min(rows - 1, y + 1) * cols + x] / 255;
      const edge = Math.min(1, Math.max(Math.abs(rightLum - leftLum), Math.abs(downLum - upLum)) * 1.5);
      const ink = Math.min(1, Math.pow(1 - lum, .92) * .46 + edge * .75);
      line += ramp[Math.min(ramp.length - 1, Math.round(ink * (ramp.length - 1)))];
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  return lines;
}

const frames = await Promise.all(Array.from({ length: 6 }, (_, index) => frameRows(index)));
const esc = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
// Every visible glyph has an absolute location: layout never depends on spaces.
// 540 x 405 pixels matches each source cell's 4:3 aspect ratio.
const textFor = (lines) => lines.flatMap((line, row) => [...line].flatMap((char, col) => char === ' ' ? [] : [`<tspan x="${40 + col * 5}" y="${100 + row * 6.75}">${esc(char)}</tspan>`])).join('');
const timing = [
  ['1;1;0;0;1;1', '0;.08;.12;.88;.94;1'],
  ['0;0;1;1;0;0', '0;.07;.1;.17;.2;1'],
  ['0;0;1;1;0;0', '0;.17;.2;.28;.31;1'],
  ['0;0;1;1;0;0', '0;.28;.31;.52;.56;1'],
  ['0;0;1;1;0;0', '0;.52;.56;.68;.72;1'],
  ['0;0;1;1;0;0', '0;.68;.72;.94;.98;1'],
];
// Match glyphs spatially, then move them continuously between complete poses.
// Reserve unchanged cells first so stationary facial details do not wander.
const cells = lines => lines.flatMap((line,y)=>[...line].flatMap((c,x)=>c===' '?[]:[{x,y,c}]));
const sequence = [0,1,2,3,2,1,0];
// Five full seconds for every pose-to-pose morph, followed by a 10s idle rest.
const times = [0,5,10,15,20,25,30];
const loop = 40;
const morphs = [];
for(let step=0;step<sequence.length-1;step++) {
  const from=cells(frames[sequence[step]]), to=cells(frames[sequence[step+1]]);
  const free=new Set(to.map((_,i)=>i));
  const exact=new Map(to.map((p,i)=>[`${p.x},${p.y}`,i]));
  const pairs=from.map(p=>{const i=exact.get(`${p.x},${p.y}`);if(i!==undefined){free.delete(i);return [p,to[i]];}return [p,null];});
  for(const pair of pairs) if(!pair[1]) {
    let best=-1, distance=Infinity;
    for(const i of free){const q=to[i],d=(q.x-pair[0].x)**2+(q.y-pair[0].y)**2;if(d<distance){distance=d;best=i;}}
    if(best>=0){pair[1]=to[best];free.delete(best);}
  }
  for(const i of free)pairs.push([null,to[i]]);
  const start=times[step], end=times[step+1];
  const keys=`0;${(start+.001)/loop};${end/loop};1`;
  const body=pairs.map(([a,b])=>{
    const p=a||b,q=b||a;
    if(a && b && p.x===q.x && p.y===q.y) return `<text x="${40+p.x*5}" y="${100+p.y*6.75}">${esc(p.c)}</text>`;
    const coords=(axis,scale,offset)=>`${offset+p[axis]*scale};${offset+p[axis]*scale};${offset+q[axis]*scale};${offset+q[axis]*scale}`;
    return `<text x="${40+p.x*5}" y="${100+p.y*6.75}">${esc(p.c)}<animate attributeName="x" values="${coords('x',5,40)}" keyTimes="${keys}" begin="7s" dur="${loop}s" repeatCount="indefinite" calcMode="spline" keySplines="0 0 1 1;.4 0 .2 1;0 0 1 1"/><animate attributeName="y" values="${coords('y',6.75,100)}" keyTimes="${keys}" begin="7s" dur="${loop}s" repeatCount="indefinite" calcMode="spline" keySplines="0 0 1 1;.4 0 .2 1;0 0 1 1"/>${!a||!b?`<animate attributeName="opacity" values="${a?'1;1;0;0':'0;0;1;1'}" keyTimes="${keys}" begin="7s" dur="${loop}s" repeatCount="indefinite"/>`:''}</text>`;
  }).join('');
  morphs.push(`<g class="moving-pose" visibility="hidden"><animate attributeName="visibility" values="hidden;visible;hidden;hidden" keyTimes="0;${(start+.001)/loop};${end/loop};1" calcMode="discrete" begin="7s" dur="${loop}s" repeatCount="indefinite"/>${body}</g>`);
}
const frameMarkup=`<text class="pose-0">${textFor(frames[0])}<animate attributeName="visibility" values="hidden;visible;visible" keyTimes="0;${30/loop};1" calcMode="discrete" begin="7s" dur="${loop}s" repeatCount="indefinite"/></text>${morphs.join('')}`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="620" viewBox="0 0 620 620" role="img" aria-labelledby="title desc">
  <title id="title">Animated ASCII portrait of Alhassane Samassekou tipping his graduation cap</title>
  <desc id="desc">A complete frame-by-frame ASCII character animation of a graduate lifting and replacing his cap.</desc>
  <style>
    .frames { animation:breathe 4.8s ease-in-out 5.5s infinite; transform-origin:310px 310px }
    @keyframes breathe { 0%,100%{opacity:.94} 50%{opacity:1} }
    @media (prefers-reduced-motion:reduce) {
      .motion,.intro,.ambient,.moving-pose{display:none}.portrait{opacity:1!important;mask:none!important}.frames{animation:none;opacity:1}.pose-0{opacity:1!important;visibility:visible!important}
    }
  </style>
  <defs>
    <linearGradient id="ink" x1="0" y1="0" x2="1" y2="1"><animate class="motion" attributeName="x1" values="0;.35;0" begin="5.5s" dur="7s" repeatCount="indefinite"/><animate class="motion" attributeName="y2" values="1;.35;1" begin="5.5s" dur="7s" repeatCount="indefinite"/><stop stop-color="#31d7ff"/><stop offset=".55" stop-color="#8b5cf6"/><stop offset="1" stop-color="#34d399"/></linearGradient>
    <linearGradient id="scan" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#31d7ff" stop-opacity="0"/><stop offset=".5" stop-color="#31d7ff" stop-opacity=".28"/><stop offset="1" stop-color="#31d7ff" stop-opacity="0"/></linearGradient>
    <filter id="glow"><feGaussianBlur stdDeviation=".8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="sparkGlow"><feGaussianBlur stdDeviation="1.4" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <path id="diamond" d="M0-5 3 0 0 5-3 0Z"/><path id="star" d="M0-6 1.7-1.8 6 0 1.7 1.8 0 6-1.7 1.8-6 0-1.7-1.8Z"/>
    <mask id="reveal"><rect x="25" y="550" width="570" height="0" fill="white"><animate class="motion" attributeName="y" values="550;35" dur="2.4s" fill="freeze"/><animate class="motion" attributeName="height" values="0;515" dur="2.4s" fill="freeze"/></rect></mask>
  </defs>
  <g class="intro" aria-hidden="true" filter="url(#sparkGlow)">
    <use href="#star" fill="#f6c453" opacity="0"><animate attributeName="opacity" values="0;1;0" begin="2.25s" dur="1.4s" fill="freeze"/><animateMotion path="M310 150 Q260 30 160 105" begin="2.25s" dur="1.4s" fill="freeze"/></use>
    <use href="#diamond" fill="#31d7ff" opacity="0"><animate attributeName="opacity" values="0;1;0" begin="2.35s" dur="1.5s" fill="freeze"/><animateMotion path="M310 150 Q365 25 455 115" begin="2.35s" dur="1.5s" fill="freeze"/></use>
    <use href="#diamond" fill="#34d399" opacity="0"><animate attributeName="opacity" values="0;1;0" begin="2.45s" dur="1.6s" fill="freeze"/><animateMotion path="M310 150 Q405 90 480 225" begin="2.45s" dur="1.6s" fill="freeze"/></use>
  </g>
  <g class="portrait" mask="url(#reveal)" opacity="0"><animate class="motion" attributeName="opacity" values="0;1" dur=".8s" fill="freeze"/>
    <g class="frames" fill="url(#ink)" font-family="Menlo,monospace" font-size="7.3" font-weight="700" xml:space="preserve">
      ${frameMarkup}
    </g>
    <rect class="intro" x="25" y="-70" width="570" height="66" fill="url(#scan)"><animate attributeName="y" from="-70" to="550" begin="1.35s" dur="1.8s" fill="freeze"/><animate attributeName="opacity" values="0;1;1;0" begin="1.35s" dur="1.8s" fill="freeze"/></rect>
  </g>
  <g class="ambient" aria-hidden="true" filter="url(#sparkGlow)">
    <rect x="55" y="35" width="500" height="16" fill="url(#scan)" opacity="0"><animate attributeName="y" values="35;535;535" keyTimes="0;.18;1" begin="5.8s" dur="8s" repeatCount="indefinite"/><animate attributeName="opacity" values="0;.22;0;0" keyTimes="0;.06;.2;1" begin="5.8s" dur="8s" repeatCount="indefinite"/></rect>
    <use href="#diamond" fill="#31d7ff"><animate attributeName="x" values="55;75;55" begin="5.5s" dur="6.5s" repeatCount="indefinite"/><animate attributeName="y" values="250;205;250" begin="5.5s" dur="6.5s" repeatCount="indefinite"/><animate attributeName="opacity" values=".1;.65;.1" begin="5.5s" dur="6.5s" repeatCount="indefinite"/></use>
    <use href="#diamond" fill="#34d399"><animate attributeName="x" values="505;525;505" begin="6.3s" dur="7.4s" repeatCount="indefinite"/><animate attributeName="y" values="350;300;350" begin="6.3s" dur="7.4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".1;.55;.1" begin="6.3s" dur="7.4s" repeatCount="indefinite"/></use>
  </g>
</svg>\n`;
await fs.writeFile(output, svg);

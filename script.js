const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const lerp = (start, end, amount) => start + (end - start) * amount;
const smoothstep = (start, end, value) => {
  const x = clamp((value - start) / (end - start));
  return x * x * (3 - 2 * x);
};

const story = document.querySelector('.scale-story');
const stage = document.querySelector('#microscope-stage');
const chapters = [...document.querySelectorAll('.scale-chapter')];
const railDots = [...document.querySelectorAll('.depth-rail > i')];
const layers = Object.fromEntries(
  [...document.querySelectorAll('[data-layer]')].map((layer) => [layer.dataset.layer, layer])
);
const modalityLabel = document.querySelector('#modality-label');
const modalityOptions = [...document.querySelectorAll('#modality-switch [data-mode]')];
const scaleValue = document.querySelector('#scale-value');
const scaleName = document.querySelector('#scale-name');
const scaleContext = document.querySelector('#scale-context');
const railProgress = document.querySelector('#rail-progress');
const pageProgress = document.querySelector('#page-progress');
const header = document.querySelector('.site-header');
const cellTrail = document.querySelector('#cell-trail');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const states = [
  { modality: 'DNA · RNA ENCODERS', value: 'DNA + RNA', name: 'MOLECULAR SIGNAL', context: 'INPUT SPACE' },
  { modality: 'IF · SINGLE-CELL IMAGE', value: '10 μm', name: 'ONE CELL', context: 'PHENOTYPE' },
  { modality: 'LIQUID BIOPSY · SEARCH', value: '1 in millions', name: 'RARE EVENT', context: 'SEARCH SPACE' },
  { modality: 'H&E · WHOLE TISSUE', value: '10 mm', name: 'TISSUE CONTEXT', context: 'FIELD OF VIEW' },
  { modality: 'MULTIMODAL FOUNDATION MODEL', value: '1 patient', name: 'UNIFIED REPRESENTATION', context: 'MODEL CONTEXT' }
];

const STEP_BREAKS = [0.18, 0.37, 0.58, 0.79];
const AUTO_SWITCH_MS = 1550;
const STORY_HOLD = 0.022;
let targetProgress = 0;
let visualProgress = 0;
let activeStep = -1;
let storyVisible = false;
let manualMode = null;
let imcBlend = 0;
let previousFrameTime = 0;
let tissueEnteredAt = 0;

function buildMolecules() {
  const helix = document.querySelector('#dna-helix');
  const rna = document.querySelector('#rna-strand');

  for (let index = 0; index < 18; index += 1) {
    const rung = document.createElement('i');
    rung.className = 'dna-rung';
    rung.style.setProperty('--y', `${4 + index * 5.2}%`);
    rung.style.setProperty('--delay', `${index * -0.19}s`);
    helix.appendChild(rung);
  }

  for (let index = 0; index < 15; index += 1) {
    const bead = document.createElement('i');
    bead.className = 'rna-bead';
    bead.style.setProperty('--x', `${48 + Math.sin(index * 0.92) * 34}%`);
    bead.style.setProperty('--y', `${4 + index * 6.5}%`);
    bead.style.setProperty('--delay', `${index * -0.13}s`);
    rna.appendChild(bead);
  }
}

function stepFromProgress(progress) {
  if (progress < STEP_BREAKS[0]) return 0;
  if (progress < STEP_BREAKS[1]) return 1;
  if (progress < STEP_BREAKS[2]) return 2;
  if (progress < STEP_BREAKS[3]) return 3;
  return 4;
}

function mapScrollProgress(progress) {
  if (progress <= STORY_HOLD) return 0;
  const released = (progress - STORY_HOLD) / (1 - STORY_HOLD);
  return Math.pow(clamp(released), 1.035);
}

function measureProgress() {
  const rect = story.getBoundingClientRect();
  const distance = Math.max(1, rect.height - window.innerHeight);
  const rawProgress = clamp(-rect.top / distance);
  targetProgress = mapScrollProgress(rawProgress);
  storyVisible = rect.bottom > 0 && rect.top < window.innerHeight;

  const pageMax = document.documentElement.scrollHeight - window.innerHeight;
  pageProgress.style.transform = `scaleX(${pageMax > 0 ? window.scrollY / pageMax : 0})`;
  const stageRect = stage.getBoundingClientRect();
  header.classList.toggle('on-dark', stageRect.top <= 76 && stageRect.bottom >= 76);
}

function applyStep(step, time) {
  if (step === activeStep) return;
  activeStep = step;
  chapters.forEach((chapter, index) => chapter.classList.toggle('active', index === activeStep));
  railDots.forEach((dot, index) => dot.classList.toggle('active', index <= activeStep));
  stage.classList.remove('step-0', 'step-1', 'step-2', 'step-3', 'step-4');
  stage.classList.add(`step-${activeStep}`);

  if (activeStep === 3) {
    tissueEnteredAt = time || performance.now();
    manualMode = null;
  }

  const state = states[activeStep];
  modalityLabel.textContent = state.modality;
  scaleValue.textContent = state.value;
  scaleName.textContent = state.name;
  scaleContext.textContent = state.context;
}

function setOpacity(layer, value) {
  const next = clamp(value).toFixed(3);
  if (layer.style.opacity !== next) layer.style.opacity = next;
}

function setTransform(layer, value) {
  if (layer.style.transform !== value) layer.style.transform = value;
}

function setClip(layer, radius, x, y) {
  const next = `circle(${Math.max(0, radius).toFixed(2)}% at ${x.toFixed(2)}% ${y.toFixed(2)}%)`;
  if (layer.style.clipPath !== next) layer.style.clipPath = next;
}

function desiredImcState(time) {
  if (!storyVisible || activeStep !== 3) return false;
  if (manualMode) return manualMode === 'imc';
  const elapsed = time - tissueEnteredAt;
  if (elapsed < 1100) return false;
  return Math.floor((elapsed - 1100) / AUTO_SWITCH_MS) % 2 === 0;
}

function updateModalityControl(showingImc) {
  if (activeStep === 3) modalityLabel.textContent = showingImc ? 'IMAGING MASS CYTOMETRY' : 'H&E · WHOLE TISSUE';
  modalityOptions.forEach((option) => {
    const active = option.dataset.mode === (showingImc ? 'imc' : 'he');
    option.classList.toggle('active', active);
    option.setAttribute('aria-pressed', String(active));
  });
}

function positionCell(progress) {
  const mobile = window.innerWidth <= 900;
  let x;
  let y;
  let scale;
  let rotation;

  if (progress < 0.37) {
    const emerge = smoothstep(0.11, 0.31, progress);
    x = lerp(mobile ? 50 : 67, mobile ? 50 : 34, emerge);
    y = lerp(mobile ? 75 : 50, mobile ? 75 : 53, emerge);
    scale = lerp(0.2, mobile ? 0.7 : 0.82, emerge);
    rotation = lerp(8, -2, emerge);
  } else {
    const travel = smoothstep(0.37, 0.67, progress);
    x = lerp(mobile ? 50 : 38, mobile ? 78 : 88, travel);
    y = (mobile ? 75 : 53) + Math.sin(travel * Math.PI * 2.2) * (mobile ? 2.2 : 4.2);
    scale = lerp(mobile ? 0.34 : 0.42, 0.13, travel);
    rotation = lerp(-4, 16, travel);
  }

  layers.cell.style.left = `${x.toFixed(2)}%`;
  layers.cell.style.top = `${y.toFixed(2)}%`;
  setTransform(layers.cell, `translate(-50%, -50%) scale(${scale.toFixed(3)}) rotate(${rotation.toFixed(2)}deg)`);

  const trailX = x - 53;
  const trailY = y - 54;
  setTransform(cellTrail, `translate(${trailX.toFixed(2)}vw, ${trailY.toFixed(2)}vh)`);
}

function renderFrame(time) {
  const frameDelta = Math.min(48, previousFrameTime ? time - previousFrameTime : 16.7);
  previousFrameTime = time;
  const progressEase = reduceMotion ? 1 : 1 - Math.exp(-frameDelta * 0.0095);
  visualProgress += (targetProgress - visualProgress) * progressEase;
  if (Math.abs(targetProgress - visualProgress) < 0.0001) visualProgress = targetProgress;

  const progress = visualProgress;
  applyStep(stepFromProgress(progress), time);
  railProgress.style.transform = `scaleY(${progress})`;

  const requestedImc = desiredImcState(time);
  const blendEase = reduceMotion ? 1 : 1 - Math.exp(-frameDelta * 0.035);
  imcBlend += ((requestedImc ? 1 : 0) - imcBlend) * blendEase;
  if (Math.abs(imcBlend - (requestedImc ? 1 : 0)) < 0.002) imcBlend = requestedImc ? 1 : 0;
  updateModalityControl(imcBlend >= 0.5);

  const moleculeAlpha = 1 - smoothstep(0.2, 0.37, progress);
  const cellAlpha = smoothstep(0.1, 0.19, progress) * (1 - smoothstep(0.65, 0.72, progress));
  const bloodstreamAlpha = smoothstep(0.32, 0.4, progress) * (1 - smoothstep(0.63, 0.72, progress));
  const tissueReveal = smoothstep(0.58, 0.69, progress);
  const patientReveal = smoothstep(0.79, 0.89, progress);
  const tissueLife = 1 - smoothstep(0.88, 0.95, progress);
  const tissueAlpha = tissueReveal * tissueLife;

  setOpacity(layers.molecules, moleculeAlpha);
  setOpacity(layers.bloodstream, bloodstreamAlpha);
  setOpacity(layers.cell, cellAlpha);
  setOpacity(layers['tissue-he'], tissueAlpha * (1 - imcBlend));
  setOpacity(layers['tissue-imc'], tissueAlpha * imcBlend);
  setOpacity(layers.patient, patientReveal);

  setTransform(layers.molecules, `scale(${lerp(1, 1.16, smoothstep(0, 0.34, progress)).toFixed(3)})`);
  setTransform(layers.bloodstream, `scale(${lerp(1.04, 1, smoothstep(0.34, 0.64, progress)).toFixed(3)}) translateX(${lerp(1.8, -1.8, smoothstep(0.34, 0.64, progress)).toFixed(2)}%)`);
  positionCell(progress);
  setOpacity(cellTrail, smoothstep(0.37, 0.43, progress) * (1 - smoothstep(0.61, 0.68, progress)));

  const tissueX = window.innerWidth <= 900 ? 78 : 88;
  const tissueY = window.innerWidth <= 900 ? 74 : 53;
  const tissueRadius = lerp(0, 145, tissueReveal);
  setClip(layers['tissue-he'], tissueRadius, tissueX, tissueY);
  setClip(layers['tissue-imc'], tissueRadius, tissueX, tissueY);
  const tissueScale = lerp(1, 0.16, patientReveal);
  const tissueTransform = `scale(${tissueScale.toFixed(3)})`;
  layers['tissue-he'].style.transformOrigin = '31% 51%';
  layers['tissue-imc'].style.transformOrigin = '31% 51%';
  setTransform(layers['tissue-he'], tissueTransform);
  setTransform(layers['tissue-imc'], tissueTransform);

  requestAnimationFrame(renderFrame);
}

modalityOptions.forEach((option) => {
  option.addEventListener('click', () => {
    manualMode = option.dataset.mode;
    updateModalityControl(manualMode === 'imc');
  });
});

buildMolecules();
window.addEventListener('scroll', measureProgress, { passive: true });
window.addEventListener('resize', measureProgress);
measureProgress();
applyStep(0, performance.now());
requestAnimationFrame(renderFrame);
document.querySelector('#year').textContent = new Date().getFullYear();

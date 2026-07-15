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
const tissueAperture = document.querySelector('#tissue-aperture');
const cellAperture = document.querySelector('#cell-aperture');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const states = [
  { modality: 'H&E WHOLE SLIDE', value: '10 mm', name: 'WHOLE TISSUE', context: 'FIELD OF VIEW' },
  { modality: 'IF · SINGLE-CELL IMAGE', value: '10 μm', name: 'ONE CELL', context: 'FIELD OF VIEW' },
  { modality: 'REPRESENTATION · SEARCH', value: '10 μm', name: 'RARE EVENT', context: 'CELL SCALE' },
  { modality: 'MULTIMODAL FOUNDATION MODEL', value: '1 patient', name: 'DNA · RNA · ctDNA · WSI', context: 'MODEL CONTEXT' }
];

const AUTO_SWITCH_MS = 2300;
const OVERVIEW_HOLD_RAW_PROGRESS = 0.055;
let targetProgress = 0;
let visualProgress = 0;
let rawProgress = 0;
let activeStep = -1;
let storyVisible = false;
let manualMode = null;
let imcBlend = 0;
let previousFrameTime = 0;

function stepFromProgress(progress) {
  if (progress < 0.315) return 0;
  if (progress < 0.54) return 1;
  if (progress < 0.76) return 2;
  return 3;
}

function mapScrollProgress(progress) {
  if (progress <= OVERVIEW_HOLD_RAW_PROGRESS) return 0;
  const released = (progress - OVERVIEW_HOLD_RAW_PROGRESS) / (1 - OVERVIEW_HOLD_RAW_PROGRESS);
  return Math.pow(clamp(released), 1.08);
}

function measureProgress() {
  const rect = story.getBoundingClientRect();
  const distance = Math.max(1, rect.height - window.innerHeight);
  rawProgress = clamp(-rect.top / distance);
  targetProgress = mapScrollProgress(rawProgress);
  storyVisible = rect.bottom > 0 && rect.top < window.innerHeight;
  stage.classList.toggle('modality-locked', rawProgress > OVERVIEW_HOLD_RAW_PROGRESS);

  const pageMax = document.documentElement.scrollHeight - window.innerHeight;
  pageProgress.style.transform = `scaleX(${pageMax > 0 ? window.scrollY / pageMax : 0})`;
  const stageRect = stage.getBoundingClientRect();
  header.classList.toggle('on-dark', stageRect.top <= 76 && stageRect.bottom >= 76);
}

function applyStep(step) {
  if (step === activeStep) return;
  activeStep = step;
  chapters.forEach((chapter, index) => chapter.classList.toggle('active', index === activeStep));
  railDots.forEach((dot, index) => dot.classList.toggle('active', index <= activeStep));
  stage.classList.remove('step-0', 'step-1', 'step-2', 'step-3');
  stage.classList.add(`step-${activeStep}`);

  const state = states[activeStep];
  if (activeStep !== 0) modalityLabel.textContent = state.modality;
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
  const next = `circle(${Math.max(0, radius).toFixed(2)}% at ${x}% ${y}%)`;
  if (layer.style.clipPath !== next) layer.style.clipPath = next;
}

function setAperture(element, size, opacity, x, y) {
  const nextSize = `${Math.max(0, size).toFixed(1)}px`;
  element.style.width = nextSize;
  element.style.height = nextSize;
  element.style.left = `${x}%`;
  element.style.top = `${y}%`;
  element.style.opacity = clamp(opacity).toFixed(3);
}

function desiredImcState(time) {
  if (!storyVisible || rawProgress > OVERVIEW_HOLD_RAW_PROGRESS) return false;
  if (manualMode) return manualMode === 'imc';
  return Math.floor(time / AUTO_SWITCH_MS) % 2 === 1;
}

function updateModalityControl(showingImc) {
  modalityLabel.textContent = showingImc ? 'IMAGING MASS CYTOMETRY' : 'H&E WHOLE SLIDE';
  modalityOptions.forEach((option) => {
    const active = option.dataset.mode === (showingImc ? 'imc' : 'he');
    option.classList.toggle('active', active);
    option.setAttribute('aria-pressed', String(active));
  });
}

function updateTransitionalReadout(progress) {
  if (progress < 0.075) {
    updateModalityControl(imcBlend >= 0.5);
    scaleContext.textContent = 'FIELD OF VIEW';
    scaleValue.textContent = '10 mm';
    scaleName.textContent = 'WHOLE TISSUE';
  } else if (progress < 0.225) {
    modalityLabel.textContent = 'H&E · CELLULAR NEIGHBORHOOD';
    scaleContext.textContent = 'FIELD OF VIEW';
    scaleValue.textContent = '500 μm';
    scaleName.textContent = 'CELLULAR NEIGHBORHOOD';
  } else {
    modalityLabel.textContent = 'IF · TARGET CELL';
    scaleContext.textContent = 'FIELD OF VIEW';
    scaleValue.textContent = '50 μm';
    scaleName.textContent = 'CELLULAR TARGET';
  }
}

function renderFrame(time) {
  const frameDelta = Math.min(48, previousFrameTime ? time - previousFrameTime : 16.7);
  previousFrameTime = time;
  const progressEase = reduceMotion ? 1 : 1 - Math.exp(-frameDelta * 0.011);
  visualProgress += (targetProgress - visualProgress) * progressEase;
  if (Math.abs(targetProgress - visualProgress) < 0.0001) visualProgress = targetProgress;

  const progress = visualProgress;
  applyStep(stepFromProgress(progress));
  railProgress.style.transform = `scaleY(${progress})`;

  const requestedImc = desiredImcState(time);
  const blendEase = reduceMotion ? 1 : 1 - Math.exp(-frameDelta * 0.03);
  imcBlend += ((requestedImc ? 1 : 0) - imcBlend) * blendEase;
  if (Math.abs(imcBlend - (requestedImc ? 1 : 0)) < 0.002) imcBlend = requestedImc ? 1 : 0;

  const tissueZoom = smoothstep(0.07, 0.18, progress);
  const tissueAlpha = 1 - smoothstep(0.18, 0.225, progress);
  const fieldReveal = smoothstep(0.08, 0.185, progress);
  const fieldLife = 1 - smoothstep(0.29, 0.33, progress);
  const fieldIfMix = smoothstep(0.19, 0.238, progress);
  const cellZoom = smoothstep(0.225, 0.315, progress);
  const singleReveal = smoothstep(0.232, 0.315, progress);
  const singleLife = 1 - smoothstep(0.69, 0.785, progress);
  const singleAlpha = smoothstep(0.222, 0.238, progress) * singleLife;
  const nucleusAlpha = smoothstep(0.69, 0.79, progress);

  setOpacity(layers['tissue-he'], tissueAlpha * (1 - imcBlend));
  setOpacity(layers['tissue-imc'], tissueAlpha * imcBlend);
  setOpacity(layers['cell-field-he'], fieldLife * (1 - fieldIfMix));
  setOpacity(layers['cell-field-if'], fieldLife * fieldIfMix);
  setOpacity(layers['single-cell'], singleAlpha);
  setOpacity(layers['cell-nucleus'], nucleusAlpha);

  setTransform(layers['tissue-he'], `scale(${lerp(1, 1.22, tissueZoom).toFixed(3)})`);
  setTransform(layers['tissue-imc'], 'scale(1)');

  const fieldRadius = lerp(0, 115, fieldReveal);
  setClip(layers['cell-field-he'], fieldRadius, 63, 50);
  setClip(layers['cell-field-if'], fieldRadius, 63, 50);
  const fieldScale = lerp(1.04, 1.72, cellZoom);
  setTransform(layers['cell-field-he'], `scale(${fieldScale.toFixed(3)})`);
  setTransform(layers['cell-field-if'], `scale(${fieldScale.toFixed(3)})`);

  const singleRadius = lerp(0, 115, singleReveal);
  setClip(layers['single-cell'], singleRadius, 50, 50);
  const earlyShift = lerp(0, -9, smoothstep(0.305, 0.345, progress));
  const cellShift = progress < 0.46 ? earlyShift : lerp(-9, 9, smoothstep(0.46, 0.58, progress));
  const entryScale = lerp(1.2, 0.98, singleReveal);
  const settledScale = lerp(0.98, 1.08, smoothstep(0.35, 0.68, progress));
  const cellScale = progress < 0.32 ? entryScale : settledScale;
  setTransform(layers['single-cell'], `translateX(${cellShift.toFixed(2)}%) scale(${cellScale.toFixed(3)})`);
  setTransform(layers['cell-nucleus'], `translateX(-10%) scale(${lerp(1, 1.045, smoothstep(0.79, 1, progress)).toFixed(3)})`);

  const minViewport = Math.min(window.innerWidth, window.innerHeight);
  const tissueRingOpacity = smoothstep(0.065, 0.09, progress) * (1 - smoothstep(0.17, 0.205, progress));
  const cellRingOpacity = smoothstep(0.215, 0.238, progress) * (1 - smoothstep(0.3, 0.33, progress));
  setAperture(tissueAperture, lerp(52, minViewport * 1.48, fieldReveal), tissueRingOpacity, 63, 50);
  setAperture(cellAperture, lerp(46, minViewport * 1.42, singleReveal), cellRingOpacity, 50, 50);

  if (activeStep === 0) updateTransitionalReadout(progress);
  requestAnimationFrame(renderFrame);
}

modalityOptions.forEach((option) => {
  option.addEventListener('click', () => {
    manualMode = option.dataset.mode;
    updateModalityControl(manualMode === 'imc');
  });
});

window.addEventListener('scroll', measureProgress, { passive: true });
window.addEventListener('resize', measureProgress);
measureProgress();
applyStep(0);
requestAnimationFrame(renderFrame);
document.querySelector('#year').textContent = new Date().getFullYear();

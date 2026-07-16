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
const molecularHelix = document.querySelector('#molecular-helix');
const molecularField = document.querySelector('#molecular-field');
const molecularCaption = document.querySelector('.molecular-caption');
const cellBloom = document.querySelector('#cell-bloom');
const fusionModel = document.querySelector('#fusion-model');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const states = [
  { modality: 'DNA · RNA ENCODERS', value: 'DNA + RNA', name: 'MOLECULAR SIGNAL', context: 'INPUT SPACE' },
  { modality: 'SINGLE-CELL REPRESENTATION', value: '10 μm', name: 'ONE CELL', context: 'PHENOTYPE' },
  { modality: 'LIQUID BIOPSY · SEARCH', value: '1 in millions', name: 'RARE EVENT', context: 'SEARCH SPACE' },
  { modality: 'H&E · WHOLE TISSUE', value: '10 mm', name: 'TISSUE CONTEXT', context: 'FIELD OF VIEW' },
  { modality: 'MULTIMODAL FOUNDATION MODEL', value: '1 patient', name: 'UNIFIED REPRESENTATION', context: 'MODEL CONTEXT' }
];

const STEP_BREAKS = [0.23, 0.43, 0.65, 0.83];
const STORY_HOLD = 0.105;
const AUTO_SWITCH_DELAY = 900;
const AUTO_SWITCH_MS = 1450;
let targetProgress = 0;
let visualProgress = 0;
let activeStep = -1;
let storyVisible = false;
let manualMode = null;
let imcBlend = 0;
let previousFrameTime = 0;
let tissueEnteredAt = 0;

function buildMolecularField() {
  for (let index = 0; index < 21; index += 1) {
    const rung = document.createElement('i');
    const phase = index * 0.52;
    rung.className = 'helix-rung';
    rung.style.setProperty('--y', `${3 + index * 4.7}%`);
    rung.style.setProperty('--depth', `${0.2 + Math.abs(Math.cos(phase)) * 0.8}`);
    rung.style.setProperty('--delay', `${index * -0.16}s`);
    molecularHelix.appendChild(rung);
  }

  const colors = ['#65d6dc', '#f0658f', '#8a7df0', '#d8fa71'];
  for (let index = 0; index < 34; index += 1) {
    const particle = document.createElement('i');
    const angle = index * 2.399;
    const radius = 6 + (index % 8) * 4.4;
    const x = 68 + Math.cos(angle) * radius;
    const y = 51 + Math.sin(angle) * radius * 0.72;
    const size = 2 + (index % 4) * 1.2;
    particle.className = 'molecular-particle';
    particle.style.setProperty('--x', `${x}%`);
    particle.style.setProperty('--y', `${y}%`);
    particle.style.setProperty('--size', `${size}px`);
    particle.style.setProperty('--color', colors[index % colors.length]);
    particle.style.setProperty('--alpha', `${0.18 + (index % 5) * 0.08}`);
    particle.style.setProperty('--duration', `${3.8 + (index % 6) * 0.7}s`);
    particle.style.setProperty('--delay', `${index * -0.21}s`);
    particle.style.setProperty('--dx', `${Math.cos(angle + 0.8) * 13}px`);
    particle.style.setProperty('--dy', `${Math.sin(angle + 0.8) * 11}px`);
    particle.style.setProperty('--bond', `${8 + (index % 5) * 5}px`);
    particle.style.setProperty('--angle', `${(angle * 57.3) % 360}deg`);
    molecularField.appendChild(particle);
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
  const released = clamp((progress - STORY_HOLD) / (1 - STORY_HOLD));
  return Math.pow(released, 1.08);
}

function measureProgress() {
  const rect = story.getBoundingClientRect();
  const distance = Math.max(1, rect.height - window.innerHeight);
  targetProgress = mapScrollProgress(clamp(-rect.top / distance));
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

function setOpacity(element, value) {
  const next = clamp(value).toFixed(3);
  if (element.style.opacity !== next) element.style.opacity = next;
}

function setTransform(element, value) {
  if (element.style.transform !== value) element.style.transform = value;
}

function setClip(element, radius, x, y) {
  const next = `circle(${Math.max(0, radius).toFixed(2)}% at ${x.toFixed(2)}% ${y.toFixed(2)}%)`;
  if (element.style.clipPath !== next) element.style.clipPath = next;
}

function desiredImcState(time) {
  if (!storyVisible || activeStep !== 3) return false;
  if (manualMode) return manualMode === 'imc';
  const elapsed = time - tissueEnteredAt;
  if (elapsed < AUTO_SWITCH_DELAY) return false;
  return Math.floor((elapsed - AUTO_SWITCH_DELAY) / AUTO_SWITCH_MS) % 2 === 0;
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
  const pullBack = smoothstep(0.055, 0.25, progress);
  const enterVessel = smoothstep(0.39, 0.48, progress);
  const vesselTravel = smoothstep(0.44, 0.67, progress);
  const startX = mobile ? 50 : 68;
  const startY = mobile ? 75 : 51;
  const cellX = mobile ? 50 : 33;
  const cellY = mobile ? 75 : 52;
  const vesselX = mobile ? 54 : 56;
  const endX = mobile ? 78 : 82;
  const endY = mobile ? 75 : 52;

  let x = lerp(startX, cellX, pullBack);
  let y = lerp(startY, cellY, pullBack);
  let scale = lerp(mobile ? 3.05 : 3.75, mobile ? 0.76 : 0.86, pullBack);
  let rotation = lerp(2.5, -1.5, pullBack);

  if (enterVessel > 0) {
    x = lerp(cellX, lerp(vesselX, endX, vesselTravel), enterVessel);
    y = lerp(cellY, endY + Math.sin(vesselTravel * Math.PI * 1.6) * (mobile ? 1.6 : 3), enterVessel);
    scale = lerp(mobile ? 0.76 : 0.86, lerp(mobile ? 0.34 : 0.4, 0.18, vesselTravel), enterVessel);
    rotation = lerp(-1.5, 10 + Math.sin(vesselTravel * Math.PI) * 5, enterVessel);
  }

  layers.cell.style.left = `${x.toFixed(2)}%`;
  layers.cell.style.top = `${y.toFixed(2)}%`;
  layers.cell.style.filter = `brightness(${lerp(1, 1.14, enterVessel).toFixed(3)})`;
  setTransform(layers.cell, `translate(-50%, -50%) scale(${scale.toFixed(3)}) rotate(${rotation.toFixed(2)}deg)`);

  cellBloom.style.left = `${endX}%`;
  cellBloom.style.top = `${endY}%`;
}

function renderFrame(time) {
  const frameDelta = Math.min(48, previousFrameTime ? time - previousFrameTime : 16.7);
  previousFrameTime = time;
  const progressEase = reduceMotion ? 1 : 1 - Math.exp(-frameDelta * 0.0105);
  visualProgress += (targetProgress - visualProgress) * progressEase;
  if (Math.abs(targetProgress - visualProgress) < 0.0001) visualProgress = targetProgress;

  const progress = visualProgress;
  applyStep(stepFromProgress(progress), time);
  railProgress.style.transform = `scaleY(${progress})`;

  const requestedImc = desiredImcState(time);
  const blendEase = reduceMotion ? 1 : 1 - Math.exp(-frameDelta * 0.04);
  imcBlend += ((requestedImc ? 1 : 0) - imcBlend) * blendEase;
  if (Math.abs(imcBlend - (requestedImc ? 1 : 0)) < 0.002) imcBlend = requestedImc ? 1 : 0;
  updateModalityControl(imcBlend >= 0.5);

  const helixFold = smoothstep(0.075, 0.225, progress);
  const molecularAlpha = 1 - smoothstep(0.18, 0.3, progress);
  const cellAlpha = (1 - smoothstep(0.665, 0.705, progress)) * (1 - smoothstep(0, 0.035, progress) * 0.04);
  const bloodstreamAlpha = smoothstep(0.39, 0.47, progress) * (1 - smoothstep(0.64, 0.71, progress));
  const tissueReveal = smoothstep(0.65, 0.72, progress);
  const patientReveal = smoothstep(0.83, 0.91, progress);
  const tissueLife = 1 - smoothstep(0.89, 0.96, progress);
  const tissueAlpha = tissueReveal * tissueLife;

  setOpacity(layers.molecules, molecularAlpha);
  setOpacity(layers.bloodstream, bloodstreamAlpha);
  setOpacity(layers.cell, cellAlpha);
  setOpacity(layers['tissue-he'], tissueAlpha * (1 - imcBlend));
  setOpacity(layers['tissue-imc'], tissueAlpha * imcBlend);
  setOpacity(layers.patient, patientReveal);

  positionCell(progress);
  const helixScale = lerp(1, 0.2, helixFold);
  setTransform(molecularHelix, `translate(-50%, -50%) rotate(${lerp(8, 38, helixFold).toFixed(2)}deg) scale(${helixScale.toFixed(3)})`);
  setOpacity(molecularHelix, 1 - smoothstep(0.15, 0.23, progress));
  setOpacity(molecularField, 1 - smoothstep(0.13, 0.25, progress));
  setOpacity(molecularCaption, 1 - smoothstep(0.09, 0.17, progress));

  const vesselPan = smoothstep(0.43, 0.66, progress);
  setTransform(layers.bloodstream, `scale(${lerp(1.04, 1, vesselPan).toFixed(3)}) translateX(${lerp(1.5, -1.5, vesselPan).toFixed(2)}%)`);

  const bloomIn = smoothstep(0.635, 0.68, progress);
  const bloomOut = 1 - smoothstep(0.69, 0.735, progress);
  setOpacity(cellBloom, bloomIn * bloomOut);
  setTransform(cellBloom, `translate(-50%, -50%) scale(${lerp(0.35, 2.6, tissueReveal).toFixed(3)})`);

  const tissueX = window.innerWidth <= 900 ? 78 : 82;
  const tissueY = window.innerWidth <= 900 ? 75 : 52;
  setClip(layers['tissue-he'], lerp(0, 145, tissueReveal), tissueX, tissueY);
  setClip(layers['tissue-imc'], lerp(0, 145, tissueReveal), tissueX, tissueY);

  const tissueScale = lerp(1, 0.14, patientReveal);
  const tissueTransform = `scale(${tissueScale.toFixed(3)})`;
  layers['tissue-he'].style.transformOrigin = '31% 51%';
  layers['tissue-imc'].style.transformOrigin = '31% 51%';
  setTransform(layers['tissue-he'], tissueTransform);
  setTransform(layers['tissue-imc'], tissueTransform);
  setOpacity(fusionModel, patientReveal);
  setTransform(fusionModel, `translate(-50%, -50%) scale(${lerp(0.72, 1, patientReveal).toFixed(3)})`);

  requestAnimationFrame(renderFrame);
}

modalityOptions.forEach((option) => {
  option.addEventListener('click', () => {
    manualMode = option.dataset.mode;
    updateModalityControl(manualMode === 'imc');
  });
});

buildMolecularField();
window.addEventListener('scroll', measureProgress, { passive: true });
window.addEventListener('resize', measureProgress);
measureProgress();
applyStep(0, performance.now());
requestAnimationFrame(renderFrame);
document.querySelector('#year').textContent = new Date().getFullYear();

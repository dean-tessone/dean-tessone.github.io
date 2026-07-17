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
const molecularCanvas = document.querySelector('#molecular-canvas');
const molecularContext = molecularCanvas.getContext('2d');
const molecularCaption = document.querySelector('.molecular-caption');
const cellBloom = document.querySelector('#cell-bloom');
const fusionModel = document.querySelector('#fusion-model');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const AMBIENT_FRAME_MS = 1000 / 30;

const states = [
  { modality: 'DNA · RNA ENCODERS', value: 'DNA + RNA', name: 'MOLECULAR SIGNAL', context: 'INPUT SPACE' },
  { modality: 'CONTRASTIVE LEARNING · IF', value: '10 μm', name: 'SINGLE-CELL PHENOTYPING', context: 'FEATURE SPACE' },
  { modality: 'DENOISING AUTOENCODER · RED', value: '2.5M → 2,500', name: 'RARITY RANKING', context: 'RECONSTRUCTION ERROR' },
  { modality: 'H&E · WHOLE TISSUE', value: '10 mm', name: 'TISSUE CONTEXT', context: 'FIELD OF VIEW' },
  { modality: 'MULTIMODAL FOUNDATION MODEL', value: '1 patient', name: 'UNIFIED REPRESENTATION', context: 'MODEL CONTEXT' }
];

const STEP_BREAKS = [0.23, 0.43, 0.65, 0.83];
const STORY_TIMELINE = [
  [0, 0],
  [0.1, 0],
  [0.22, 0.31],
  [0.3, 0.31],
  [0.42, 0.54],
  [0.5, 0.54],
  [0.62, 0.76],
  [0.7, 0.76],
  [0.83, 0.92],
  [0.92, 0.92],
  [1, 1]
];
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
let canvasWidth = 0;
let canvasHeight = 0;
let canvasDpr = 1;
let lastShowingImc = null;
let renderFrameId = 0;
let ambientTimer = 0;
let scrollPositionDirty = true;

function resizeMolecularCanvas() {
  const nextWidth = Math.max(1, Math.round(stage.clientWidth));
  const nextHeight = Math.max(1, Math.round(stage.clientHeight));
  const dprLimit = window.innerWidth <= 900 ? 1.25 : 1.5;
  const nextDpr = Math.min(dprLimit, window.devicePixelRatio || 1);
  if (nextWidth === canvasWidth && nextHeight === canvasHeight && nextDpr === canvasDpr) return;

  canvasWidth = nextWidth;
  canvasHeight = nextHeight;
  canvasDpr = nextDpr;
  molecularCanvas.width = Math.round(canvasWidth * canvasDpr);
  molecularCanvas.height = Math.round(canvasHeight * canvasDpr);
  molecularContext.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
}

function drawNode(x, y, radius, color, alpha) {
  if (alpha <= 0.002) return;
  molecularContext.fillStyle = color;
  molecularContext.globalAlpha = alpha * 0.16;
  molecularContext.beginPath();
  molecularContext.arc(x, y, radius * 2.45, 0, Math.PI * 2);
  molecularContext.fill();
  molecularContext.globalAlpha = alpha;
  molecularContext.beginPath();
  molecularContext.arc(x, y, radius, 0, Math.PI * 2);
  molecularContext.fill();
  molecularContext.globalAlpha = 1;
}

function drawMolecularAssembly(progress, time) {
  molecularContext.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
  molecularContext.clearRect(0, 0, canvasWidth, canvasHeight);
  if (progress > 0.315) return;

  const mobile = window.innerWidth <= 900;
  const movement = smoothstep(0.155, 0.235, progress);
  const assembly = smoothstep(0.065, 0.19, progress);
  const membrane = smoothstep(0.145, 0.245, progress);
  const scaffoldAlpha = 1 - smoothstep(0.225, 0.305, progress);
  const motionTime = reduceMotion ? 0 : time * 0.001;
  const centerX = lerp(mobile ? canvasWidth * 0.5 : canvasWidth * 0.68, mobile ? canvasWidth * 0.5 : canvasWidth * 0.33, movement);
  const centerY = lerp(mobile ? canvasHeight * 0.75 : canvasHeight * 0.51, mobile ? canvasHeight * 0.75 : canvasHeight * 0.52, movement);
  const helixHeight = mobile ? Math.min(250, canvasHeight * 0.31) : Math.min(480, canvasHeight * 0.64);
  const helixWidth = mobile ? 34 : 54;
  const nucleusRadius = mobile ? 48 : 76;
  const cellRadius = lerp(mobile ? 102 : 174, mobile ? 122 : 238, movement);
  const dnaCenterX = centerX - (mobile ? 42 : 78) * (1 - assembly);
  const rnaCenterX = centerX + (mobile ? 58 : 112) * (1 - assembly);
  const strandAlpha = (1 - assembly) * scaffoldAlpha;
  const nodeAlpha = (0.48 + assembly * 0.35) * scaffoldAlpha;

  const halo = molecularContext.createRadialGradient(centerX, centerY, 0, centerX, centerY, cellRadius * 1.3);
  halo.addColorStop(0, `rgba(47, 124, 255, ${0.16 * assembly})`);
  halo.addColorStop(0.45, `rgba(105, 199, 255, ${0.065 * membrane})`);
  halo.addColorStop(1, 'rgba(3, 8, 18, 0)');
  molecularContext.fillStyle = halo;
  molecularContext.beginPath();
  molecularContext.arc(centerX, centerY, cellRadius * 1.3, 0, Math.PI * 2);
  molecularContext.fill();

  molecularContext.globalCompositeOperation = 'lighter';
  const dnaA = [];
  const dnaB = [];
  const rungCount = mobile ? 16 : 20;
  for (let index = 0; index < rungCount; index += 1) {
    const amount = index / (rungCount - 1);
    const y = centerY - helixHeight / 2 + amount * helixHeight;
    const twist = amount * Math.PI * 5.5 + motionTime * 0.72;
    const startAx = dnaCenterX + Math.cos(twist) * helixWidth;
    const startBx = dnaCenterX - Math.cos(twist) * helixWidth;
    const targetAngleA = index * 2.08 + motionTime * 0.19;
    const targetAngleB = targetAngleA + Math.PI;
    const targetRadius = nucleusRadius * (0.68 + (index % 4) * 0.065);
    const swirl = Math.sin(assembly * Math.PI) * (mobile ? 22 : 38);
    const ax = lerp(startAx, centerX + Math.cos(targetAngleA) * targetRadius, assembly) + Math.cos(targetAngleA + Math.PI / 2) * swirl;
    const ay = lerp(y, centerY + Math.sin(targetAngleA) * targetRadius * 0.84, assembly) + Math.sin(targetAngleA + Math.PI / 2) * swirl;
    const bx = lerp(startBx, centerX + Math.cos(targetAngleB) * targetRadius, assembly) + Math.cos(targetAngleB + Math.PI / 2) * swirl;
    const by = lerp(y, centerY + Math.sin(targetAngleB) * targetRadius * 0.84, assembly) + Math.sin(targetAngleB + Math.PI / 2) * swirl;
    dnaA.push([ax, ay]);
    dnaB.push([bx, by]);

    molecularContext.strokeStyle = `rgba(226, 237, 255, ${0.38 * strandAlpha})`;
    molecularContext.lineWidth = 1;
    molecularContext.beginPath();
    molecularContext.moveTo(ax, ay);
    molecularContext.lineTo(bx, by);
    molecularContext.stroke();
    drawNode(ax, ay, 2.3 + (index % 3) * 0.45, '#69c7ff', nodeAlpha);
    drawNode(bx, by, 2.3 + ((index + 1) % 3) * 0.45, '#2f7cff', nodeAlpha);
  }

  ['#69c7ff', '#2f7cff'].forEach((color, strandIndex) => {
    const points = strandIndex === 0 ? dnaA : dnaB;
    molecularContext.strokeStyle = color;
    molecularContext.globalAlpha = 0.36 * strandAlpha;
    molecularContext.lineWidth = 1.2;
    molecularContext.beginPath();
    points.forEach(([x, y], index) => index ? molecularContext.lineTo(x, y) : molecularContext.moveTo(x, y));
    molecularContext.stroke();
    molecularContext.globalAlpha = 1;
  });

  const rnaPoints = [];
  const rnaCount = mobile ? 14 : 17;
  for (let index = 0; index < rnaCount; index += 1) {
    const amount = index / (rnaCount - 1);
    const startX = rnaCenterX + Math.sin(amount * Math.PI * 4.2 + motionTime * 0.55) * (mobile ? 18 : 27);
    const startY = centerY - helixHeight * 0.39 + amount * helixHeight * 0.78;
    const targetAngle = index * 2.36 + 0.8 + motionTime * 0.16;
    const targetRadius = nucleusRadius * (0.5 + (index % 5) * 0.075);
    const swirl = Math.sin(assembly * Math.PI) * (mobile ? 24 : 42);
    const x = lerp(startX, centerX + Math.cos(targetAngle) * targetRadius, assembly) + Math.cos(targetAngle + Math.PI / 2) * swirl;
    const y = lerp(startY, centerY + Math.sin(targetAngle) * targetRadius * 0.84, assembly) + Math.sin(targetAngle + Math.PI / 2) * swirl;
    rnaPoints.push([x, y]);
    drawNode(x, y, 2.1 + (index % 3) * 0.5, index % 4 === 0 ? '#f5f8ff' : '#8eb5ff', nodeAlpha);
  }
  molecularContext.strokeStyle = '#f5f8ff';
  molecularContext.globalAlpha = 0.34 * strandAlpha;
  molecularContext.lineWidth = 1.1;
  molecularContext.beginPath();
  rnaPoints.forEach(([x, y], index) => index ? molecularContext.lineTo(x, y) : molecularContext.moveTo(x, y));
  molecularContext.stroke();
  molecularContext.globalAlpha = 1;

  if (assembly > 0.01) {
    molecularContext.save();
    molecularContext.translate(centerX, centerY);
    molecularContext.rotate(motionTime * 0.055);
    molecularContext.strokeStyle = `rgba(142, 181, 255, ${0.56 * assembly * scaffoldAlpha})`;
    molecularContext.shadowColor = '#2f7cff';
    molecularContext.shadowBlur = 10;
    molecularContext.lineWidth = 1.25;
    molecularContext.setLineDash([3, 7]);
    molecularContext.beginPath();
    molecularContext.ellipse(0, 0, nucleusRadius * 1.08, nucleusRadius * 0.86, -0.2, 0, Math.PI * 2);
    molecularContext.stroke();
    molecularContext.restore();
  }

  if (membrane > 0.01) {
    const ringRadius = lerp(nucleusRadius * 0.92, cellRadius, membrane);
    molecularContext.save();
    molecularContext.translate(centerX, centerY);
    molecularContext.rotate(-motionTime * 0.025);
    molecularContext.strokeStyle = `rgba(47, 124, 255, ${0.62 * membrane * scaffoldAlpha})`;
    molecularContext.shadowColor = '#2f7cff';
    molecularContext.shadowBlur = 12;
    molecularContext.lineWidth = 1.8;
    molecularContext.beginPath();
    const membranePoints = mobile ? 52 : 72;
    for (let index = 0; index <= membranePoints; index += 1) {
      const angle = index / membranePoints * Math.PI * 2;
      const variance = 1 + Math.sin(angle * 7 + 0.4) * 0.035 + Math.cos(angle * 11) * 0.018;
      const x = Math.cos(angle) * ringRadius * variance;
      const y = Math.sin(angle) * ringRadius * 0.94 * variance;
      index ? molecularContext.lineTo(x, y) : molecularContext.moveTo(x, y);
    }
    molecularContext.closePath();
    molecularContext.stroke();

    molecularContext.strokeStyle = `rgba(105, 199, 255, ${0.24 * membrane * scaffoldAlpha})`;
    molecularContext.lineWidth = 0.8;
    for (let index = 0; index < 11; index += 1) {
      const angle = index / 11 * Math.PI * 2 + 0.35;
      molecularContext.beginPath();
      molecularContext.moveTo(Math.cos(angle) * nucleusRadius * 0.82, Math.sin(angle) * nucleusRadius * 0.68);
      molecularContext.quadraticCurveTo(Math.cos(angle + 0.8) * ringRadius * 0.62, Math.sin(angle + 0.8) * ringRadius * 0.5, Math.cos(angle) * ringRadius * 0.94, Math.sin(angle) * ringRadius * 0.88);
      molecularContext.stroke();
    }
    molecularContext.restore();
  }

  molecularContext.globalCompositeOperation = 'source-over';
}

function stepFromProgress(progress) {
  if (progress < STEP_BREAKS[0]) return 0;
  if (progress < STEP_BREAKS[1]) return 1;
  if (progress < STEP_BREAKS[2]) return 2;
  if (progress < STEP_BREAKS[3]) return 3;
  return 4;
}

function mapScrollProgress(progress) {
  const rawProgress = clamp(progress);
  for (let index = 0; index < STORY_TIMELINE.length - 1; index += 1) {
    const [startScroll, startProgress] = STORY_TIMELINE[index];
    const [endScroll, endProgress] = STORY_TIMELINE[index + 1];
    if (rawProgress > endScroll) continue;
    if (startProgress === endProgress) return startProgress;
    return lerp(startProgress, endProgress, (rawProgress - startScroll) / (endScroll - startScroll));
  }
  return STORY_TIMELINE[STORY_TIMELINE.length - 1][1];
}

function requestRender() {
  if (document.hidden) return;
  if (ambientTimer) {
    window.clearTimeout(ambientTimer);
    ambientTimer = 0;
  }
  if (!renderFrameId) renderFrameId = requestAnimationFrame(renderFrame);
}

function scheduleAmbientRender() {
  if (document.hidden || ambientTimer || renderFrameId) return;
  ambientTimer = window.setTimeout(() => {
    ambientTimer = 0;
    requestRender();
  }, AMBIENT_FRAME_MS);
}

function stopRendering() {
  if (renderFrameId) cancelAnimationFrame(renderFrameId);
  if (ambientTimer) window.clearTimeout(ambientTimer);
  renderFrameId = 0;
  ambientTimer = 0;
}

function measureProgress() {
  const rect = story.getBoundingClientRect();
  const distance = Math.max(1, rect.height - window.innerHeight);
  targetProgress = mapScrollProgress(clamp(-rect.top / distance));
  storyVisible = rect.bottom > 0 && rect.top < window.innerHeight;
  stage.classList.toggle('story-visible', storyVisible);

  const pageMax = document.documentElement.scrollHeight - window.innerHeight;
  setTransform(pageProgress, `scaleX(${pageMax > 0 ? window.scrollY / pageMax : 0})`);
  const stageRect = stage.getBoundingClientRect();
  header.classList.toggle('on-dark', stageRect.top <= 76 && stageRect.bottom >= 76);
}

function handleScroll() {
  scrollPositionDirty = true;
  requestRender();
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

function setLayerOpacity(element, value) {
  const nextValue = clamp(value);
  setOpacity(element, nextValue);
  const nextVisibility = nextValue <= 0.001 ? 'hidden' : 'visible';
  if (element.style.visibility !== nextVisibility) element.style.visibility = nextVisibility;
}

function setTransform(element, value) {
  if (element.style.transform !== value) element.style.transform = value;
}

function setClip(element, radius, x, y) {
  const next = `circle(${Math.max(0, radius).toFixed(1)}% at ${x.toFixed(1)}% ${y.toFixed(1)}%)`;
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
  if (showingImc === lastShowingImc) return;
  lastShowingImc = showingImc;
  if (activeStep === 3) modalityLabel.textContent = showingImc ? 'IMAGING MASS CYTOMETRY' : 'H&E · WHOLE TISSUE';
  modalityOptions.forEach((option) => {
    const active = option.dataset.mode === (showingImc ? 'imc' : 'he');
    option.classList.toggle('active', active);
    option.setAttribute('aria-pressed', String(active));
  });
}

function positionCell(progress) {
  const mobile = window.innerWidth <= 900;
  const pullBack = smoothstep(0.155, 0.235, progress);
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
  let scale = lerp(0.62, mobile ? 0.76 : 0.86, pullBack);
  let rotation = lerp(0, -1.5, pullBack);

  if (enterVessel > 0) {
    x = lerp(cellX, lerp(vesselX, endX, vesselTravel), enterVessel);
    y = lerp(cellY, endY + Math.sin(vesselTravel * Math.PI * 1.6) * (mobile ? 1.6 : 3), enterVessel);
    scale = lerp(mobile ? 0.76 : 0.86, lerp(mobile ? 0.34 : 0.4, 0.18, vesselTravel), enterVessel);
    rotation = lerp(-1.5, 10 + Math.sin(vesselTravel * Math.PI) * 5, enterVessel);
  }

  const translateX = canvasWidth * x / 100;
  const translateY = canvasHeight * y / 100;
  setTransform(layers.cell, `translate3d(${translateX.toFixed(1)}px, ${translateY.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)}) rotate(${rotation.toFixed(2)}deg)`);
}

function renderFrame(time) {
  renderFrameId = 0;
  if (scrollPositionDirty) {
    measureProgress();
    scrollPositionDirty = false;
  }

  const frameDelta = Math.min(48, previousFrameTime ? time - previousFrameTime : 16.7);
  previousFrameTime = time;
  const progressEase = reduceMotion ? 1 : 1 - Math.exp(-frameDelta * 0.0105);
  visualProgress += (targetProgress - visualProgress) * progressEase;
  if (Math.abs(targetProgress - visualProgress) < 0.0001) visualProgress = targetProgress;

  const progress = visualProgress;
  applyStep(stepFromProgress(progress), time);
  setTransform(railProgress, `scaleY(${progress.toFixed(4)})`);

  const requestedImc = desiredImcState(time);
  const blendEase = reduceMotion ? 1 : 1 - Math.exp(-frameDelta * 0.04);
  imcBlend += ((requestedImc ? 1 : 0) - imcBlend) * blendEase;
  if (Math.abs(imcBlend - (requestedImc ? 1 : 0)) < 0.002) imcBlend = requestedImc ? 1 : 0;
  updateModalityControl(imcBlend >= 0.5);

  const molecularAlpha = 1 - smoothstep(0.235, 0.31, progress);
  const cellResolve = smoothstep(0.145, 0.235, progress);
  const cellAlpha = cellResolve * (1 - smoothstep(0.665, 0.705, progress));
  const bloodstreamAlpha = smoothstep(0.39, 0.47, progress) * (1 - smoothstep(0.64, 0.71, progress));
  const tissueReveal = smoothstep(0.65, 0.72, progress);
  const patientReveal = smoothstep(0.83, 0.91, progress);
  const tissueLife = 1 - smoothstep(0.89, 0.96, progress);
  const tissueAlpha = tissueReveal * tissueLife;

  setLayerOpacity(layers.molecules, molecularAlpha);
  setLayerOpacity(layers.bloodstream, bloodstreamAlpha);
  setLayerOpacity(layers.cell, cellAlpha);
  setLayerOpacity(layers.tissue, tissueAlpha);
  setLayerOpacity(layers['tissue-he'], tissueAlpha > 0.001 ? 1 - imcBlend : 0);
  setLayerOpacity(layers['tissue-imc'], tissueAlpha > 0.001 ? imcBlend : 0);
  setLayerOpacity(layers.patient, patientReveal);

  positionCell(progress);
  setClip(layers.cell, lerp(2, 76, cellResolve), 50, 50);
  if (storyVisible && progress <= 0.315) drawMolecularAssembly(progress, time);
  setOpacity(molecularCaption, 1 - smoothstep(0.075, 0.16, progress));

  const vesselPan = smoothstep(0.43, 0.66, progress);
  setTransform(layers.bloodstream, `scale(${lerp(1.04, 1, vesselPan).toFixed(3)}) translateX(${lerp(1.5, -1.5, vesselPan).toFixed(2)}%)`);

  const bloomIn = smoothstep(0.635, 0.68, progress);
  const bloomOut = 1 - smoothstep(0.69, 0.735, progress);
  setLayerOpacity(cellBloom, bloomIn * bloomOut);
  setTransform(cellBloom, `translate(-50%, -50%) scale(${lerp(0.35, 2.6, tissueReveal).toFixed(3)})`);

  const tissueX = window.innerWidth <= 900 ? 78 : 82;
  const tissueY = window.innerWidth <= 900 ? 75 : 52;
  setClip(layers.tissue, lerp(0, 145, tissueReveal), tissueX, tissueY);

  const tissueScale = lerp(1, 0.14, patientReveal);
  const tissueTransform = `scale(${tissueScale.toFixed(3)})`;
  setTransform(layers.tissue, tissueTransform);
  setLayerOpacity(fusionModel, patientReveal);
  setTransform(fusionModel, `translate(-50%, -50%) scale(${lerp(0.72, 1, patientReveal).toFixed(3)})`);

  const progressMoving = Math.abs(targetProgress - visualProgress) >= 0.0001;
  const blendMoving = Math.abs((requestedImc ? 1 : 0) - imcBlend) >= 0.002;
  const needsAmbientMotion = storyVisible && !reduceMotion && (
    (activeStep === 0 && progress <= 0.315) ||
    (activeStep === 3 && !manualMode)
  );

  if (progressMoving || blendMoving) requestRender();
  else if (needsAmbientMotion) scheduleAmbientRender();
}

modalityOptions.forEach((option) => {
  option.addEventListener('click', () => {
    manualMode = option.dataset.mode;
    updateModalityControl(manualMode === 'imc');
    requestRender();
  });
});

resizeMolecularCanvas();
window.addEventListener('scroll', handleScroll, { passive: true });
window.addEventListener('resize', () => {
  resizeMolecularCanvas();
  scrollPositionDirty = true;
  requestRender();
});
if ('ResizeObserver' in window) {
  const stageResizeObserver = new ResizeObserver(() => {
    resizeMolecularCanvas();
    scrollPositionDirty = true;
    requestRender();
  });
  stageResizeObserver.observe(stage);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRendering();
    return;
  }
  previousFrameTime = 0;
  scrollPositionDirty = true;
  requestRender();
});
measureProgress();
scrollPositionDirty = false;
applyStep(0, performance.now());
requestRender();
document.querySelector('#year').textContent = new Date().getFullYear();

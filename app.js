import { createState, transition, activeMolecule } from './lesson.js';
import { createMolecularViewer } from './viewer.js';
import { createUI } from './ui.js';
import { createPronunciation } from './pronunciation.js';

const $ = id => document.getElementById(id);

async function boot() {
  const response = await fetch('./assets/molecules.json');
  if (!response.ok) throw new Error(`Molecule data could not load (${response.status})`);
  const dataset = await response.json();
  let state = createState(dataset);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let ui;
  let viewer;
  const pronunciation = createPronunciation({
    synth: window.speechSynthesis,
    Utterance: window.SpeechSynthesisUtterance,
    onStatus(status) {
      const node = $('speech-status');
      node.dataset.state = status.state;
      node.dataset.code = status.code;
      const zh = document.createElement('span');
      const en = document.createElement('span');
      zh.lang = 'zh-CN'; zh.textContent = status.message.zh;
      en.lang = 'en'; en.textContent = status.message.en;
      node.replaceChildren(zh, en);
      $('speak-name').disabled = !status.supported;
      $('speak-slow').disabled = !status.supported;
      $('speech-stop').disabled = !['requested', 'speaking'].includes(status.state);
    },
  });

  function dispatch(action) {
    const previous = state;
    state = transition(state, action, dataset);
    if (['chapter', 'molecule'].includes(action.type)) pronunciation.stop();
    const molecule = activeMolecule(dataset, state);
    ui.render(state, previous);
    if (previous.moleculeId !== state.moleculeId) viewer.load(molecule);
    if (!['answer', 'submit', 'retry'].includes(action.type)) viewer.update(state);
  }

  ui = createUI(dataset, dispatch);
  viewer = createMolecularViewer($('viewer'), id => dispatch({ type: 'selectAtom', id }), () => {
    const message = $('viewer-message');
    message.hidden = false;
    message.textContent = '此设备暂不能显示3D。下方二维结构、命名步骤与练习仍可使用。 / 3D is unavailable on this device. The 2D diagram, naming lessons and quizzes still work.';
    for (const id of ['ballstick', 'spacefill', 'spin-toggle', 'zoom-in', 'zoom-out', 'reset-view']) $(id).disabled = true;
  });
  if (reducedMotion.matches) {
    $('spin-toggle').disabled = true;
    $('spin-toggle').title = '已启用减少动态效果 / Reduced motion is enabled';
  }
  reducedMotion.addEventListener('change', event => {
    if (event.matches && state.spinning) dispatch({ type: 'spin', value: false });
    $('spin-toggle').disabled = event.matches || $('viewer').dataset.status !== 'ready';
  });
  $('chapter-select').addEventListener('change', event => dispatch({ type: 'chapter', id: event.target.value }));
  $('molecule-search').addEventListener('input', event => ui.search(event.target.value, state));
  document.addEventListener('click', event => {
    const molecule = event.target.closest('[data-molecule]');
    if (molecule instanceof HTMLButtonElement) return dispatch({ type: 'molecule', id: molecule.dataset.molecule });
    const step = event.target.closest('[data-step]');
    if (step) return dispatch({ type: 'step', index: Number(step.dataset.step) });
    const atom = event.target.closest('[data-atom]');
    if (atom) return dispatch({ type: 'selectAtom', id: Number(atom.dataset.atom) });
    const answer = event.target.closest('[data-answer]');
    if (answer && !answer.disabled) return dispatch({ type: 'answer', id: answer.dataset.answer });
  });
  $('previous-step').addEventListener('click', () => dispatch({ type: 'step', index: state.stepIndex - 1 }));
  $('next-step').addEventListener('click', () => dispatch({ type: 'step', index: state.stepIndex + 1 }));
  $('ballstick').addEventListener('click', () => dispatch({ type: 'representation', value: 'ballstick' }));
  $('spacefill').addEventListener('click', () => dispatch({ type: 'representation', value: 'spacefill' }));
  $('hydrogens-toggle').addEventListener('click', () => dispatch({ type: 'hydrogens', value: !state.showHydrogens }));
  $('structure-expanded').addEventListener('click', () => dispatch({ type: 'hydrogens', value: true }));
  $('structure-skeletal').addEventListener('click', () => dispatch({ type: 'hydrogens', value: false }));
  $('numbers-toggle').addEventListener('click', () => dispatch({ type: 'numbers', value: !state.showNumbers }));
  $('spin-toggle').addEventListener('click', () => dispatch({ type: 'spin', value: !state.spinning }));
  $('zoom-in').addEventListener('click', () => viewer.zoom(1.18));
  $('zoom-out').addEventListener('click', () => viewer.zoom(1 / 1.18));
  $('reset-view').addEventListener('click', () => viewer.reset());
  $('quiz-submit').addEventListener('click', () => dispatch({ type: 'submit' }));
  $('quiz-retry').addEventListener('click', () => dispatch({ type: 'retry' }));
  $('speak-name').addEventListener('click', () => pronunciation.speak(activeMolecule(dataset, state).name.en));
  $('speak-slow').addEventListener('click', () => pronunciation.speak(activeMolecule(dataset, state).name.en, true));
  $('speech-stop').addEventListener('click', () => pronunciation.stop());
  window.addEventListener('pagehide', () => { pronunciation.dispose(); viewer.dispose(); }, { once: true });
  ui.render(state);
  viewer.load(activeMolecule(dataset, state));
  viewer.update(state);
  document.body.dataset.ready = 'true';
}

boot().catch(error => {
  const message = $('load-error');
  message.hidden = false;
  message.textContent = `学习内容未能载入。请通过本地服务器打开网页，而不是直接双击HTML文件。 / The lesson could not load. Open the site through its local server, not file://. ${error.message}`;
  document.body.dataset.ready = 'error';
});

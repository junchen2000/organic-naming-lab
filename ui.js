import { activeMolecule, atomDetails, searchMolecules, stepSelection } from './lesson.js';
import { formatFormula, gradeAnswer } from './quiz.js';
import { elementColors } from './viewer.js';

const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const ELEMENTS = { H: '氢 / Hydrogen', C: '碳 / Carbon', N: '氮 / Nitrogen', O: '氧 / Oxygen', F: '氟 / Fluorine', Cl: '氯 / Chlorine', Br: '溴 / Bromine', I: '碘 / Iodine' };

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function bilingual(node, pair) {
  const chinese = element('span', 'zh', pair.zh);
  const english = element('span', 'en', pair.en);
  chinese.lang = 'zh-CN';
  english.lang = 'en';
  node.replaceChildren(chinese, english);
  return node;
}

function svgElement(tag, attributes) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function createUI(dataset, dispatch) {
  let lastMoleculeId = null;
  let lastChapterId = null;
  let searchQuery = '';
  let structureSvg = null;
  const chapterSelect = $('chapter-select');
  for (const chapter of dataset.chapters) {
    const option = element('option', '', `${chapter.name.zh} / ${chapter.name.en}`);
    option.value = chapter.id;
    chapterSelect.append(option);
  }
  const reference = $('reference-content');
  const table = element('table');
  const header = element('tr');
  for (const text of ['碳 / C', '词根 / Root', '中文 / 中文名']) header.append(element('th', '', text));
  table.append(header);
  for (const root of dataset.roots) {
    const row = element('tr');
    for (const value of [root.count, root.root, root.zh]) row.append(element('td', '', value));
    table.append(row);
  }
  reference.append(table);
  for (const multiplier of dataset.multipliers) {
    reference.append(bilingual(element('p'), {
      zh: `${multiplier.prefix}：${multiplier.zh}`,
      en: `${multiplier.prefix}: ${multiplier.en}`,
    }));
  }

  function moleculeList(state) {
    const records = searchMolecules(dataset, state.chapterId, searchQuery);
    const list = $('molecule-list');
    list.replaceChildren();
    for (const [index, molecule] of records.entries()) {
      const button = element('button', 'molecule-button');
      button.dataset.molecule = molecule.id;
      button.setAttribute('aria-current', String(state.moleculeId === molecule.id));
      const names = element('div', 'list-names');
      names.append(element('strong', '', molecule.name.zh), element('span', 'en', molecule.name.en));
      button.append(element('span', 'list-index', String(index + 1).padStart(2, '0')), names);
      list.append(button);
    }
    if (!records.length) list.append(bilingual(element('p', 'empty-search'), {
      zh: '本章没有匹配的分子。', en: 'No matching molecule in this chapter.',
    }));
  }

  function renderStructure(molecule) {
    const parsed = new DOMParser().parseFromString(molecule.svg, 'image/svg+xml');
    structureSvg = document.importNode(parsed.documentElement, true);
    structureSvg.setAttribute('viewBox', '0 0 600 360');
    structureSvg.removeAttribute('width');
    structureSvg.removeAttribute('height');
    structureSvg.setAttribute('role', 'group');
    structureSvg.setAttribute('aria-label', `${molecule.name.zh}二维结构 / ${molecule.name.en} 2D structure`);
    structureSvg.append(svgElement('g', { class: 'selection-layer' }));
    const hitLayer = svgElement('g', { class: 'hit-layer' });
    for (const atom of molecule.atoms.filter(item => item.xy)) {
      const hit = svgElement('circle', {
        class: 'atom-hit', cx: atom.xy[0], cy: atom.xy[1], r: 23,
        'data-atom': atom.id, tabindex: '0', role: 'button',
        'aria-label': `${ELEMENTS[atom.element]}${atom.parentNumber ? ` · ${atom.parentNumber}` : ''}`,
      });
      hit.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          dispatch({ type: 'selectAtom', id: atom.id });
        }
      });
      hitLayer.append(hit);
    }
    structureSvg.append(hitLayer);
    $('structure').replaceChildren(structureSvg);
  }

  function updateHighlights(molecule, state) {
    const layer = structureSvg.querySelector('.selection-layer');
    layer.replaceChildren();
    const selection = stepSelection(molecule, state.stepIndex);
    const byId = new Map(molecule.atoms.map(atom => [atom.id, atom]));
    for (const [ids, className] of [
      [selection.primary, 'atom-highlight'],
      [selection.secondary, 'atom-secondary'],
      [[state.selectedAtomId], 'atom-selected'],
    ]) {
      for (const id of ids) {
        const atom = byId.get(id);
        if (!atom?.xy) continue;
        layer.append(svgElement('circle', { cx: atom.xy[0], cy: atom.xy[1], r: 20, class: className }));
      }
    }
    if (state.showNumbers) {
      for (const id of molecule.parent) {
        const atom = byId.get(id);
        const number = svgElement('text', {
          x: atom.xy[0] + 12, y: atom.xy[1] - 20, class: 'atom-number',
        });
        number.textContent = atom.parentNumber;
        layer.append(number);
      }
    }
  }

  function renderMolecule(molecule, state) {
    bilingual($('molecule-title'), molecule.name);
    bilingual($('family-tag'), molecule.family);
    $('molecule-formula').textContent = formatFormula(molecule.formula);
    $('condensed').textContent = molecule.condensed.replace(/([A-Za-z)])(\d+)/g, (_, prefix, digits) => prefix + formatFormula(digits));
    $('aliases').textContent = molecule.aliases.map(alias => `${alias.zh} / ${alias.en}`).join(' · ');
    bilingual($('lesson-note'), molecule.note);
    const legend = $('element-legend');
    legend.replaceChildren();
    const elements = [...new Set(molecule.atoms.map(atom => atom.element))];
    for (const symbol of elements) {
      const entry = element('span');
      const dot = element('i', 'element-dot');
      dot.style.background = elementColors[symbol];
      entry.append(dot, document.createTextNode(`${symbol} ${ELEMENTS[symbol]}`));
      legend.append(entry);
    }
    const geometry = $('geometry-info');
    geometry.hidden = !molecule.geometry;
    if (molecule.geometry) {
      const text = element('div');
      bilingual(text, molecule.geometry.label);
      text.append(element('span', '', `理想值 / Ideal · 模型角度 / Model: ${molecule.geometry.measured}°`));
      geometry.replaceChildren(element('strong', '', `${molecule.geometry.ideal}°`), text);
    }
    const isomerSwitch = $('isomer-switch');
    isomerSwitch.replaceChildren();
    isomerSwitch.hidden = !molecule.isomerFamily;
    if (molecule.isomerFamily) {
      const chapter = dataset.chapters.find(item => item.id === state.chapterId);
      for (const item of dataset.molecules.filter(m => m.isomerFamily === molecule.isomerFamily && chapter.moleculeIds.includes(m.id))) {
        const button = element('button');
        button.dataset.molecule = item.id;
        button.setAttribute('aria-pressed', String(item.id === molecule.id));
        const position = item.substitutionPositions?.join(',');
        bilingual(button, position
          ? { zh: `${position} 位`, en: `${position} positions` }
          : { zh: item.stereo === 'E' ? '反式 E' : '顺式 Z', en: item.stereo === 'E' ? 'trans / E' : 'cis / Z' });
        isomerSwitch.append(button);
      }
    }
    renderStructure(molecule);
    const steps = $('step-list');
    steps.replaceChildren();
    for (const [index, step] of molecule.steps.entries()) {
      const button = element('button', 'step-button');
      button.dataset.step = index;
      button.append(element('span', 'step-circle', String(index + 1)), bilingual(element('div', 'step-copy'), step.title));
      steps.append(button);
    }
    bilingual($('quiz-prompt'), molecule.quiz.prompt);
    const options = $('quiz-options');
    options.replaceChildren();
    for (const [index, option] of molecule.quiz.options.entries()) {
      const button = element('button', 'answer-option');
      button.dataset.answer = option.id;
      button.setAttribute('aria-pressed', 'false');
      button.append(element('span', 'answer-letter', String.fromCharCode(65 + index)), bilingual(element('div', 'option-copy'), option.text));
      options.append(button);
    }
  }

  function render(state, previous) {
    const molecule = activeMolecule(dataset, state);
    const chapterChanged = state.chapterId !== lastChapterId;
    const moleculeChanged = state.moleculeId !== lastMoleculeId;
    if (chapterChanged) {
      chapterSelect.value = state.chapterId;
      searchQuery = '';
      $('molecule-search').value = '';
      const chapter = dataset.chapters.find(item => item.id === state.chapterId);
      bilingual($('chapter-summary'), chapter.summary);
      $('chapter-tips').replaceChildren(...chapter.tips.map(tip => bilingual(element('p'), tip)));
    }
    if (chapterChanged || moleculeChanged) moleculeList(state);
    if (moleculeChanged || chapterChanged) renderMolecule(molecule, state);
    const step = molecule.steps[state.stepIndex];
    for (const button of document.querySelectorAll('.step-button')) {
      button.setAttribute('aria-current', Number(button.dataset.step) === state.stepIndex ? 'step' : 'false');
    }
    $('step-progress').textContent = `步骤 / STEP ${state.stepIndex + 1} OF ${molecule.steps.length}`;
    bilingual($('step-title'), step.title);
    bilingual($('step-text'), step.text);
    $('previous-step').disabled = state.stepIndex === 0;
    $('next-step').disabled = state.stepIndex === molecule.steps.length - 1;
    for (const [id, active] of [
      ['ballstick', state.representation === 'ballstick'], ['spacefill', state.representation === 'spacefill'],
      ['hydrogens-toggle', state.showHydrogens], ['numbers-toggle', state.showNumbers], ['spin-toggle', state.spinning],
    ]) $(id).setAttribute('aria-pressed', String(active));
    updateHighlights(molecule, state);
    if (moleculeChanged || chapterChanged || previous?.showHydrogens !== state.showHydrogens) {
      const atoms = molecule.atoms.filter(atom => state.showHydrogens || atom.element !== 'H');
      $('atom-list').replaceChildren(...atoms.map(atom => {
        const button = element('button', '', `${atom.element}${atom.parentNumber ? ` · ${atom.parentNumber}` : ''}`);
        button.dataset.atom = atom.id;
        button.setAttribute('aria-label', `${ELEMENTS[atom.element]}${atom.parentNumber ? ` · ${atom.parentNumber}` : ''} · ID ${atom.id}`);
        button.title = `${ELEMENTS[atom.element]} · ID ${atom.id}`;
        return button;
      }));
    }
    for (const button of $('atom-list').querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.atom) === state.selectedAtomId));
    }
    if (state.selectedAtomId === null) {
      bilingual($('atom-info'), { zh: '点击3D模型、二维结构或上方原子按钮，查看它的身份。', en: 'Select an atom in 3D, in the diagram, or using the buttons above.' });
    } else {
      const info = atomDetails(molecule, state.selectedAtomId);
      const zhGroups = info.groups.map(group => group.zh).join('、');
      const enGroups = info.groups.map(group => group.en).join(', ');
      const charge = info.atom.charge ? ` · 形式电荷 / Formal charge ${info.atom.charge > 0 ? '+' : ''}${info.atom.charge}` : '';
      bilingual($('atom-info'), {
        zh: `${info.label.zh}${zhGroups ? ` · ${zhGroups}` : ''}${charge}`,
        en: `${info.label.en}${enGroups ? ` · ${enGroups}` : ''} · Atom ID ${info.atom.id}`,
      });
    }
    for (const button of $('quiz-options').querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.answer === state.quizAnswer));
      button.disabled = state.quizSubmitted;
    }
    $('quiz-submit').disabled = state.quizAnswer === null || state.quizSubmitted;
    $('quiz-retry').hidden = !state.quizSubmitted;
    const feedback = $('quiz-feedback');
    feedback.replaceChildren();
    feedback.className = 'quiz-feedback';
    if (state.quizSubmitted) {
      const result = gradeAnswer(molecule.quiz, state.quizAnswer);
      feedback.classList.add(result.correct ? 'correct' : 'incorrect');
      feedback.append(bilingual(element('strong'), result.correct
        ? { zh: '答对了', en: 'Correct' }
        : { zh: '再想一想', en: 'Not quite' }));
      feedback.append(bilingual(element('p'), result.explanation));
      if (!result.correct) feedback.append(bilingual(element('p'), {
        zh: `正确答案：${result.correctOption.text.zh}`,
        en: `Correct answer: ${result.correctOption.text.en}`,
      }));
    }
    lastMoleculeId = state.moleculeId;
    lastChapterId = state.chapterId;
  }

  return { render, search(query, state) { searchQuery = query; moleculeList(state); } };
}

import { activeMolecule, displayedMolecule, atomDetails, searchMolecules, activitySteps, activityQuiz, activitySelection, availableReactions, activeReaction, drawingVisibility } from './lesson.js?v=20261012-oxygen-lessons';
import { formatFormula, gradeAnswer } from './quiz.js';
import { elementColors } from './viewer.js?v=20261012-oxygen-lessons';
import { pronunciationTokens, characterReadings } from './pronunciation.js?v=20261012-oxygen-lessons';

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
  let lastDisplayId = null;
  let lastActivityKey = null;
  let lastQuizKey = null;
  let searchQuery = '';
  $('course-count').textContent = `${dataset.chapters.length} 章节 / Chapters · ${dataset.molecules.length} 分子 / Molecules · ${(dataset.reactions || []).length} 反应 / Reactions`;
  $('footer-course-count').textContent = `中英对照 · ${dataset.molecules.length}个分子 · ${(dataset.reactions || []).length}条反应 / Bilingual molecular learning`;
  let structureSvg = null;
  let currentDepiction = null;
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

  function renderActivity(state) {
    const course = activeMolecule(dataset, state);
    const reactions = availableReactions(dataset, state);
    $('activity-drawing').disabled = !course.drawingFrames?.length;
    $('activity-reaction').disabled = reactions.length === 0;
    for (const activity of ['naming', 'drawing', 'reaction']) {
      $(`activity-${activity}`).setAttribute('aria-pressed', String(state.activity === activity));
    }
    const headings = {
      naming: { zh: '一步一步命名', en: 'BUILD THE NAME' },
      drawing: { zh: '从名称一步步画', en: 'DRAW FROM THE NAME' },
      reaction: { zh: '观察反应前后变化', en: 'COMPARE THE REACTION' },
    };
    const heading = $('activity-heading');
    heading.replaceChildren(document.createTextNode(headings[state.activity].zh), element('small', '', headings[state.activity].en));
    bilingual($('activity-intro'), {
      naming: { zh: '识别官能团、找母体、编号，再合成名称。', en: 'Identify the group, select the parent, number and assemble the name.' },
      drawing: { zh: `目标：${course.name.zh}。点一步添加结构；3D始终展示完整分子。`, en: `Target: ${course.name.en}. Add structure step by step; 3D always shows the complete molecule.` },
      reaction: { zh: '点步骤比较净变化；点参与物切换它的3D。不是分子动力学模拟。', en: 'Compare net changes step by step; choose a participant for its 3D model. This is not molecular dynamics.' },
    }[state.activity]);
    const controls = $('reaction-controls');
    controls.hidden = state.activity !== 'reaction';
    $('reaction-panel').hidden = state.activity !== 'reaction';
    const activityKey = `${state.moleculeId}:${state.activity}:${state.reactionId || ''}`;
    if (state.activity === 'reaction') {
      const reaction = activeReaction(dataset, state);
      if (activityKey !== lastActivityKey) {
        $('reaction-select').replaceChildren(...reactions.map(item => {
          const option = element('option', '', `${item.name.zh} / ${item.name.en}`);
          option.value = item.id;
          return option;
        }));
        $('participant-controls').replaceChildren(...reaction.participants.filter(part => part.moleculeId).map(part => {
          const model = dataset.molecules.find(molecule => molecule.id === part.moleculeId);
          const button = element('button');
          button.dataset.participant = part.id;
          const role = part.role === 'reactant' ? { zh: '反应物', en: 'Reactant' } : { zh: '产物', en: 'Product' };
          bilingual(button, { zh: `${role.zh}：${model.name.zh}`, en: `${role.en}: ${model.name.en}` });
          return button;
        }));
      }
      $('reaction-select').value = state.reactionId;
      for (const button of $('participant-controls').querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.participant === state.participantId));
      }
    }
    if (activityKey !== lastActivityKey) {
      $('step-list').replaceChildren(...activitySteps(dataset, state).map((step, index) => {
        const button = element('button', 'step-button');
        button.dataset.step = index;
        button.append(element('span', 'step-circle', String(index + 1)), bilingual(element('div', 'step-copy'), step.title));
        return button;
      }));
    }
    return activityKey;
  }

  function renderQuiz(state) {
    const quiz = activityQuiz(dataset, state);
    const key = state.activity === 'reaction' ? `reaction:${state.reactionId}` : `molecule:${state.moleculeId}`;
    if (key === lastQuizKey) return;
    const name = state.activity === 'reaction' ? activeReaction(dataset, state).name : activeMolecule(dataset, state).name;
    bilingual($('quiz-context'), { zh: `练习目标：${name.zh}`, en: `Practice target: ${name.en}` });
    bilingual($('quiz-prompt'), quiz.prompt);
    $('quiz-options').replaceChildren(...quiz.options.map((option, index) => {
      const button = element('button', 'answer-option');
      button.dataset.answer = option.id;
      button.setAttribute('aria-pressed', 'false');
      button.append(element('span', 'answer-letter', String.fromCharCode(65 + index)), bilingual(element('div', 'option-copy'), option.text));
      return button;
    }));
    lastQuizKey = key;
  }

  function renderStructure(molecule, state) {
    const mode = state.showHydrogens ? 'expanded' : 'skeletal';
    currentDepiction = molecule.depictions[mode];
    const parsed = new DOMParser().parseFromString(currentDepiction.svg, 'image/svg+xml');
    structureSvg = document.importNode(parsed.documentElement, true);
    structureSvg.style.width = `${currentDepiction.width}px`;
    structureSvg.style.height = `${currentDepiction.height}px`;
    structureSvg.setAttribute('role', 'group');
    structureSvg.setAttribute('aria-label', `${molecule.name.zh}二维结构 / ${molecule.name.en} 2D structure`);
    structureSvg.insertBefore(svgElement('g', { class: 'selection-layer' }), structureSvg.querySelector('.chemical-art'));
    structureSvg.append(svgElement('g', { class: 'number-layer' }));
    const hitLayer = svgElement('g', { class: 'hit-layer' });
    const points = currentDepiction.positions;
    const visibility = drawingVisibility(dataset, state);
    const visible = new Set(visibility.visibleAtoms);
    for (const node of structureSvg.querySelectorAll('[data-atom-label], [data-bond-atoms]')) {
      const ids = node.hasAttribute('data-bond-atoms')
        ? node.getAttribute('data-bond-atoms').split(' ').map(Number)
        : [Number(node.getAttribute('data-atom-label'))];
      node.style.display = ids.every(id => visible.has(id)) ? '' : 'none';
    }
    if (state.activity === 'drawing' && !visibility.complete) {
      for (const node of structureSvg.querySelectorAll('.chemical-art path:not([data-bond-atoms]):not([data-atom-label])')) {
        node.style.display = 'none';
      }
    }
    if (state.activity === 'drawing' && !activitySteps(dataset, state)[state.stepIndex].hydrogens) {
      for (const node of structureSvg.querySelectorAll('[data-atom-label]')) node.style.display = 'none';
      const labels = svgElement('g', { class: 'drawing-draft-labels' });
      for (const atom of molecule.atoms.filter(item => visible.has(item.id))) {
        const point = points[atom.id];
        const label = svgElement('text', {
          x: point[0], y: point[1], class: 'drawing-carbon-anchor',
          'data-drawing-label': atom.id, 'text-anchor': 'middle', 'dominant-baseline': 'central',
        });
        label.textContent = atom.element;
        label.style.fill = elementColors[atom.element];
        labels.append(label);
      }
      structureSvg.append(labels);
    }
    for (const atom of molecule.atoms.filter(item => points[item.id] && visible.has(item.id))) {
      const point = points[atom.id];
      const nearest = Math.min(...Object.entries(points).filter(([id]) => Number(id) !== atom.id).map(([, other]) => Math.hypot(point[0] - other[0], point[1] - other[1])));
      const hit = svgElement('circle', {
        class: 'atom-hit', cx: point[0], cy: point[1], r: Math.min(13, nearest * .4),
        'data-atom': atom.id, 'data-element': atom.element, tabindex: '0', role: 'button',
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
    $('structure').dataset.mode = mode;
    $('structure').scrollLeft = 0;
    $('structure-expanded').setAttribute('aria-pressed', String(state.showHydrogens));
    $('structure-skeletal').setAttribute('aria-pressed', String(!state.showHydrogens));
    bilingual($('structure-description'), state.showHydrogens
      ? { zh: '完整结构式：逐个显示C、H及其键。二维排布表示连接，不表示真实空间键角。', en: 'Displayed formula: every C, H and bond is shown. The 2D arrangement shows connectivity, not physical bond angles.' }
      : { zh: '骨架式：端点和转角可表示碳，碳上的H被省略；OH、NH等必要标签保留。', en: 'Skeletal formula: endpoints and corners can represent carbon; carbon-bound H atoms are omitted. Necessary OH and NH labels remain.' });
  }

  function updateHighlights(molecule, state) {
    const layer = structureSvg.querySelector('.selection-layer');
    layer.replaceChildren();
    const selection = activitySelection(dataset, state);
    const visible = new Set(drawingVisibility(dataset, state).visibleAtoms);
    const points = currentDepiction.positions;
    const numberLayer = structureSvg.querySelector('.number-layer');
    numberLayer.replaceChildren();
    for (const [ids, className] of [
      [selection.primary, 'atom-highlight'],
      [selection.secondary, 'atom-secondary'],
      [[state.selectedAtomId], 'atom-selected'],
    ]) {
      for (const id of ids) {
        const point = points[id];
        if (!point || !visible.has(id)) continue;
        layer.append(svgElement('circle', { cx: point[0], cy: point[1], r: 12, class: className, 'data-atom-highlight': id }));
      }
    }
    if (drawingVisibility(dataset, state).numbers) {
      for (const [index, id] of molecule.parent.entries()) {
        if (!visible.has(id)) continue;
        const point = currentDepiction.numberPositions[id];
        const number = svgElement('text', {
          x: point[0], y: point[1], class: 'atom-number',
          'text-anchor': 'middle', 'dominant-baseline': 'central',
        });
        number.textContent = index + 1;
        numberLayer.append(number);
      }
    }
  }

  function renderMolecule(molecule, state) {
    bilingual($('molecule-title'), molecule.name);
    const chineseName = $('molecule-title').querySelector('.zh');
    chineseName.setAttribute('aria-label', molecule.name.zh);
    chineseName.replaceChildren(...pronunciationTokens(molecule.name.zh).map(token => {
      if (!token.pinyin) return document.createTextNode(token.text);
      const ruby = element('ruby');
      ruby.append(document.createTextNode(token.text), element('rt', '', token.pinyin));
      return ruby;
    }));
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
    renderStructure(molecule, state);
  }

  function renderReaction(state, rebuild) {
    if (state.activity !== 'reaction') return;
    const reaction = activeReaction(dataset, state);
    if (rebuild) {
      bilingual($('reaction-title'), reaction.name);
      bilingual($('reaction-kind'), reaction.type);
      bilingual($('reaction-conditions'), reaction.conditions);
      bilingual($('reaction-note'), reaction.note);
      const sides = ['reactant', 'product'].map(role => reaction.participants.filter(part => part.role === role)
        .map(part => `${part.coefficient === 1 ? '' : part.coefficient}${formatFormula(part.auxiliary === 'water' ? part.formula : part.condensed)}`).join(' + '));
      const equation = `${sides[0]} ${reaction.reversible ? '⇌' : '→'} ${sides[1]}`;
      $('reaction-equation').textContent = equation;
      $('reaction-equation').setAttribute('aria-label', `${reaction.name.zh}配平方程 / ${reaction.name.en} balanced equation: ${equation}; ${reaction.reversible ? '可逆反应 / reversible reaction' : '生成 / produces'}`);
      const comparison = $('reaction-comparison');
      comparison.replaceChildren();
      for (const part of reaction.participants) {
        const card = element('section', 'reaction-species');
        card.dataset.reactionParticipant = part.id;
        const role = part.role === 'reactant' ? { zh: '反应物', en: 'Reactant' } : { zh: '产物', en: 'Product' };
        card.append(element('p', 'reaction-role', `${role.zh} / ${role.en}`), bilingual(element('h4'), part.name));
        if (part.moleculeId) {
          const model = dataset.molecules.find(entry => entry.id === part.moleculeId);
          const depiction = model.depictions[state.showHydrogens ? 'expanded' : 'skeletal'];
          const svg = document.importNode(new DOMParser().parseFromString(depiction.svg, 'image/svg+xml').documentElement, true);
          svg.style.width = `${depiction.width}px`;
          svg.style.height = `${depiction.height}px`;
          svg.insertBefore(svgElement('g', { class: 'reaction-selection-layer' }), svg.querySelector('.chemical-art'));
          const diagram = element('div', 'reaction-diagram');
          diagram.append(svg);
          const button = element('button', 'reaction-model-button');
          button.dataset.participant = part.id;
          bilingual(button, { zh: '查看这个分子的3D', en: 'Show this molecule in 3D' });
          card.append(diagram, element('p', 'reaction-formula', formatFormula(part.condensed)), button);
        } else {
          card.classList.add('reaction-auxiliary');
          card.append(element('p', 'auxiliary-symbol', formatFormula(part.condensed)), bilingual(element('p', 'bilingual-body'), part.auxiliary === 'water'
            ? { zh: '辅助结构：水，不计入课程分子数。', en: 'Water is an auxiliary structure, not a course molecule.' }
            : { zh: '当量符号，不是游离原子或3D物种。', en: 'An equivalent symbol, not a free atom or 3D species.' }));
        }
        comparison.append(card);
      }
      $('reaction-change-list').replaceChildren(...reaction.changes.map(change => {
        const before = change.from;
        const after = change.to;
        const text = change.kind === 'bond-order'
          ? { zh: `键级变化：${before.order} → ${after.order}`, en: `Bond-order change: ${before.order} → ${after.order}` }
          : change.kind === 'bond-cleavage'
            ? { zh: '净断键：反应物中标出的连接不再保留。', en: 'Net cleavage: the marked reactant connection is not retained.' }
            : { zh: '净成键：产物中形成标出的连接。', en: 'Net formation: the marked product connection is formed.' };
        return bilingual(element('p'), text);
      }));
      const mechanism = $('reaction-mechanism');
      mechanism.hidden = !reaction.mechanism?.length;
      $('reaction-mechanism-list').replaceChildren(...(reaction.mechanism || []).map(pair => bilingual(element('li', 'bilingual-body'), pair)));
    }
    const step = reaction.steps[state.stepIndex];
    for (const part of reaction.participants.filter(item => item.moleculeId)) {
      const card = $('reaction-comparison').querySelector(`[data-reaction-participant="${part.id}"]`);
      const model = dataset.molecules.find(entry => entry.id === part.moleculeId);
      const points = model.depictions[state.showHydrogens ? 'expanded' : 'skeletal'].positions;
      const layer = card.querySelector('.reaction-selection-layer');
      layer.replaceChildren();
      for (const node of card.querySelectorAll('[data-bond-atoms]')) {
        node.classList.remove('reaction-bond-change');
        const endpoints = node.getAttribute('data-bond-atoms').split(' ').map(Number);
        if (state.stepIndex > 0 && reaction.changes.some(change => [change.from, change.to].some(site =>
          site?.participant === part.id && site.atoms.every(id => endpoints.includes(id))))) {
          node.classList.add('reaction-bond-change');
        }
      }
      const selected = step.selections[part.id] || { highlight: [], secondary: [] };
      for (const [ids, className] of [[selected.highlight, 'reaction-highlight'], [selected.secondary, 'reaction-secondary']]) {
        for (const id of ids) {
          const point = points[id];
          if (point) layer.append(svgElement('circle', { cx: point[0], cy: point[1], r: 12, class: className }));
        }
      }
      card.dataset.selected = String(part.id === state.participantId);
      card.querySelector('button').setAttribute('aria-pressed', String(part.id === state.participantId));
    }
  }

  function render(state, previous) {
    const molecule = displayedMolecule(dataset, state);
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
    const activityKey = renderActivity(state);
    const activityChanged = activityKey !== lastActivityKey;
    const displayChanged = molecule.id !== lastDisplayId;
    if (displayChanged || moleculeChanged || chapterChanged) renderMolecule(molecule, state);
    else if (activityChanged || previous?.showHydrogens !== state.showHydrogens
      || (state.activity === 'drawing' && previous?.stepIndex !== state.stepIndex)) renderStructure(molecule, state);
    renderQuiz(state);
    renderReaction(state, activityChanged || previous?.showHydrogens !== state.showHydrogens);
    $('model-context').hidden = state.activity === 'naming';
    if (state.activity !== 'naming') bilingual($('model-context'), state.activity === 'drawing'
      ? { zh: '3D是完整目标分子；下方绘图草稿逐步添加。', en: '3D shows the complete target; the drawing draft below grows step by step.' }
      : { zh: `当前3D：${molecule.name.zh}；练习目标仍是所选反应。`, en: `Current 3D: ${molecule.name.en}; practice still targets the selected reaction.` });
    const visibility = drawingVisibility(dataset, state);
    const draft = state.activity === 'drawing';
    $('drawing-status').hidden = !draft;
    if (draft) bilingual($('drawing-status'), visibility.complete
      ? { zh: '结构绘制完成；可切换表示并核对原子与价态。', en: 'Drawing complete. Switch notation and check atoms and valence.' }
      : { zh: '绘图草稿，不是反应中间体。未画出的原子仍属于完整目标分子。', en: 'Drawing draft, not a reaction intermediate. Unshown atoms remain in the complete target molecule.' });
    $('condensed').hidden = draft && !visibility.complete;
    const steps = activitySteps(dataset, state);
    const step = steps[state.stepIndex];
    for (const button of document.querySelectorAll('.step-button')) {
      button.setAttribute('aria-current', Number(button.dataset.step) === state.stepIndex ? 'step' : 'false');
    }
    $('step-progress').textContent = `步骤 / STEP ${state.stepIndex + 1} OF ${steps.length}`;
    bilingual($('step-title'), step.title);
    bilingual($('step-text'), step.text);
    const readings = characterReadings([molecule.name.zh, molecule.family.zh, ...molecule.groups.map(group => group.name.zh), step.title.zh, step.text.zh].join(''));
    const readingLine = $('character-readings');
    readingLine.replaceChildren(element('strong', '', '字音提示 / Character readings '), ...readings.map(reading => element('span', '', `${reading.character}（${reading.pinyin}）`)));
    readingLine.hidden = readings.length === 0;
    $('previous-step').disabled = state.stepIndex === 0;
    $('next-step').disabled = state.stepIndex === steps.length - 1;
    for (const [id, active] of [
      ['ballstick', state.representation === 'ballstick'], ['spacefill', state.representation === 'spacefill'],
      ['hydrogens-toggle', state.showHydrogens], ['numbers-toggle', state.showNumbers], ['spin-toggle', state.spinning],
    ]) $(id).setAttribute('aria-pressed', String(active));
    updateHighlights(molecule, state);
    if (displayChanged || moleculeChanged || chapterChanged || activityChanged
      || previous?.showHydrogens !== state.showHydrogens || (draft && previous?.stepIndex !== state.stepIndex)) {
      const atoms = molecule.atoms.filter(atom => visibility.visibleAtoms.includes(atom.id));
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
      const result = gradeAnswer(activityQuiz(dataset, state), state.quizAnswer);
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
    lastDisplayId = molecule.id;
    lastActivityKey = activityKey;
  }

  return { render, search(query, state) { searchQuery = query; moleculeList(state); } };
}

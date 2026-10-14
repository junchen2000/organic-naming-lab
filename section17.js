import { formatFormula, gradeAnswer } from './quiz.js';

const modes = ['concepts', 'memory', 'naming', 'drawing', 'quiz'];
const localDefaults = { namingStep: 0, penIndex: 0, answer: null, submitted: false };

function lessonById(data, id) {
  const lesson = data.lessons.find(item => item.id === id);
  if (!lesson) throw new RangeError('Unknown Section1.7 lesson');
  return lesson;
}

export function activeLesson(data, state) {
  return lessonById(data, state.lessonId);
}

export function activeLayout(data, state) {
  const layout = activeLesson(data, state).layouts.find(item => item.id === state.layoutId);
  if (!layout) throw new RangeError('Unknown written structure format');
  return layout;
}

export function activeQuiz(data, state) {
  const quiz = data.quizzes.find(item => item.id === state.quizId);
  if (!quiz) throw new RangeError('Unknown Section1.7 question');
  return quiz;
}

export function createState(data) {
  return {
    mode: 'concepts', lessonId: data.lessons[0].id, layoutId: data.lessons[0].layouts[0].id,
    quizId: data.quizzes[0].id, showAnnotations: true, ...localDefaults,
  };
}

export function transition(state, action, data) {
  switch (action?.type) {
    case 'mode':
      if (!modes.includes(action.value)) throw new RangeError('Unknown learning mode');
      return action.value === state.mode ? state : { ...state, ...localDefaults, mode: action.value };
    case 'lesson': {
      const lesson = lessonById(data, action.id);
      return { ...state, ...localDefaults, lessonId: lesson.id, layoutId: lesson.layouts[0].id };
    }
    case 'layout':
      if (!activeLesson(data, state).layouts.some(layout => layout.id === action.id)) throw new RangeError('Unknown written structure format');
      return { ...state, ...localDefaults, layoutId: action.id };
    case 'pen':
      if (!Number.isInteger(action.index)) throw new RangeError('Pen index must be an integer');
      return { ...state, penIndex: Math.max(0, Math.min(action.index, activeLayout(data, state).frames.length - 1)) };
    case 'naming':
      if (!Number.isInteger(action.index)) throw new RangeError('Naming index must be an integer');
      return { ...state, namingStep: Math.max(0, Math.min(action.index, activeLesson(data, state).namingSteps.length - 1)) };
    case 'annotations':
      if (typeof action.value !== 'boolean') throw new RangeError('Annotations require a boolean');
      return { ...state, showAnnotations: action.value };
    case 'quiz':
      if (!data.quizzes.some(quiz => quiz.id === action.id)) throw new RangeError('Unknown Section1.7 question');
      return { ...state, ...localDefaults, quizId: action.id };
    case 'answer':
      if (!activeQuiz(data, state).options.some(option => option.id === action.id)) throw new RangeError('Unknown answer');
      return state.submitted ? state : { ...state, answer: action.id };
    case 'submit':
      return state.answer === null ? state : { ...state, submitted: true };
    case 'retry':
      return { ...state, answer: null, submitted: false };
    default:
      throw new RangeError('Unknown Section1.7 action');
  }
}

export function diagramState(data, state) {
  const question = state.mode === 'quiz' ? activeQuiz(data, state) : null;
  const lesson = question?.lessonId ? lessonById(data, question.lessonId) : activeLesson(data, state);
  const layout = question?.lessonId ? lesson.layouts.find(item => item.id === (question.layoutId || lesson.layouts[0].id)) : activeLayout(data, state);
  if (state.mode === 'drawing') {
    const frame = layout.frames[state.penIndex];
    return { lesson, layout, ...frame, highlightAtoms: [], showNumbers: false, revealName: true };
  }
  const step = state.mode === 'naming' ? lesson.namingSteps[state.namingStep] : null;
  return {
    lesson, layout, visibleTokens: layout.tokens.map(token => token.id), visibleStrokes: layout.strokes.map(stroke => stroke.id),
    action: null, complete: true,
    highlightAtoms: state.showAnnotations && step ? step.atoms : [],
    showNumbers: Boolean(state.showAnnotations && step?.showNumbers),
    revealName: state.mode === 'naming' ? Boolean(step.revealName) : state.mode !== 'quiz',
  };
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function bilingual(element, value) {
  const zh = node('span', 'zh', value.zh);
  const en = node('span', 'en', value.en);
  zh.lang = 'zh-CN';
  en.lang = 'en';
  element.replaceChildren(zh, en);
  return element;
}

function svgNode(tag, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function drawDiagram(container, view, label) {
  const { layout } = view;
  const parsed = new DOMParser().parseFromString(layout.svg, 'image/svg+xml');
  const svg = document.importNode(parsed.documentElement, true);
  svg.style.width = `${layout.width}px`;
  svg.style.maxWidth = layout.width <= 480 ? '100%' : 'none';
  svg.style.height = layout.width <= 480 ? 'auto' : `${layout.height}px`;
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  const visibleTokens = new Set(view.visibleTokens);
  const visibleStrokes = new Set(view.visibleStrokes);
  for (const element of svg.querySelectorAll('[data-token]')) {
    const id = element.getAttribute('data-token');
    element.style.display = visibleTokens.has(id) ? '' : 'none';
    element.classList.toggle('current-token', view.action?.kind === 'token' && view.action.id === id);
  }
  for (const element of svg.querySelectorAll('[data-stroke]')) {
    const id = element.getAttribute('data-stroke');
    element.style.display = visibleStrokes.has(id) ? '' : 'none';
    element.classList.toggle('current-stroke', view.action?.kind === 'stroke' && view.action.id === id);
  }
  const annotations = svgNode('g', { class: 'annotations' });
  const points = layout.atomPositions;
  const used = new Set();
  for (const id of view.highlightAtoms || []) {
    const point = points[id];
    if (!point || used.has(point.join(':'))) continue;
    used.add(point.join(':'));
    annotations.append(svgNode('circle', { cx: point[0], cy: point[1], r: 17, class: 'annotation-circle' }));
  }
  if (view.showNumbers) {
    for (const [index, id] of view.lesson.parent.entries()) {
      const point = points[id];
      const text = svgNode('text', { x: point[0], y: point[1] + 28, class: 'parent-number', 'text-anchor': 'middle' });
      text.textContent = index + 1;
      annotations.append(text);
    }
  }
  svg.append(annotations);
  const scrollLeft = container.scrollLeft;
  container.replaceChildren(svg);
  container.scrollLeft = view.action?.kind === 'start' ? 0 : scrollLeft;
  const current = svg.querySelector('.current-token, .current-stroke');
  const targets = current ? [current] : [...svg.querySelectorAll('.annotation-circle')];
  if (targets.length && container.scrollWidth > container.clientWidth) {
    const bounds = targets.map(target => target.getBoundingClientRect());
    const min = Math.min(...bounds.map(box => box.left));
    const max = Math.max(...bounds.map(box => box.right));
    const target = max - min <= container.clientWidth - 24 ? { left: min, right: max } : bounds[0];
    const left = container.getBoundingClientRect().left + container.clientLeft;
    const right = left + container.clientWidth;
    if (target.left < left + 12) container.scrollLeft -= left + 12 - target.left;
    else if (target.right > right - 12) container.scrollLeft += target.right - right + 12;
  }
}

export function penCopy(view) {
  const { action, layout } = view;
  if (action.kind === 'start') return {
    title: { zh: '从空白开始', en: 'Start with blank paper' },
    text: { zh: '先拆名称，再按教材表示写。每次只添加一个原子或简写符号，或者一根键线。', en: 'Read the name first. Each pen action adds one atom or condensed label, or one physical bond line.' },
  };
  if (action.kind === 'review') return {
    title: { zh: '核对结构，不再添笔', en: 'Review without adding a pen action' },
    text: view.lesson.review,
  };
  if (action.kind === 'token') {
    const token = layout.tokens.find(item => item.id === action.id);
    return {
      title: { zh: `写出 ${token.display}`, en: `Write ${token.display}` },
      text: token.hydrogenOn
        ? { zh: '只写这个H，下一笔再连接；不要把它当成新的母体碳。', en: 'Write this H first, then connect it; it does not add a parent carbon.' }
        : { zh: `只写${token.display}，连接线留到后续笔画。${token.label === 'COOH' ? 'COOH包含一个碳和两个氧，羧基碳必须计入母体。' : '简写中的氢数与最终价态对应；未完成图仍是草稿。'}`, en: `Write ${token.display} before its connecting line. ${token.label === 'COOH' ? 'COOH contains one carbon and two oxygens; count the carboxyl carbon.' : 'The condensed H count describes the target structure; unfinished drawings are drafts.'}` },
    };
  }
  const stroke = layout.strokes.find(item => item.id === action.id);
  if (stroke.kind === 'circle') return {
    title: { zh: '画苯环内的圆圈', en: 'Draw the aromatic circle' },
    text: { zh: '圆圈表示整个苯环的离域芳香结构，不是一条额外化学键；六边形各顶点仍各代表一个碳。', en: 'The circle represents aromatic delocalization across the ring, not an extra chemical bond. Each hexagon vertex still represents one carbon.' },
  };
  const siblings = layout.strokes.filter(item => item.bondId === stroke.bondId);
  return {
    title: { zh: siblings.length > 1 ? `画第${stroke.line}根键线` : '画一根连接线', en: siblings.length > 1 ? `Draw bond line ${stroke.line} of ${siblings.length}` : 'Draw one bond line' },
    text: { zh: siblings.length > 1 ? `目标键有${siblings.length}根线，这一笔只增加第${stroke.line}根。已经写出的线保持原位，书写顺序不是反应机理。` : '连接已经写出的两个位置，只增加这一根线；核对它接在正确的碳或氧上。', en: siblings.length > 1 ? `Add only line ${stroke.line} of ${siblings.length}. Existing lines stay fixed; this is writing order, not a reaction mechanism.` : 'Connect the two written positions using just this line. Check that it joins the intended carbon or oxygen.' },
  };
}

async function boot() {
  const $ = id => document.getElementById(id);
  const response = await fetch('./assets/section17.json?v=20261013-textbook');
  if (!response.ok) throw new Error(`Course data could not load (${response.status})`);
  const data = await response.json();
  let state = createState(data);
  let lastLesson = null;
  let lastQuiz = null;

  $('source-status').textContent = data.sourceStatus.zh;
  for (const concept of data.concepts) {
    const card = node('article', 'concept-card');
    card.append(bilingual(node('h2'), concept.title), bilingual(node('p', 'bilingual'), concept.text));
    if (concept.lessonId) {
      const lesson = lessonById(data, concept.lessonId);
      const layout = lesson.layouts[0];
      const diagram = node('div', 'mini-diagram');
      drawDiagram(diagram, { lesson, layout, visibleTokens: layout.tokens.map(token => token.id), visibleStrokes: layout.strokes.map(stroke => stroke.id), highlightAtoms: [], showNumbers: false }, '概念示意结构 / Concept structure');
      card.append(diagram);
    }
    $('concepts-panel').append(card);
  }
  for (const [index, memory] of data.memoryCards.entries()) {
    const card = node('article', 'memory-card');
    const button = bilingual(node('button'), memory.question);
    button.dataset.memory = index;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `memory-answer-${index}`);
    const answer = bilingual(node('div', 'memory-answer'), memory.answer);
    answer.id = `memory-answer-${index}`;
    answer.hidden = true;
    button.addEventListener('click', () => {
      answer.hidden = !answer.hidden;
      button.setAttribute('aria-expanded', String(!answer.hidden));
    });
    card.append(button, answer);
    $('memory-panel').append(card);
  }
  for (const [index, lesson] of data.lessons.entries()) {
    const option = node('option', '', `${index + 1}. ${lesson.topic.zh} / ${lesson.topic.en}`);
    option.value = lesson.id;
    $('lesson-select').append(option);
  }
  for (const [index, quiz] of data.quizzes.entries()) {
    const option = node('option', '', `${index + 1}. ${quiz.title.zh} / ${quiz.title.en}`);
    option.value = quiz.id;
    $('quiz-select').append(option);
  }
  for (const source of data.sources) {
    if (source.url) {
      const url = new URL(source.url);
      if (url.protocol !== 'https:') throw new Error('Source links must use HTTPS');
      const link = node('a', '', source.title);
      link.href = url.href;
      link.rel = 'noopener noreferrer';
      $('sources').append(link);
    } else $('sources').append(node('span', '', source.title));
  }

  function render() {
    for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
    $('concepts-panel').hidden = state.mode !== 'concepts';
    $('memory-panel').hidden = state.mode !== 'memory';
    $('lesson-panel').hidden = !['naming', 'drawing'].includes(state.mode);
    $('quiz-panel').hidden = state.mode !== 'quiz';
    if (['naming', 'drawing'].includes(state.mode)) {
      const lesson = activeLesson(data, state);
      const view = diagramState(data, state);
      const drawing = state.mode === 'drawing';
      for (const [index, item] of data.lessons.entries()) {
        const category = item.family.includes('ester') ? { zh: '酯结构', en: 'Ester structure' } : { zh: '羧酸结构', en: 'Acid structure' };
        const label = drawing ? item.name : category;
        $('lesson-select').options[index].textContent = `${index + 1}. ${label.zh} / ${label.en}`;
      }
      $('lesson-select').value = state.lessonId;
      if (lastLesson !== lesson.id) {
        $('layout-select').replaceChildren(...lesson.layouts.map(layout => {
          const option = node('option', '', `${layout.name.zh} / ${layout.name.en}`);
          option.value = layout.id;
          return option;
        }));
        lastLesson = lesson.id;
        $('paper').scrollLeft = 0;
      }
      $('layout-select').value = state.layoutId;
      $('layout-select').parentElement.hidden = lesson.layouts.length === 1;
      $('lesson-reference').textContent = drawing || view.revealName ? lesson.reference
        : `教材例题 ${data.lessons.indexOf(lesson) + 1} · 先看结构，最后核对题源 / Textbook example; source shown after naming`;
      const guide = drawing ? lesson.namingSteps : lesson.namingSteps.slice(0, state.namingStep + 1);
      $('lesson-guide').replaceChildren(...guide.map(step => bilingual(node('p', 'guide-step'), step.text)));
      bilingual($('lesson-title'), drawing ? lesson.name : { zh: '先读结构，暂不揭晓名称', en: 'Read the structure before revealing its name' });
      $('name-breakdown').hidden = !drawing;
      if (drawing) bilingual($('name-breakdown'), lesson.breakdown);
      $('draft-note').hidden = !drawing || view.complete;
      $('annotations-toggle').hidden = drawing;
      $('annotations-toggle').setAttribute('aria-pressed', String(state.showAnnotations));
      drawDiagram($('paper'), view, drawing ? '按名称绘制的书面结构 / Written structure from a name' : '待命名的书面结构 / Structure to name');
      $('pen-controls').hidden = !drawing;
      $('naming-controls').hidden = drawing;
      if (drawing) {
        const copy = penCopy(view);
        $('action-progress').textContent = `已画 ${view.penNumber} / ${view.layout.frames.at(-1).penNumber} 笔 · PEN ACTIONS`;
        bilingual($('action-title'), copy.title);
        bilingual($('action-text'), copy.text);
        $('pen-previous').disabled = state.penIndex === 0;
        $('pen-next').disabled = view.complete;
        $('pen-next').replaceChildren(document.createTextNode(state.penIndex === view.layout.frames.length - 2 ? '核对结构' : '下一笔'), node('span', '', state.penIndex === view.layout.frames.length - 2 ? 'Review structure' : 'Next pen →'));
      } else {
        const step = lesson.namingSteps[state.namingStep];
        $('action-progress').textContent = `命名步骤 ${state.namingStep + 1} / ${lesson.namingSteps.length} · NAMING STEP`;
        bilingual($('action-title'), step.title);
        bilingual($('action-text'), step.text);
        $('naming-previous').disabled = state.namingStep === 0;
        $('naming-next').disabled = state.namingStep === lesson.namingSteps.length - 1;
      }
      $('lesson-answer').hidden = !view.revealName || (drawing && !view.complete);
      $('lesson-answer').textContent = `${lesson.name.zh} / ${lesson.name.en}${lesson.aliases?.length ? ` · ${lesson.aliases.join(' / ')}` : ''}`;
      $('formula-check').hidden = drawing ? !view.complete : !view.revealName;
      $('formula-check').textContent = `母体 ${lesson.chemistry.parentCount} C · 全分子 ${lesson.chemistry.carbonCount} C · ${formatFormula(lesson.chemistry.formula)}`;
    }
    if (state.mode === 'quiz') {
      const quiz = activeQuiz(data, state);
      $('quiz-select').value = quiz.id;
      $('quiz-reference').textContent = quiz.reference;
      bilingual($('quiz-prompt'), quiz.prompt);
      $('quiz-paper').hidden = !quiz.lessonId;
      if (quiz.lessonId) drawDiagram($('quiz-paper'), diagramState(data, state), '练习结构图 / Question structure');
      if (lastQuiz !== quiz.id) {
        $('quiz-options').replaceChildren(...quiz.options.map(option => {
          const button = bilingual(node('button'), option.text);
          button.dataset.answer = option.id;
          return button;
        }));
        lastQuiz = quiz.id;
      }
      for (const button of $('quiz-options').querySelectorAll('button')) {
        button.setAttribute('aria-pressed', String(button.dataset.answer === state.answer));
        button.disabled = state.submitted;
      }
      $('quiz-submit').disabled = state.answer === null || state.submitted;
      $('quiz-retry').hidden = !state.submitted;
      $('quiz-feedback').replaceChildren();
      $('quiz-feedback').className = 'quiz-feedback';
      if (state.submitted) {
        const result = gradeAnswer(quiz, state.answer);
        $('quiz-feedback').classList.add(result.correct ? 'correct' : 'incorrect');
        $('quiz-feedback').append(node('strong', '', result.correct ? '答对了 / Correct' : '再核对一下 / Check again'),
          bilingual(node('p'), quiz.explanation), bilingual(node('p'), { zh: `正确答案：${result.correctOption.text.zh}`, en: `Correct answer: ${result.correctOption.text.en}` }));
      }
    }
  }

  function dispatch(action) {
    state = transition(state, action, data);
    render();
  }
  for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => dispatch({ type: 'mode', value: button.dataset.mode }));
  $('lesson-select').addEventListener('change', event => dispatch({ type: 'lesson', id: event.target.value }));
  $('layout-select').addEventListener('change', event => dispatch({ type: 'layout', id: event.target.value }));
  $('pen-previous').addEventListener('click', () => dispatch({ type: 'pen', index: state.penIndex - 1 }));
  $('pen-next').addEventListener('click', () => dispatch({ type: 'pen', index: state.penIndex + 1 }));
  $('pen-restart').addEventListener('click', () => dispatch({ type: 'pen', index: 0 }));
  $('naming-previous').addEventListener('click', () => dispatch({ type: 'naming', index: state.namingStep - 1 }));
  $('naming-next').addEventListener('click', () => dispatch({ type: 'naming', index: state.namingStep + 1 }));
  $('annotations-toggle').addEventListener('click', () => dispatch({ type: 'annotations', value: !state.showAnnotations }));
  $('quiz-select').addEventListener('change', event => dispatch({ type: 'quiz', id: event.target.value }));
  $('quiz-options').addEventListener('click', event => {
    const button = event.target.closest('[data-answer]');
    if (button && !button.disabled) dispatch({ type: 'answer', id: button.dataset.answer });
  });
  $('quiz-submit').addEventListener('click', () => dispatch({ type: 'submit' }));
  $('quiz-retry').addEventListener('click', () => dispatch({ type: 'retry' }));
  render();
  document.body.dataset.ready = 'true';
}

if (typeof document !== 'undefined' && document.getElementById('section17-root')) {
  boot().catch(error => {
    const message = document.getElementById('load-error');
    message.hidden = false;
    message.textContent = `1.7课程未能载入 / The course could not load: ${error.message}`;
    document.body.dataset.ready = 'error';
  });
}

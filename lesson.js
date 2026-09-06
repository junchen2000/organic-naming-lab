const localDefaults = {
  stepIndex: 0,
  selectedAtomId: null,
  quizAnswer: null,
  quizSubmitted: false,
};

const elementNames = {
  H: { zh: '氢', en: 'Hydrogen' },
  C: { zh: '碳', en: 'Carbon' },
  N: { zh: '氮', en: 'Nitrogen' },
  O: { zh: '氧', en: 'Oxygen' },
  F: { zh: '氟', en: 'Fluorine' },
  Cl: { zh: '氯', en: 'Chlorine' },
  Br: { zh: '溴', en: 'Bromine' },
  I: { zh: '碘', en: 'Iodine' },
};

function chapterById(dataset, id) {
  const chapter = dataset.chapters.find((entry) => entry.id === id);
  if (!chapter) throw new RangeError('Unknown chapter');
  return chapter;
}

function atomById(molecule, id) {
  const atom = molecule.atoms.find((entry) => entry.id === id);
  if (!atom) throw new RangeError('Unknown atom');
  return atom;
}

function booleanValue(action) {
  if (typeof action.value !== 'boolean') {
    throw new RangeError(`${action.type} requires a boolean`);
  }
  return action.value;
}

export function createState(dataset) {
  const chapter = dataset.chapters[0];
  return {
    chapterId: chapter.id,
    moleculeId: chapter.moleculeIds[0],
    ...localDefaults,
    showHydrogens: true,
    showNumbers: false,
    representation: 'ballstick',
    spinning: false,
  };
}

export function activeMolecule(dataset, state) {
  return dataset.molecules.find((molecule) => molecule.id === state.moleculeId);
}

export function transition(state, action, dataset) {
  switch (action?.type) {
    case 'chapter': {
      const chapter = chapterById(dataset, action.id);
      return { ...state, ...localDefaults, chapterId: chapter.id, moleculeId: chapter.moleculeIds[0] };
    }
    case 'molecule': {
      const chapter = chapterById(dataset, state.chapterId);
      if (!chapter.moleculeIds.includes(action.id)) {
        throw new RangeError('Molecule is not in current chapter');
      }
      return { ...state, ...localDefaults, moleculeId: action.id };
    }
    case 'step': {
      if (!Number.isInteger(action.index)) throw new RangeError('Step index must be an integer');
      const molecule = activeMolecule(dataset, state);
      const stepIndex = Math.max(0, Math.min(action.index, molecule.steps.length - 1));
      return { ...state, stepIndex, selectedAtomId: null };
    }
    case 'selectAtom':
      if (action.id !== null) atomById(activeMolecule(dataset, state), action.id);
      return { ...state, selectedAtomId: action.id };
    case 'hydrogens': {
      const showHydrogens = booleanValue(action);
      let selectedAtomId = state.selectedAtomId;
      if (!showHydrogens && selectedAtomId !== null
          && atomById(activeMolecule(dataset, state), selectedAtomId).element === 'H') {
        selectedAtomId = null;
      }
      return { ...state, showHydrogens, selectedAtomId };
    }
    case 'numbers':
      return { ...state, showNumbers: booleanValue(action) };
    case 'representation':
      if (action.value !== 'ballstick' && action.value !== 'spacefill') {
        throw new RangeError('Unknown representation');
      }
      return { ...state, representation: action.value };
    case 'spin':
      return { ...state, spinning: booleanValue(action) };
    case 'answer': {
      const quiz = activeMolecule(dataset, state).quiz;
      if (!quiz.options.some((option) => option.id === action.id)) {
        throw new RangeError('Unknown quiz option');
      }
      return state.quizSubmitted ? state : { ...state, quizAnswer: action.id };
    }
    case 'submit':
      return state.quizAnswer === null ? state : { ...state, quizSubmitted: true };
    case 'retry':
      return { ...state, quizAnswer: null, quizSubmitted: false };
    default:
      throw new RangeError('Unknown action');
  }
}

export function stepSelection(molecule, stepIndex) {
  if (!Number.isInteger(stepIndex) || stepIndex < 0 || stepIndex >= molecule.steps.length) {
    throw new RangeError('Invalid step index');
  }
  const step = molecule.steps[stepIndex];
  const primary = new Set(step.highlight);
  const secondary = [...new Set(step.secondary)].filter((id) => !primary.has(id));
  return { primary: [...primary], secondary };
}

export function atomDetails(molecule, atomId) {
  const atom = atomById(molecule, atomId);
  if (!Object.hasOwn(elementNames, atom.element)) throw new RangeError('Unknown element');
  const element = { ...elementNames[atom.element] };
  const parentNumber = atom.parentNumber;
  const label = parentNumber === null
    ? { zh: `${element.zh}原子`, en: `${element.en} atom` }
    : { zh: `第${parentNumber}号${element.zh}`, en: `${element.en} ${parentNumber}` };
  return {
    atom,
    element,
    parentNumber,
    groups: molecule.groups.filter((group) => group.atoms.includes(atomId)).map((group) => group.name),
    label,
  };
}

export function searchMolecules(dataset, chapterId, query) {
  const chapter = chapterById(dataset, chapterId);
  const normalize = value => value.toLowerCase().replace(/[₀₁₂₃₄₅₆₇₈₉]/g, digit => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(digit)));
  const needle = normalize(query.trim());
  const molecules = new Map(dataset.molecules.map((molecule) => [molecule.id, molecule]));
  return chapter.moleculeIds.map((id) => molecules.get(id)).filter((molecule) =>
    [molecule.name.zh, molecule.name.en, ...molecule.aliases.flatMap(alias => [alias.zh, alias.en]), molecule.formula]
      .some((value) => normalize(value).includes(needle)));
}

export function validateViewerMapping(molecule, viewerAtoms) {
  if (!Array.isArray(viewerAtoms) || viewerAtoms.length !== molecule.atoms.length) {
    throw new RangeError('Viewer atom count mismatch');
  }

  // Viewer selection order is arbitrary; only the recorded index establishes identity.
  const viewerByIndex = new Map();
  for (const atom of viewerAtoms) {
    if (!Number.isInteger(atom?.index) || atom.index < 0 || viewerByIndex.has(atom.index)) {
      throw new RangeError('Invalid or duplicate viewer index');
    }
    viewerByIndex.set(atom.index, atom);
  }

  const mapping = new Map();
  for (const atom of molecule.atoms) {
    const viewer = viewerByIndex.get(atom.index);
    if (!viewer) throw new RangeError(`Missing viewer index ${atom.index}`);
    if (viewer.elem !== atom.element) throw new RangeError(`Element mismatch at index ${atom.index}`);
    for (const [axis, coordinate] of ['x', 'y', 'z'].entries()) {
      const value = viewer[coordinate];
      const expected = atom.xyz[axis];
      // Keep the 0.001 boundary inclusive despite binary floating-point roundoff.
      const roundoff = Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(expected));
      if (!Number.isFinite(value) || Math.abs(value - expected) > 0.001 + roundoff) {
        throw new RangeError(`Coordinate mismatch at index ${atom.index}`);
      }
    }
    mapping.set(atom.id, atom.index);
  }

  // Check each endpoint, not just edge counts, to detect rewiring and one-sided bonds.
  const expectedBonds = new Map(molecule.atoms.map((atom) => [atom.index, new Map()]));
  for (const bond of molecule.bonds) {
    const a = mapping.get(bond.a);
    const b = mapping.get(bond.b);
    expectedBonds.get(a).set(b, bond);
    expectedBonds.get(b).set(a, bond);
  }

  const actualBonds = new Map();
  for (const [index, expected] of expectedBonds) {
    const viewer = viewerByIndex.get(index);
    if (!Array.isArray(viewer.bonds) || !Array.isArray(viewer.bondOrder)
        || viewer.bonds.length !== viewer.bondOrder.length || viewer.bonds.length !== expected.size) {
      throw new RangeError(`Bond connectivity mismatch at index ${index}`);
    }
    const actual = new Map();
    for (let i = 0; i < viewer.bonds.length; i += 1) {
      const neighbor = viewer.bonds[i];
      const bond = expected.get(neighbor);
      if (!bond || actual.has(neighbor)) {
        throw new RangeError(`Bond connectivity mismatch at index ${index}`);
      }
      const order = viewer.bondOrder[i];
      // SDF/viewer round-trips may Kekulize an aromatic bond, but not a nonaromatic one.
      if (!Number.isFinite(order)
          || !(order === bond.order || (bond.aromatic && (order === 1 || order === 2)))) {
        throw new RangeError(`Bond order mismatch at index ${index}`);
      }
      actual.set(neighbor, order);
    }
    actualBonds.set(index, actual);
  }

  for (const [index, bonds] of actualBonds) {
    for (const [neighbor, order] of bonds) {
      if (actualBonds.get(neighbor)?.get(index) !== order) {
        throw new RangeError(`Inconsistent bond orders at index ${index}`);
      }
    }
  }
  return mapping;
}

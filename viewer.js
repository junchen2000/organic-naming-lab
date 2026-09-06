import { stepSelection, validateViewerMapping } from './lesson.js';

export const elementColors = {
  C: '#3e4b52', H: '#e5e8e6', N: '#3c6ecd', O: '#d75151',
  F: '#7fba55', Cl: '#65a649', Br: '#a1583e', I: '#906aa9',
};

export function createMolecularViewer(container, onSelect, onUnavailable) {
  let viewer = null;
  let current = null;
  let mapping = new Map();
  let initialView = null;
  let available = false;
  try {
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!context) throw new Error('WebGL is not available');
    viewer = window.$3Dmol.createViewer(container, {
      backgroundColor: '#fafcf7', backgroundAlpha: 0,
      antialias: true, disableFog: true, minimumZoomToDistance: 1.6,
    });
    viewer.setProjection('orthographic');
    available = true;
    container.dataset.status = 'ready';
  } catch {
    container.dataset.status = 'unavailable';
    onUnavailable();
  }
  const observer = new ResizeObserver(() => {
    if (viewer && available) viewer.resize();
  });
  observer.observe(container);

  function load(molecule) {
    current = molecule;
    container.dataset.molecule = molecule.id;
    if (!available) return;
    try {
      viewer.spin(false);
      viewer.removeAllModels();
      viewer.removeAllLabels();
      viewer.removeAllShapes();
      const model = viewer.addModel(molecule.sdf, 'sdf', { keepH: true });
      mapping = validateViewerMapping(molecule, model.selectedAtoms({}));
      viewer.setStyle({}, { sphere: { scale: .24 }, stick: { radius: .12, singleBonds: false } });
      viewer.zoomTo();
      viewer.zoom(.9);
      viewer.rotate(16, 'x');
      viewer.rotate(-12, 'y');
      initialView = viewer.getView();
      container.dataset.status = 'ready';
    } catch (error) {
      container.dataset.status = 'unavailable';
      container.dataset.failure = 'model-mapping';
      viewer.removeAllModels();
      viewer.render();
      available = false;
      onUnavailable(error);
    }
  }

  function update(state) {
    if (!available || !current) return;
    const molecule = current;
    const atomsById = new Map(molecule.atoms.map(atom => [atom.id, atom]));
    const colors = atom => elementColors[atom.elem] || '#869480';
    const space = state.representation === 'spacefill';
    viewer.setStyle({}, space
      ? { sphere: { scale: .87, colorfunc: colors } }
      : { sphere: { scale: .24, colorfunc: colors }, stick: { radius: .115, colorfunc: colors, singleBonds: false } });
    if (!state.showHydrogens) viewer.setStyle({ elem: 'H' }, {});
    viewer.setClickable({}, false);
    viewer.setClickable(state.showHydrogens ? {} : { not: { elem: 'H' } }, true, atom => {
      const selected = molecule.atoms.find(item => item.index === atom.index);
      if (selected) onSelect(selected.id);
    });
    viewer.removeAllLabels();
    viewer.removeAllShapes();
    const selected = stepSelection(molecule, state.stepIndex);
    const addHalo = (id, color, selection = false) => {
      const atom = atomsById.get(id);
      if (!atom || (!state.showHydrogens && atom.element === 'H')) return;
      const [x, y, z] = atom.xyz;
      viewer.addSphere({
        center: { x, y, z }, radius: space ? 1.7 : (selection ? .59 : .51),
        color, opacity: selection ? .25 : .15, wireframe: false,
      });
    };
    selected.primary.forEach(id => addHalo(id, '#368fc4'));
    selected.secondary.forEach(id => addHalo(id, '#d38a4c'));
    if (state.selectedAtomId !== null) addHalo(state.selectedAtomId, '#6fa041', true);
    if (state.showNumbers) {
      molecule.parent.forEach((id, index) => {
        const atom = atomsById.get(id);
        const [x, y, z] = atom.xyz;
        viewer.addLabel(String(index + 1), {
          position: { x, y, z }, fontSize: 14, fontColor: '#195a83',
          backgroundColor: '#f4fbff', backgroundOpacity: .95, borderRadius: 4,
          padding: 3, inFront: true, showBackground: true,
        }, undefined, true);
      });
    }
    if (state.selectedAtomId !== null && !state.showNumbers) {
      const atom = atomsById.get(state.selectedAtomId);
      const [x, y, z] = atom.xyz;
      viewer.addLabel(atom.element + (atom.parentNumber ? ` ${atom.parentNumber}` : ''), {
        position: { x, y, z }, fontSize: 15, fontColor: '#2a5131', backgroundColor: '#f7fff0',
        backgroundOpacity: .95, borderRadius: 4, padding: 4, inFront: true,
      }, undefined, true);
    }
    if (molecule.geometry && state.stepIndex === 0 && state.showHydrogens) {
      const [a, center, b] = molecule.geometry.atoms.map(id => atomsById.get(id));
      const point = atom => ({ x: atom.xyz[0], y: atom.xyz[1], z: atom.xyz[2] });
      viewer.addLine({ start: point(a), end: point(center), color: '#91ad5d', linewidth: 3, dashed: true });
      viewer.addLine({ start: point(center), end: point(b), color: '#91ad5d', linewidth: 3, dashed: true });
    }
    viewer.spin(state.spinning ? 'y' : false, .4);
    viewer.render();
  }

  return {
    load, update,
    zoom(factor) { if (available) { viewer.zoom(factor); viewer.render(); } },
    reset() { if (available && initialView) { viewer.setView(initialView); viewer.render(); } },
    dispose() {
      observer.disconnect();
      if (viewer) { viewer.spin(false); viewer.removeAllModels(); viewer.removeAllLabels(); viewer.removeAllShapes(); }
    },
  };
}

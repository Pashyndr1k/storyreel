// The camera view of a shot's layout rendered without the layout window —
// for the agent API, which builds and edits layouts with no window open.
import { createSpatialView } from './scene3d.js';
import { layoutFor, aspectValue } from './layout.js';

// JPEG data URL of the camera view, or null when 3D cannot be drawn.
export function layoutSnapshot(project, scene, shotId, maxWidth = 480) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:640px;height:640px;pointer-events:none;';
  const editorCanvas = document.createElement('canvas');
  const box = document.createElement('div');
  box.style.cssText = 'width:640px;height:640px;';
  const cameraCanvas = document.createElement('canvas');
  box.appendChild(cameraCanvas);
  host.append(editorCanvas, box);
  document.body.appendChild(host);
  let view = null;
  try {
    const aspect = aspectValue(project.aspectRatio);
    view = createSpatialView({ editorCanvas, cameraCanvas });
    view.setLayout(layoutFor(project, scene, shotId), null, aspect);
    view.resize(aspect);
    return view.snapshot(maxWidth) || null;
  } catch {
    return null;
  } finally {
    try {
      view?.dispose();
    } catch {
      // nothing to release
    }
    host.remove();
  }
}

// Bootstrap страницы: размер canvas, один кадр рендера, ресайз, деградация.
// В браузере выполняется автоматически; в тестах вызывается bootstrap(doc, win)
// с подставными document/window — поэтому логика покрывается node:test без jsdom.

import { renderFrame } from './scene.js';
import { sceneContract } from './contract.js';

/**
 * Подключает сцену к DOM-элементам страницы.
 *
 * @param {Document} doc документ с #scene, #caption, #fallback
 * @param {Window} win окно с innerWidth/innerHeight и addEventListener
 * @param {{ draw: Function }} [contract] контракт рендера (src/contract.js);
 *   по умолчанию — общий sceneContract страницы, в тестах — изолированный
 *   экземпляр createSceneContract()
 * @returns {{ render: () => void, contract: object }} кадр для повторной
 *   отрисовки и контракт (для регистрации объектов эпиков 2–4)
 */
export function bootstrap(doc, win, contract = sceneContract) {
  const canvas = doc.getElementById('scene');
  const caption = doc.getElementById('caption');
  const fallback = doc.getElementById('fallback');

  function render() {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Старый браузер без 2D Canvas: текстовая заглушка вместо пустоты,
      // деградация без падения.
      canvas.hidden = true;
      caption.hidden = true;
      fallback.hidden = false;
      return;
    }

    // Ресайз: canvas растягивается на окно; искра позиционируется долями
    // экрана (renderFrame/sparkAt), поэтому остаётся на своём месте.
    canvas.width = win.innerWidth;
    canvas.height = win.innerHeight;
    renderFrame(ctx, canvas.width, canvas.height, 0, contract);
  }

  render();
  win.addEventListener('resize', render);
  return { render, contract };
}

// Точка входа страницы (index.html грузит этот модуль) + общий рендер-хэндл:
// в браузере `page = { render, contract }`, в Node/тестах — null. Поздняя
// регистрация объекта: sceneContract.register(...); page.render() —
// см. docs/contract.md.
export const page = typeof document !== 'undefined' ? bootstrap(document, window) : null;
